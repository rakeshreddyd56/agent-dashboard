import { upsertProjectAgent, insertProjectEvent } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';
import { SDK_CONFIG } from '@/lib/constants';
import { getSpawnEnv } from '@/lib/sdk/spawn-env';
import { execFile } from 'child_process';
import type { AgentRow, EventRow } from '@/lib/db/project-queries';

export interface SDKLaunchOptions {
  projectId: string;
  role: string;
  systemPrompt: string;
  prompt: string;
  model?: string;
  cwd: string;
  maxBudgetUsd?: number;
  allowedTools?: string[];
  coordinationPath: string;
  worktreePath?: string;
  worktreeBranch?: string;
}

interface SDKSession {
  process: ReturnType<typeof execFile>;
  agentId: string;
  projectId: string;
  startedAt: number;
  heartbeatInterval: ReturnType<typeof setInterval>;
}

// In-memory tracking of active SDK sessions
const activeSessions = new Map<string, SDKSession>();

/**
 * Get count of currently running SDK agents.
 */
export function getActiveSDKSessionCount(): number {
  return activeSessions.size;
}

/**
 * Get status of a specific SDK session.
 */
export function getSDKSessionStatus(sessionId: string): 'running' | 'not_found' {
  return activeSessions.has(sessionId) ? 'running' : 'not_found';
}

/**
 * List all active SDK sessions.
 */
export function listActiveSDKSessions(): { sessionId: string; agentId: string; projectId: string; startedAt: number }[] {
  return Array.from(activeSessions.entries()).map(([sessionId, session]) => ({
    sessionId,
    agentId: session.agentId,
    projectId: session.projectId,
    startedAt: session.startedAt,
  }));
}

/**
 * Launch an agent using the Claude CLI in SDK-like mode.
 * Uses `claude` CLI with `--output-format json` for structured output.
 * Non-blocking — spawns the process and returns immediately.
 */
