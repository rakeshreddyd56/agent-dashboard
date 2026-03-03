import { getProjectAgents, upsertProjectAgent, insertProjectEvent } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';
import { HEARTBEAT_THRESHOLDS } from '@/lib/constants';
import { execFileSync } from 'child_process';
import type { AgentRow, EventRow } from '@/lib/db/project-queries';

/** Cache tmux session list for the duration of a single check cycle */
let tmuxCache: { sessions: string[]; ts: number } = { sessions: [], ts: 0 };
const TMUX_CACHE_TTL = 10_000; // 10s

function getTmuxSessions(): string[] {
  const now = Date.now();
  if (now - tmuxCache.ts < TMUX_CACHE_TTL) return tmuxCache.sessions;
  try {
    const output = execFileSync('tmux', ['ls'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const sessions = output ? output.split('\n').map((line) => line.split(':')[0]) : [];
    tmuxCache = { sessions, ts: now };
    return sessions;
  } catch {
    tmuxCache = { sessions: [], ts: now };
    return [];
  }
}

/**
 * Check if a tmux session's active process is just sleeping (agent finished).
 * Returns true if the agent process (claude) has exited and only sleep/bash remains.
 */
function isTmuxSessionIdle(sessionName: string): boolean {
  try {
    const output = execFileSync('tmux', ['capture-pane', '-t', sessionName, '-p', '-S', '-5'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const lower = output.toLowerCase();
    return lower.includes('done') || lower.includes('sleep 999') || lower.includes('exited');
  } catch {
    return false;
  }
}

/**
 * Check if a tmux session is actively running a process (not just bash prompt).
 * Uses `list-panes -F` to check current command — if it's claude/node/etc, it's working.
 */
function isTmuxSessionActive(sessionName: string): boolean {
  try {
    // Check what command the pane is running
    const cmd = execFileSync('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_current_command}'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().toLowerCase();

    // If running claude, node, bash (running a script), or any non-trivial process → active
    if (cmd && cmd !== 'bash' && cmd !== 'zsh' && cmd !== 'sh' && cmd !== 'sleep') {
      return true;
    }

    // If the current command is bash/zsh, check pane output for activity signs
    // (agent scripts run via bash, so a bash process might still be active)
    const output = execFileSync('tmux', ['capture-pane', '-t', sessionName, '-p', '-S', '-3'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const lower = output.toLowerCase();
    // Signs the agent is done
    if (lower.includes('done') || lower.includes('sleep 999') || lower.includes('exited')) {
      return false;
    }

    // If there's recent output that isn't just a prompt, agent is likely active
    // Empty output or just a $ prompt means idle
    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return false;

    // Check if last line is just a shell prompt
    const lastLine = lines[lines.length - 1].trim();
    if (/^[$#%>]\s*$/.test(lastLine) || /\$\s*$/.test(lastLine)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Periodic heartbeat check — the single source of truth for agent liveness.
 *
 * Strategy: Instead of blindly marking agents offline when heartbeat is stale,
 * we probe the tmux session to determine actual state:
 *
 * 1. tmux session alive + active process → agent is working, REFRESH heartbeat
 * 2. tmux session alive + idle (DONE/sleep) → agent finished, mark completed
 * 3. tmux session dead → agent finished, mark completed
 * 4. heartbeat fresh → agent is fine, skip
 *
 * This eliminates false "crashed" warnings for long-running agents.
 */
export function checkStaleAgents(projectId: string): void {
  if (!projectTablesExist(projectId)) return;

  const agents = getProjectAgents(projectId);
  if (agents.length === 0) return;

  const now = Date.now();
  const nowIso = new Date().toISOString();
  const tmuxSessions = getTmuxSessions();
  let changed = false;

  for (const agent of agents) {
    // Skip already-terminal agents
    if (agent.status === 'offline' || agent.status === 'completed') continue;

    const hbTime = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
    const isStale = !isNaN(hbTime) && hbTime > 0 && (now - hbTime > HEARTBEAT_THRESHOLDS.warning);

    if (!isStale) continue;

    // Find matching tmux session
    const sessionName = tmuxSessions.find((s) => s.includes(agent.agent_id)) || '';
    const sessionAlive = !!sessionName;

    if (sessionAlive && !isTmuxSessionIdle(sessionName)) {
      // Session is alive and not idle → agent is still working.
      // Refresh heartbeat instead of marking offline (this is the key fix).
      if (isTmuxSessionActive(sessionName)) {
        const refreshedAgent: AgentRow = {
          ...agent,
          last_heartbeat: nowIso,
        };
        upsertProjectAgent(projectId, refreshedAgent);
        changed = true;
        continue;
      }
    }

    // Session is dead OR idle → agent has finished
    const newStatus = 'completed';
    const updatedAgent: AgentRow = {
      ...agent,
      status: newStatus,
    };
    upsertProjectAgent(projectId, updatedAgent);
    changed = true;

    // Emit event only when actually marking completed (not on heartbeat refresh)
    const staleEvent: EventRow = {
      id: `evt-hb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      level: 'info',
      agent_id: agent.agent_id,
      agent_role: agent.role,
      message: `Agent ${agent.agent_id} completed (session ${sessionAlive ? 'idle' : 'ended'})`,
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

    // Proactively trigger auto-relay when agents complete
    try {
      import('@/lib/coordination/relay').then(({ runAutoRelay }) => {
        runAutoRelay(projectId).catch(() => {});
      }).catch(() => {});
    } catch { /* non-fatal */ }
  }
}
