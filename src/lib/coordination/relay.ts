import { getProjectAgents, getNextPendingTask, updateProjectTask, insertProjectEvent } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { AUTO_RELAY_CONFIG } from '@/lib/constants';
import { eventBus } from '@/lib/events/event-bus';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import type { AgentRow, EventRow } from '@/lib/db/project-queries';

/**
 * Auto-Relay — Agents keep working until the board is done.
 *
 * When an agent completes, the relay system checks for pending TODO tasks
 * assigned to that agent's role. If found, it auto-relaunches the agent
 * with the next task via the launch API.
 */

// In-memory relay count tracker: { "projectId:agentId": { count, resetDate } }
const relayCounters = new Map<string, { count: number; resetDate: string }>();

function getRelayKey(projectId: string, agentId: string): string {
  return `${projectId}:${agentId}`;
}

function getRelayCount(projectId: string, agentId: string): number {
  const key = getRelayKey(projectId, agentId);
  const today = new Date().toISOString().split('T')[0];
  const entry = relayCounters.get(key);
  if (!entry || entry.resetDate !== today) {
    relayCounters.set(key, { count: 0, resetDate: today });
    return 0;
  }
  return entry.count;
}

function incrementRelayCount(projectId: string, agentId: string): void {
  const key = getRelayKey(projectId, agentId);
  const today = new Date().toISOString().split('T')[0];
  const entry = relayCounters.get(key);
  if (!entry || entry.resetDate !== today) {
    relayCounters.set(key, { count: 1, resetDate: today });
  } else {
    entry.count++;
  }
}

/** Check if an agent should be relayed */
export function shouldRelay(agent: AgentRow, projectId: string): boolean {
  if (!AUTO_RELAY_CONFIG.enabled) return false;
  if (agent.status !== 'completed') return false;
  if (AUTO_RELAY_CONFIG.excludedRoles.includes(agent.role)) return false;
  if (getRelayCount(projectId, agent.agent_id) >= AUTO_RELAY_CONFIG.maxRelaysPerAgent) return false;

  // Check cooldown: agent must have been completed for at least cooldownMs
  if (agent.last_heartbeat) {
    const completedAt = new Date(agent.last_heartbeat).getTime();
    if (Date.now() - completedAt < AUTO_RELAY_CONFIG.cooldownMs) return false;
  }

  return true;
}

/** Get next task for a given role */
export function getNextTaskForRole(projectId: string, role: string) {
  if (!projectTablesExist(projectId)) return undefined;
  return getNextPendingTask(projectId, role);
}

/** Update queue.json when relaying: move task from pending to in_progress */
function syncQueueFile(projectId: string, taskId: string): void {
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();
  if (!project) return;

  const queuePath = path.join(project.coordinationPath, 'queue.json');
  try {
    let queue = { pending: [] as string[], in_progress: [] as string[], completed: [] as string[] };
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    }
    // Remove from pending, add to in_progress
    queue.pending = (queue.pending || []).filter((id: string) => id !== taskId);
    if (!queue.in_progress) queue.in_progress = [];
    if (!queue.in_progress.includes(taskId)) {
      queue.in_progress.push(taskId);
    }
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
  } catch {
    // Non-fatal — DB is the source of truth
  }
}

/** Relaunch an agent with a specific task (direct server-side call) */
async function relaunchAgent(
  projectId: string,
  agent: AgentRow,
  taskId: string,
  taskTitle: string,
): Promise<boolean> {
  try {
    const { launchAgentWithTask } = await import('@/app/api/agents/launch/route');
    return await launchAgentWithTask(projectId, agent.agent_id, taskId, taskTitle);
  } catch (err) {
    console.error('relaunchAgent failed:', err);
    return false;
  }
}

/** Run auto-relay for a project: check completed agents, relaunch with next task */
export async function runAutoRelay(projectId: string): Promise<{ relayed: number; skipped: number; noTasks: number }> {
  if (!AUTO_RELAY_CONFIG.enabled) return { relayed: 0, skipped: 0, noTasks: 0 };
  if (!projectTablesExist(projectId)) return { relayed: 0, skipped: 0, noTasks: 0 };

  const agents = getProjectAgents(projectId);
  let relayed = 0;
  let skipped = 0;
  let noTasks = 0;

  for (const agent of agents) {
    if (!shouldRelay(agent, projectId)) {
      if (agent.status === 'completed') skipped++;
      continue;
    }

    // Find next task for this agent's role
    const nextTask = getNextTaskForRole(projectId, agent.role);
    if (!nextTask) {
      noTasks++;
      continue;
    }

    // Update task status to IN_PROGRESS
    updateProjectTask(projectId, nextTask.id, {
      status: 'IN_PROGRESS',
      assigned_agent: agent.agent_id,
      updated_at: new Date().toISOString(),
    });

    // Sync queue.json
    syncQueueFile(projectId, nextTask.id);

    // Log relay event
    const relayEvent: EventRow = {
      id: `evt-relay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'info',
      agent_id: agent.agent_id,
      agent_role: agent.role,
      message: `Auto-relay: relaunching ${agent.agent_id} with task ${nextTask.id} (${nextTask.title})`,
      details: JSON.stringify({ taskId: nextTask.id, relayCount: getRelayCount(projectId, agent.agent_id) + 1 }),
    };
    insertProjectEvent(projectId, relayEvent);

    eventBus.broadcast('event.created', {
      events: [{
        id: relayEvent.id,
        projectId,
        timestamp: relayEvent.timestamp,
        level: relayEvent.level,
        agentId: agent.agent_id,
        agentRole: agent.role,
        message: relayEvent.message,
      }],
    }, projectId);

    // Attempt relaunch
    const launched = await relaunchAgent(projectId, agent, nextTask.id, nextTask.title);
    if (launched) {
      incrementRelayCount(projectId, agent.agent_id);
      relayed++;
    } else {
      // Revert task status if launch failed
      updateProjectTask(projectId, nextTask.id, {
        status: 'TODO',
        updated_at: new Date().toISOString(),
      });
    }
  }

  return { relayed, skipped, noTasks };
}

/** Get relay status for API/debugging */
export function getRelayStatus() {
  const status: Record<string, { count: number; resetDate: string }> = {};
  for (const [key, val] of relayCounters) {
    status[key] = { ...val };
  }
  return {
    enabled: AUTO_RELAY_CONFIG.enabled,
    maxPerAgent: AUTO_RELAY_CONFIG.maxRelaysPerAgent,
    cooldownMs: AUTO_RELAY_CONFIG.cooldownMs,
    counters: status,
  };
}
