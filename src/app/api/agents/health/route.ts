import { NextRequest, NextResponse } from 'next/server';
import { getProjectAgents, getProjectEvents } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { execFileSync } from 'child_process';
import { HEARTBEAT_THRESHOLDS } from '@/lib/constants';

/**
 * Agent health & failure report endpoint.
 * Designed for Rataa supervisors to quickly identify problems.
 *
 * GET /api/agents/health?projectId=xxx
 *
 * Returns:
 * - agents with health status (healthy, stale, crashed, idle)
 * - recent failure events
 * - tmux session status
 * - actionable recommendations
 */

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

function getTmuxPaneOutput(sessionName: string, lines: number = 5): string {
  try {
    return execFileSync('tmux', ['capture-pane', '-t', sessionName, '-p', '-S', `-${lines}`], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function getTmuxPaneCommand(sessionName: string): string {
  try {
    return execFileSync('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_current_command}'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().toLowerCase();
  } catch {
    return '';
  }
}

type HealthStatus = 'healthy' | 'stale' | 'crashed' | 'idle' | 'initializing' | 'completed';

interface AgentHealth {
  agentId: string;
  role: string;
  dbStatus: string;
  healthStatus: HealthStatus;
  tmuxSession: string | null;
  tmuxAlive: boolean;
  tmuxCommand: string | null;
  lastHeartbeat: string | null;
  heartbeatAge: string;
  currentTask: string | null;
  lastOutput: string | null;
  issue: string | null;
  recommendation: string | null;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (!projectTablesExist(projectId)) {
    return NextResponse.json({ agents: [], failures: [], summary: 'No project tables' });
  }

  const agents = getProjectAgents(projectId);
  const tmuxSessions = getTmuxSessions();
  const now = Date.now();

  const healthReport: AgentHealth[] = [];
  const failures: { agentId: string; issue: string; timestamp: string }[] = [];
  let healthyCount = 0;
  let problemCount = 0;

  for (const agent of agents) {
    const sessionName = tmuxSessions.find((s) => s === agent.agent_id || s.endsWith('-' + agent.agent_id)) || null;
    const tmuxAlive = !!sessionName;
    const tmuxCommand = sessionName ? getTmuxPaneCommand(sessionName) : null;
    const lastOutput = sessionName ? getTmuxPaneOutput(sessionName, 5) : null;

    const hbTime = agent.last_heartbeat ? new Date(agent.last_heartbeat).getTime() : 0;
    const hbAgeMs = hbTime > 0 ? now - hbTime : -1;
    const hbAgeStr = hbAgeMs < 0
      ? 'never'
      : hbAgeMs < 60_000
        ? `${Math.round(hbAgeMs / 1000)}s ago`
        : hbAgeMs < 3_600_000
          ? `${Math.round(hbAgeMs / 60_000)}m ago`
          : `${Math.round(hbAgeMs / 3_600_000)}h ago`;

    let healthStatus: HealthStatus;
    let issue: string | null = null;
    let recommendation: string | null = null;

    if (agent.status === 'completed' || agent.status === 'offline') {
      healthStatus = 'completed';
      // Check if it completed too quickly (possible crash)
      const createdTime = agent.created_at ? new Date(agent.created_at).getTime() : 0;
      const lifetimeMs = createdTime > 0 ? now - createdTime : 0;
      if (lifetimeMs > 0 && lifetimeMs < 120_000 && agent.status === 'completed') {
        healthStatus = 'crashed';
        issue = `Agent completed in ${Math.round(lifetimeMs / 1000)}s — likely crashed or had no work`;
        recommendation = 'Check tmux log at /tmp/<session>.log. May need task assignment or prompt fix.';
        problemCount++;
        failures.push({ agentId: agent.agent_id, issue, timestamp: agent.last_heartbeat || '' });
      }
    } else if (agent.status === 'initializing') {
      const createdTime = agent.created_at ? new Date(agent.created_at).getTime() : 0;
      const initAgeMs = createdTime > 0 ? now - createdTime : 0;

      if (!tmuxAlive) {
        healthStatus = 'crashed';
        issue = 'Status is initializing but tmux session is dead — launch failed';
        recommendation = 'Respawn this agent. Check /tmp/<prefix>-<role>.log for errors.';
        problemCount++;
        failures.push({ agentId: agent.agent_id, issue, timestamp: new Date().toISOString() });
      } else if (initAgeMs > 300_000) {
        healthStatus = 'stale';
        issue = `Stuck in initializing for ${Math.round(initAgeMs / 60_000)}m — may be hung`;
        recommendation = 'Check tmux output. Kill and respawn if stuck.';
        problemCount++;
        failures.push({ agentId: agent.agent_id, issue, timestamp: new Date().toISOString() });
      } else {
        healthStatus = 'initializing';
        healthyCount++;
      }
    } else if (agent.status === 'working' || agent.status === 'planning' || agent.status === 'reviewing') {
      // Supervisors run in a loop with sleep between iterations — treat as healthy if tmux is alive
      const isSupervisorRole = agent.role === 'supervisor' || agent.role === 'supervisor-2';
      if (!tmuxAlive) {
        healthStatus = 'crashed';
        issue = `Status is ${agent.status} but tmux session is dead`;
        recommendation = 'Agent crashed. Respawn with current task.';
        problemCount++;
        failures.push({ agentId: agent.agent_id, issue, timestamp: new Date().toISOString() });
      } else if (isSupervisorRole) {
        // Supervisors sleep 60s between loop iterations — stale heartbeat is normal
        healthStatus = 'healthy';
        healthyCount++;
      } else if (hbAgeMs > HEARTBEAT_THRESHOLDS.warning * 2) {
        healthStatus = 'stale';
        issue = `Heartbeat stale (${hbAgeStr}), may be stuck`;
        recommendation = 'Check tmux output for errors. Consider killing and respawning.';
        problemCount++;
        failures.push({ agentId: agent.agent_id, issue, timestamp: new Date().toISOString() });
      } else if (lastOutput && (lastOutput.toLowerCase().includes('error') || lastOutput.toLowerCase().includes('fatal'))) {
        healthStatus = 'stale';
        issue = 'Recent output contains errors';
        recommendation = 'Review tmux output. Agent may need assistance or task reassignment.';
        problemCount++;
        failures.push({ agentId: agent.agent_id, issue, timestamp: new Date().toISOString() });
      } else {
        healthStatus = 'healthy';
        healthyCount++;
      }
    } else {
      healthStatus = 'idle';
    }

    healthReport.push({
      agentId: agent.agent_id,
      role: agent.role,
      dbStatus: agent.status,
      healthStatus,
      tmuxSession: sessionName,
      tmuxAlive,
      tmuxCommand,
      lastHeartbeat: agent.last_heartbeat,
      heartbeatAge: hbAgeStr,
      currentTask: agent.current_task,
      lastOutput: lastOutput ? lastOutput.split('\n').slice(-3).join('\n') : null,
      issue,
      recommendation,
    });
  }

  // Get recent failure/completion events
  let recentEvents: { id: string; timestamp: string; message: string; level: string }[] = [];
  try {
    const events = getProjectEvents(projectId);
    recentEvents = events
      .filter((e) => {
        const age = now - new Date(e.timestamp).getTime();
        return age < 3_600_000; // Last hour
      })
      .filter((e) => e.level === 'error' || e.level === 'warn' || e.message.includes('completed') || e.message.includes('crashed'))
      .slice(-20)
      .map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        message: e.message,
        level: e.level,
      }));
  } catch { /* non-fatal */ }

  // Build actionable summary
  const summaryParts: string[] = [];
  summaryParts.push(`${healthyCount} healthy, ${problemCount} problems, ${agents.length} total`);
  if (failures.length > 0) {
    summaryParts.push(`ISSUES: ${failures.map((f) => `${f.agentId}: ${f.issue}`).join('; ')}`);
  }

  return NextResponse.json({
    agents: healthReport,
    failures,
    recentEvents,
    summary: summaryParts.join('. '),
    counts: {
      total: agents.length,
      healthy: healthyCount,
      problems: problemCount,
      completed: agents.filter((a) => a.status === 'completed' || a.status === 'offline').length,
    },
  });
}
