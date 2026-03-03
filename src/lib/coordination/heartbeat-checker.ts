import { getProjectAgents, upsertProjectAgent, insertProjectEvent } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';
import { HEARTBEAT_THRESHOLDS } from '@/lib/constants';
import { execFileSync } from 'child_process';
import type { AgentRow, EventRow } from '@/lib/db/project-queries';

function getTmuxSessions(): string[] {
  try {
    const output = execFileSync('tmux', ['ls'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!output) return [];
    return output.split('\n').map((line) => line.split(':')[0]);
  } catch {
    return [];
  }
}

/**
 * Periodic heartbeat check — runs independently of file-watcher.
 * Detects agents whose heartbeat is stale and marks them offline/completed.
 * Also checks if the tmux session is still alive.
 */
export function checkStaleAgents(projectId: string): void {
  if (!projectTablesExist(projectId)) return;

  const agents = getProjectAgents(projectId);
  if (agents.length === 0) return;

  const now = Date.now();
  const tmuxSessions = getTmuxSessions();
  let changed = false;

  for (const agent of agents) {
    // Skip already-terminal agents
    if (agent.status === 'offline' || agent.status === 'completed') continue;

    const hbTime = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
    const isStale = !isNaN(hbTime) && hbTime > 0 && (now - hbTime > HEARTBEAT_THRESHOLDS.warning);

    if (!isStale) continue;

    // Check if the tmux session is still alive
    const sessionAlive = tmuxSessions.some((s) => s.includes(agent.agent_id));

    // If tmux session is dead and heartbeat is stale → completed
    // If tmux session is alive but heartbeat stale → offline (might be stuck)
    const newStatus = sessionAlive ? 'offline' : 'completed';

    const updatedAgent: AgentRow = {
      ...agent,
      status: newStatus,
    };
    upsertProjectAgent(projectId, updatedAgent);
    changed = true;

    // Emit event
    const staleEvent: EventRow = {
      id: `evt-hb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'warning',
      agent_id: agent.agent_id,
      agent_role: agent.role,
      message: `Agent ${agent.agent_id} marked ${newStatus} (no heartbeat since ${agent.last_heartbeat})`,
      details: null,
    };
    insertProjectEvent(projectId, staleEvent);

    eventBus.broadcast('event.created', {
      events: [{
        id: staleEvent.id,
        projectId,
        timestamp: staleEvent.timestamp,
        level: staleEvent.level,
        agentId: agent.agent_id,
        agentRole: agent.role,
        message: staleEvent.message,
      }],
    }, projectId);
  }

  // Broadcast updated agent list if anything changed
  if (changed) {
    const updatedAgents = getProjectAgents(projectId);
    const mapped = updatedAgents.map((a) => ({
      id: a.id,
      projectId,
      agentId: a.agent_id,
      role: a.role,
      status: a.status,
      currentTask: a.current_task,
      model: a.model,
      sessionStart: a.session_start,
      lastHeartbeat: a.last_heartbeat,
      lockedFiles: JSON.parse(a.locked_files || '[]'),
      progress: a.progress,
      estimatedCost: a.estimated_cost,
      createdAt: a.created_at,
    }));
    eventBus.broadcast('agent.synced', { agents: mapped }, projectId);
  }
}
