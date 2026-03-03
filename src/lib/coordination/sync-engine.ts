import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
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
import {
  bulkUpsertProjectAgents,
  replaceProjectLocks,
  bulkReplaceProjectTasks,
  insertProjectEvent,
  bulkInsertProjectEvents,
  insertProjectAnalytics,
  getProjectTasks,
  getProjectAgents,
} from '@/lib/db/project-queries';
import { createProjectTables, projectTablesExist } from '@/lib/db/dynamic-tables';
import type { AgentRow, EventRow, LockRow, TaskRow } from '@/lib/db/project-queries';
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

  // Ensure per-project tables exist
  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  // 1. Sync agents from registry + health
  const agents = parseRegistry(coordinationPath, projectId);
  const heartbeats = parseHealth(coordinationPath, projectId);

  // Merge heartbeats into agents
  for (const agent of agents) {
    const hb = heartbeats.get(agent.id);
    if (hb) agent.lastHeartbeat = hb;
  }

  // Preserve existing DB status for completed/offline agents.
  // Do NOT mark agents offline based on heartbeat alone — that's handled by
  // heartbeat-checker.ts which actively probes tmux sessions to determine
  // if the agent is truly done or still working.
  const existingAgents = getProjectAgents(projectId);
  const existingStatusMap = new Map(existingAgents.map((a) => [a.agent_id, a.status]));
  const existingHbMap = new Map(existingAgents.map((a) => [a.agent_id, a.last_heartbeat]));
  for (const agent of agents) {
    const dbStatus = existingStatusMap.get(agent.agentId);
    // Preserve completed/offline status from DB
    if (dbStatus === 'completed' || dbStatus === 'offline') {
      agent.status = dbStatus;
      continue;
    }
    // If heartbeat-checker has refreshed the heartbeat (via tmux probe),
    // use the DB heartbeat if it's newer than the file-based one
    const dbHb = existingHbMap.get(agent.agentId);
    if (dbHb && agent.lastHeartbeat) {
      const dbTime = new Date(dbHb).getTime();
      const fileTime = new Date(agent.lastHeartbeat).getTime();
      if (!isNaN(dbTime) && !isNaN(fileTime) && dbTime > fileTime) {
        agent.lastHeartbeat = dbHb;
      }
    }
  }
  // No stale marking here — heartbeat-checker handles it with tmux probing
  const staleAgentIds: string[] = [];

  // Upsert agents into per-project table
  const agentRows: AgentRow[] = agents.map((a) => ({
    id: a.id,
    agent_id: a.agentId,
    role: a.role,
    status: a.status,
    current_task: a.currentTask || null,
    model: a.model || null,
    session_start: a.sessionStart || null,
    last_heartbeat: a.lastHeartbeat || null,
    locked_files: JSON.stringify(a.lockedFiles),
    progress: a.progress ?? null,
    estimated_cost: a.estimatedCost ?? null,
    created_at: a.createdAt,
  }));

  bulkUpsertProjectAgents(projectId, agentRows);
  eventBus.broadcast('agent.synced', { agents, staleAgentIds }, projectId);

  // Emit warning events for stale agents
  for (const agentId of staleAgentIds) {
    const staleEvent: EventRow = {
      id: `${projectId}-evt-stale-${agentId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'warning',
      agent_id: agentId,
      agent_role: null,
      message: `Agent ${agentId} may have crashed (no heartbeat for >5 minutes)`,
      details: null,
    };
    insertProjectEvent(projectId, staleEvent);

    eventBus.broadcast('agent.heartbeat_lost', {
      events: [{
        id: staleEvent.id,
        projectId,
        timestamp: staleEvent.timestamp,
        level: staleEvent.level,
        agentId,
        message: staleEvent.message,
      }],
    }, projectId);
  }

  // 2. Sync file locks into per-project table
  const locks = parseLocks(coordinationPath, projectId);
  const lockRows: LockRow[] = locks.map((l) => ({
    id: l.id,
    file_path: l.filePath,
    agent_id: l.agentId,
    agent_role: l.agentRole,
    locked_at: l.lockedAt,
  }));
  replaceProjectLocks(projectId, lockRows);
  eventBus.broadcast('lock.updated', { locks }, projectId);

  // 3. Sync tasks from queue.json and TASKS.md into per-project table
  // Deduplicate: same task can appear in both sources. TASKS.md is
  // authoritative for metadata, queue.json for status.
  const queueTasks = parseQueue(coordinationPath, projectId);
  const mdTasks = parseTasksMd(projectPath, projectId);

  const mdByExtId = new Map<string, typeof mdTasks[0]>();
  for (const t of mdTasks) {
    if (t.externalId) mdByExtId.set(t.externalId, t);
  }

  const mergedTasks: typeof mdTasks = [];
  const seenExtIds = new Set<string>();

  for (const qt of queueTasks) {
    const extId = qt.externalId;
    if (extId && mdByExtId.has(extId)) {
      // Merge: md metadata + queue status override
      const md = mdByExtId.get(extId)!;
      mergedTasks.push({
        ...md,
        status: qt.status, // queue.json status is more current
        assignedAgent: qt.assignedAgent || md.assignedAgent,
        source: 'tasks_md' as const,
      });
      seenExtIds.add(extId);
    } else {
      mergedTasks.push(qt);
    }
  }

  // Add remaining TASKS.md tasks not in queue
  for (const mt of mdTasks) {
    if (mt.externalId && seenExtIds.has(mt.externalId)) continue;
    mergedTasks.push(mt);
  }

  // Convert to TaskRow format
  const coordTaskRows: TaskRow[] = mergedTasks.map((t) => ({
    id: t.id,
    external_id: t.externalId || null,
    title: t.title,
    description: t.description || null,
    status: t.status,
    priority: t.priority,
    assigned_agent: t.assignedAgent || null,
    tags: JSON.stringify(t.tags),
    effort: t.effort || null,
    dependencies: JSON.stringify(t.dependencies),
    source: t.source,
    column_order: t.columnOrder,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }));

  // Replace coordination-sourced tasks, then tasks_md-sourced tasks
  bulkReplaceProjectTasks(projectId, coordTaskRows.filter((t) => t.source === 'coordination'), 'coordination');
  bulkReplaceProjectTasks(projectId, coordTaskRows.filter((t) => t.source === 'tasks_md'), 'tasks_md');

  eventBus.broadcast('task.synced', { tasks: mergedTasks }, projectId);

  // 4. Sync events (incremental) into per-project table
  const currentOffset = eventOffsets.get(projectId) || 0;
  const { events: newEvents, newOffset } = parseEventsLog(coordinationPath, projectId, currentOffset);
  eventOffsets.set(projectId, newOffset);

  if (newEvents.length > 0) {
    const eventRows: EventRow[] = newEvents.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      level: e.level,
      agent_id: e.agentId || null,
      agent_role: e.agentRole || null,
      message: e.message,
      details: e.details || null,
    }));
    bulkInsertProjectEvents(projectId, eventRows);
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

    if (newProgressEvents.length > 0) {
      const progressRows: EventRow[] = newProgressEvents.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        level: e.level,
        agent_id: e.agentId || null,
        agent_role: e.agentRole || null,
        message: e.message,
        details: e.details || null,
      }));
      bulkInsertProjectEvents(projectId, progressRows);
      eventBus.broadcast('event.created', { events: newProgressEvents }, projectId);
    }
  }

  // 5. Update analytics snapshot in per-project table
  const taskRows = getProjectTasks(projectId);
  const currentAgentRows = getProjectAgents(projectId);

  const activeAgents = currentAgentRows.filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length;
  const inProgress = taskRows.filter((t) => t.status === 'IN_PROGRESS').length;
  const completed = taskRows.filter((t) => t.status === 'DONE').length;
  const total = taskRows.length;

  insertProjectAnalytics(projectId, {
    id: `${projectId}-snap-${Date.now()}`,
    timestamp: new Date().toISOString(),
    active_agents: activeAgents,
    tasks_in_progress: inProgress,
    tasks_completed: completed,
    total_tasks: total,
    estimated_cost: currentAgentRows.reduce((sum, a) => sum + (a.estimated_cost || 0), 0),
  });

  eventBus.broadcast('sync.complete', { projectId }, projectId);
}
