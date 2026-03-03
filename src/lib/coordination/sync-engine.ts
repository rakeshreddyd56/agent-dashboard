import { db, schema } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';
import {
  parseRegistry,
  parseHealth,
  parseLocks,
  parseQueue,
  parseEventsLog,
  parseTasksMd,
  parseProgressTxt,
} from './parsers';
import { HEARTBEAT_THRESHOLDS } from '@/lib/constants';
import type { Project } from '@/lib/types';

// Track event log byte offsets per project
const eventOffsets = new Map<string, number>();
// Track progress.txt entries already inserted (by message hash)
const progressSeen = new Map<string, Set<string>>();

/** Clean up in-memory state for a removed project */
export function cleanupProject(projectId: string) {
  eventOffsets.delete(projectId);
  progressSeen.delete(projectId);
}

export async function syncProject(project: Project) {
  const { id: projectId, path: projectPath, coordinationPath } = project;

  // Guard: ensure project row exists before inserting FK-linked rows
  const projectRow = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!projectRow) {
    console.warn(`syncProject: skipping ${projectId} — project row not found`);
    return;
  }

  // 1. Sync agents from registry + health
  const agents = parseRegistry(coordinationPath, projectId);
  const heartbeats = parseHealth(coordinationPath, projectId);

  // Merge heartbeats into agents
  for (const agent of agents) {
    const hb = heartbeats.get(agent.id);
    if (hb) agent.lastHeartbeat = hb;
  }

  // Detect stale heartbeats (>5min for non-completed agents)
  const now = Date.now();
  const staleAgentIds: string[] = [];
  for (const agent of agents) {
    if (agent.status === 'completed' || agent.status === 'offline') continue;
    if (agent.lastHeartbeat) {
      const hbTime = new Date(agent.lastHeartbeat).getTime();
      if (!isNaN(hbTime) && now - hbTime > HEARTBEAT_THRESHOLDS.warning) {
        agent.status = 'offline';
        staleAgentIds.push(agent.agentId);
      }
    }
  }

  // Upsert agents in a transaction to prevent partial updates
  // Batch-fetch existing agent IDs to avoid N+1 queries
  const agentIds = agents.map((a) => a.id);
  const existingAgents = agentIds.length > 0
    ? new Set(
        db.select({ id: schema.agentSnapshots.id })
          .from(schema.agentSnapshots)
          .where(inArray(schema.agentSnapshots.id, agentIds))
          .all()
          .map((r) => r.id)
      )
    : new Set<string>();

  db.transaction((tx) => {
    for (const agent of agents) {
      if (existingAgents.has(agent.id)) {
        tx.update(schema.agentSnapshots)
          .set({
            status: agent.status,
            currentTask: agent.currentTask,
            lastHeartbeat: agent.lastHeartbeat,
            lockedFiles: JSON.stringify(agent.lockedFiles),
            progress: agent.progress,
            estimatedCost: agent.estimatedCost,
            createdAt: agent.createdAt,
          })
          .where(eq(schema.agentSnapshots.id, agent.id))
          .run();
      } else {
        tx.insert(schema.agentSnapshots)
          .values({
            id: agent.id,
            projectId: agent.projectId,
            agentId: agent.agentId,
            role: agent.role,
            status: agent.status,
            currentTask: agent.currentTask,
            model: agent.model,
            sessionStart: agent.sessionStart,
            lastHeartbeat: agent.lastHeartbeat,
            lockedFiles: JSON.stringify(agent.lockedFiles),
            progress: agent.progress,
            estimatedCost: agent.estimatedCost,
            createdAt: agent.createdAt,
          })
          .run();
      }
    }
  });

  eventBus.broadcast('agent.synced', { agents, staleAgentIds }, projectId);

  // Emit warning events for stale agents
  for (const agentId of staleAgentIds) {
    eventBus.broadcast('agent.heartbeat_lost', {
      events: [{
        id: `${projectId}-evt-stale-${agentId}-${Date.now()}`,
        projectId,
        timestamp: new Date().toISOString(),
        level: 'warning',
        agentId,
        message: `Agent ${agentId} may have crashed (no heartbeat for >5 minutes)`,
      }],
    }, projectId);
  }

  // 2. Sync file locks (in transaction to prevent partial state)
  const locks = parseLocks(coordinationPath, projectId);
  db.transaction((tx) => {
    tx.delete(schema.fileLocks).where(eq(schema.fileLocks.projectId, projectId)).run();
    for (const lock of locks) {
      tx.insert(schema.fileLocks).values(lock).run();
    }
  });
  eventBus.broadcast('lock.updated', { locks }, projectId);

  // 3. Sync tasks from queue.json and TASKS.md (preserve dashboard tasks)
  const queueTasks = parseQueue(coordinationPath, projectId);
  const mdTasks = parseTasksMd(projectPath, projectId);
  const allTasks = [...queueTasks, ...mdTasks];

  // Only delete coordination + tasks_md sourced tasks — preserve dashboard-created tasks
  // First get IDs of tasks to delete (to clean up FK-dependent rows)
  const tasksToDelete = db.select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, projectId),
        inArray(schema.tasks.source, ['coordination', 'tasks_md'])
      )
    )
    .all()
    .map((r) => r.id);

  // Delete and re-insert coordination tasks in a transaction
  db.transaction((tx) => {
    if (tasksToDelete.length > 0) {
      // Delete dependent rows first to avoid FK constraint violations
      tx.delete(schema.taskComments)
        .where(inArray(schema.taskComments.taskId, tasksToDelete))
        .run();
      tx.delete(schema.qualityReviews)
        .where(inArray(schema.qualityReviews.taskId, tasksToDelete))
        .run();
      tx.delete(schema.tasks)
        .where(inArray(schema.tasks.id, tasksToDelete))
        .run();
    }

    for (const task of allTasks) {
      tx.insert(schema.tasks)
        .values({
          id: task.id,
          projectId: task.projectId,
          externalId: task.externalId,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignedAgent: task.assignedAgent,
          tags: JSON.stringify(task.tags),
          effort: task.effort,
          dependencies: JSON.stringify(task.dependencies),
          source: task.source,
          columnOrder: task.columnOrder,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })
        .run();
    }
  });

  eventBus.broadcast('task.synced', { tasks: allTasks }, projectId);

  // 4. Sync events (incremental)
  const currentOffset = eventOffsets.get(projectId) || 0;
  const { events: newEvents, newOffset } = parseEventsLog(coordinationPath, projectId, currentOffset);
  eventOffsets.set(projectId, newOffset);

  for (const event of newEvents) {
    db.insert(schema.events).values(event).run();
  }

  if (newEvents.length > 0) {
    eventBus.broadcast('event.created', { events: newEvents }, projectId);
  }

  // 4b. Sync progress.txt (deduplicated)
  const progressEvents = parseProgressTxt(projectPath, projectId);
  if (progressEvents.length > 0) {
    if (!progressSeen.has(projectId)) {
      progressSeen.set(projectId, new Set());
    }
    const seen = progressSeen.get(projectId)!;

    // Cap progressSeen to 500 entries per project to prevent memory leaks
    if (seen.size > 500) {
      const entries = Array.from(seen);
      const toRemove = entries.slice(0, entries.length - 400);
      for (const key of toRemove) seen.delete(key);
    }

    const newProgressEvents = progressEvents.filter((e) => {
      const key = e.message;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const event of newProgressEvents) {
      db.insert(schema.events).values(event).run();
    }

    if (newProgressEvents.length > 0) {
      eventBus.broadcast('event.created', { events: newProgressEvents }, projectId);
    }
  }

  // 5. Update analytics snapshot
  const taskRows = db.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId)).all();
  const agentRows = db.select().from(schema.agentSnapshots).where(eq(schema.agentSnapshots.projectId, projectId)).all();

  const activeAgents = agentRows.filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length;
  const inProgress = taskRows.filter((t) => t.status === 'IN_PROGRESS').length;
  const completed = taskRows.filter((t) => t.status === 'DONE').length;
  const total = taskRows.length;

  db.insert(schema.analyticsSnapshots)
    .values({
      id: `${projectId}-snap-${Date.now()}`,
      projectId,
      timestamp: new Date().toISOString(),
      activeAgents,
      tasksInProgress: inProgress,
      tasksCompleted: completed,
      totalTasks: total,
      estimatedCost: agentRows.reduce((sum, a) => sum + (a.estimatedCost || 0), 0),
    })
    .run();

  eventBus.broadcast('sync.complete', { projectId }, projectId);
}