export async function launchAgentWithSDK(options: SDKLaunchOptions): Promise<{
  sessionId: string;
  agentId: string;
}> {
  const {
    projectId,
    role,
    systemPrompt,
    prompt,
    model = SDK_CONFIG.defaultModel,
    cwd,
    maxBudgetUsd = SDK_CONFIG.maxBudgetUsd,
    allowedTools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
    worktreePath,
    worktreeBranch,
  } = options;

  // Enforce max concurrent limit
  if (activeSessions.size >= SDK_CONFIG.maxConcurrentSdkAgents) {
    throw new Error(`Max concurrent SDK agents (${SDK_CONFIG.maxConcurrentSdkAgents}) reached`);
  }

  const sessionId = `sdk-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const agentId = role;
  const now = new Date().toISOString();

  // Ensure project tables exist
  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  // Register agent immediately in DB
  const agentRow: AgentRow = {
    id: `${projectId}-${agentId}`,
    agent_id: agentId,
    role,
    status: 'initializing',
    current_task: null,
    model,
    session_start: now,
    last_heartbeat: now,
    locked_files: '[]',
    progress: 0,
    estimated_cost: 0,
    created_at: now,
    launch_mode: 'sdk',
    sdk_session_id: sessionId,
    hook_enabled: 1,
    worktree_path: worktreePath || null,
    worktree_branch: worktreeBranch || null,
  };
  upsertProjectAgent(projectId, agentRow);

  // Broadcast immediate update
  eventBus.broadcast('agent.updated', {
    projectId,
    agentId,
    id: agentRow.id,
    role,
    status: 'initializing',
    launchMode: 'sdk',
    sdkSessionId: sessionId,
    sessionStart: now,
    lastHeartbeat: now,
  }, projectId);

  // Spawn async CLI process (non-blocking)
  const agentCwd = worktreePath || cwd;
  const args = [
    '-p', prompt,
    '--system-prompt', systemPrompt,
    '--allowedTools', allowedTools.join(','),
    '--model', model,
    '--max-budget-usd', String(maxBudgetUsd),
  ];

  const childProcess = execFile('claude', args, {
    cwd: agentCwd,
    timeout: 30 * 60 * 1000, // 30 min max
    maxBuffer: 50 * 1024 * 1024, // 50MB
    env: getSpawnEnv(),
  }, (error, stdout, stderr) => {
    // Process completed — clear heartbeat interval and remove session
    const session = activeSessions.get(sessionId);
    if (session?.heartbeatInterval) clearInterval(session.heartbeatInterval);
    activeSessions.delete(sessionId);
    const completedAt = new Date().toISOString();

    if (error) {
      // Error or timeout
      const updatedAgent: AgentRow = {
        ...agentRow,
        status: 'blocked',
        last_heartbeat: completedAt,
      };
      upsertProjectAgent(projectId, updatedAgent);

      const errEvent: EventRow = {
        id: `evt-sdk-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: completedAt,
        level: 'error',
        agent_id: agentId,
        agent_role: role,
        message: `SDK agent ${agentId} error: ${error.message?.slice(0, 200)}`,
        details: stderr?.slice(0, 1000) || null,
      };
      insertProjectEvent(projectId, errEvent);
      eventBus.broadcast('event.created', { events: [errEvent] }, projectId);
    } else {
      // Success
      const updatedAgent: AgentRow = {
        ...agentRow,
        status: 'completed',
        last_heartbeat: completedAt,
      };
      upsertProjectAgent(projectId, updatedAgent);

      const doneEvent: EventRow = {
        id: `evt-sdk-done-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: completedAt,
        level: 'success',
        agent_id: agentId,
        agent_role: role,
        message: `SDK agent ${agentId} completed successfully`,
        details: stdout?.slice(0, 1000) || null,
      };
      insertProjectEvent(projectId, doneEvent);
      eventBus.broadcast('event.created', { events: [doneEvent] }, projectId);
    }

    // Broadcast agent sync
    eventBus.broadcast('agent.status_changed', {
      projectId,
      agentId,
      status: error ? 'blocked' : 'completed',
    }, projectId);

    // Trigger relay
    triggerRelay(projectId);
  });

  // Periodic heartbeat refresh (every 60s) so heartbeat checker doesn't mark us stale
  const heartbeatInterval = setInterval(() => {
    if (!activeSessions.has(sessionId)) {
      clearInterval(heartbeatInterval);
      return;
    }
    const hbNow = new Date().toISOString();
    const hbAgent: AgentRow = { ...agentRow, status: 'working', last_heartbeat: hbNow };
    upsertProjectAgent(projectId, hbAgent);
  }, 60_000);

  // Track the session
  activeSessions.set(sessionId, {
    process: childProcess,
    agentId,
    projectId,
    startedAt: Date.now(),
    heartbeatInterval,
  });

  // Update status to working after a short delay
  setTimeout(() => {
    if (activeSessions.has(sessionId)) {
      const workingAgent: AgentRow = {
        ...agentRow,
        status: 'working',
        last_heartbeat: new Date().toISOString(),
      };
      upsertProjectAgent(projectId, workingAgent);
      eventBus.broadcast('agent.status_changed', {
        projectId, agentId, status: 'working',
      }, projectId);
    }
  }, 3000);

  return { sessionId, agentId };
}

/**
 * Cancel an active SDK session.
 */
export function cancelSDKSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  try {
    if (session.heartbeatInterval) clearInterval(session.heartbeatInterval);
    session.process.kill('SIGTERM');
    activeSessions.delete(sessionId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch a team using the --agents flag for native Claude Code subagent coordination.
 * Reads agent definitions from .claude/agents/{role}.md and builds the --agents JSON.
 * Spawns a single process — the lead agent orchestrates subagents automatically.
 */
export async function launchWithSubagents(options: {
  projectId: string;
  leadRole: string;
  subagentRoles: string[];
  prompt: string;
  cwd: string;
  maxBudgetUsd?: number;
  coordinationPath: string;
}): Promise<{ sessionId: string; agentId: string }> {
  const {
    projectId,
    leadRole,
    subagentRoles,
    prompt,
    cwd,
    maxBudgetUsd = SDK_CONFIG.maxBudgetUsd,
    coordinationPath,
  } = options;

  if (activeSessions.size >= SDK_CONFIG.maxConcurrentSdkAgents) {
    throw new Error(`Max concurrent SDK agents (${SDK_CONFIG.maxConcurrentSdkAgents}) reached`);
  }

  // Build --agents JSON from .claude/agents/ definitions
  const agentsDir = require('path').join(cwd, '.claude', 'agents');
  const agentsJson: Record<string, { description: string; prompt: string; model?: string; tools?: string[] }> = {};

  for (const role of subagentRoles) {
    const agentFile = require('path').join(agentsDir, `${role}.md`);
    try {
      const content = require('fs').readFileSync(agentFile, 'utf-8');
      // Parse YAML frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (fmMatch) {
        const frontmatter = fmMatch[1];
        const body = fmMatch[2].trim();
        const descMatch = frontmatter.match(/description:\s*"?([^"\n]+)"?/);
        const modelMatch = frontmatter.match(/model:\s*(\S+)/);
        agentsJson[role] = {
          description: descMatch?.[1] || `Agent ${role}`,
          prompt: body.slice(0, 4000), // Truncate for CLI arg limits
          model: modelMatch?.[1] || 'sonnet',
        };
      }
    } catch {
      // Skip agents without definition files
    }
  }

  if (Object.keys(agentsJson).length === 0) {
    throw new Error('No valid agent definitions found for the specified roles');
  }

  const sessionId = `team-${leadRole}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const agentId = leadRole;
  const now = new Date().toISOString();

  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  // Register lead agent
  const agentRow: AgentRow = {
    id: `${projectId}-${agentId}`,
    agent_id: agentId,
    role: leadRole,
    status: 'initializing',
    current_task: null,
    model: 'opus',
    session_start: now,
    last_heartbeat: now,
    locked_files: '[]',
    progress: 0,
    estimated_cost: 0,
    created_at: now,
    launch_mode: 'sdk',
    sdk_session_id: sessionId,
    hook_enabled: 1,
    worktree_path: null,
    worktree_branch: null,
  };
  upsertProjectAgent(projectId, agentRow);

  eventBus.broadcast('agent.updated', {
    projectId, agentId, id: agentRow.id, role: leadRole,
    status: 'initializing', launchMode: 'subagents', sdkSessionId: sessionId,
  }, projectId);

  const args = [
    '-p', prompt,
    '--model', 'opus',
    '--max-budget-usd', String(maxBudgetUsd),
    '--agents', JSON.stringify(agentsJson),
  ];

  const childProcess = execFile('claude', args, {
    cwd,
    timeout: 60 * 60 * 1000, // 1 hour for team work
    maxBuffer: 100 * 1024 * 1024,
    env: getSpawnEnv(),
  }, (error, stdout, stderr) => {
    const session = activeSessions.get(sessionId);
    if (session?.heartbeatInterval) clearInterval(session.heartbeatInterval);
    activeSessions.delete(sessionId);
    const completedAt = new Date().toISOString();

    const updatedAgent: AgentRow = {
      ...agentRow,
      status: error ? 'blocked' : 'completed',
      last_heartbeat: completedAt,
    };
    upsertProjectAgent(projectId, updatedAgent);

    const evt: EventRow = {
      id: `evt-team-${error ? 'err' : 'done'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: completedAt,
      level: error ? 'error' : 'success',
      agent_id: agentId,
      agent_role: leadRole,
      message: `Team ${leadRole} ${error ? 'error' : 'completed'}: ${subagentRoles.join(', ')}`,
      details: (error ? stderr : stdout)?.slice(0, 1000) || null,
    };
    insertProjectEvent(projectId, evt);
    eventBus.broadcast('event.created', { events: [evt] }, projectId);
    eventBus.broadcast('agent.status_changed', {
      projectId, agentId, status: error ? 'blocked' : 'completed',
    }, projectId);
    triggerRelay(projectId);
  });

  const heartbeatInterval = setInterval(() => {
    if (!activeSessions.has(sessionId)) {
      clearInterval(heartbeatInterval);
      return;
    }
    const hbNow = new Date().toISOString();
    const hbAgent: AgentRow = { ...agentRow, status: 'working', last_heartbeat: hbNow };
    upsertProjectAgent(projectId, hbAgent);
  }, 60_000);

  activeSessions.set(sessionId, {
    process: childProcess,
    agentId,
    projectId,
    startedAt: Date.now(),
    heartbeatInterval,
  });

  setTimeout(() => {
    if (activeSessions.has(sessionId)) {
      const workingAgent: AgentRow = {
        ...agentRow, status: 'working', last_heartbeat: new Date().toISOString(),
      };
      upsertProjectAgent(projectId, workingAgent);
      eventBus.broadcast('agent.status_changed', {
        projectId, agentId, status: 'working',
      }, projectId);
    }
  }, 3000);

  return { sessionId, agentId };
}

async function triggerRelay(projectId: string) {
  try {
    const { runAutoRelay } = await import('@/lib/coordination/relay');
    await runAutoRelay(projectId);
  } catch { /* non-fatal */ }
}
