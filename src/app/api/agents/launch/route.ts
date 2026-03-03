import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { upsertProjectAgent } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';

// Only allow safe characters in role/session names
function sanitizeName(name: string): string | null {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '');
  return sanitized.length > 0 && sanitized.length <= 50 ? sanitized : null;
}

// Auto-generate a runner script for an agent role
// Generate a task-specific runner script for relay launches
// Sanitize text for safe embedding in shell scripts
function sanitizeForShell(text: string): string {
  return text.replace(/['"\\`$!]/g, '').replace(/[^a-zA-Z0-9 ._:,;()\-/]/g, '').slice(0, 200);
}

function generateTaskRunnerScript(projectPath: string, role: string, projectName: string, taskId: string, taskTitle: string): string {
  const scriptsDir = path.join(projectPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  // Task-specific script — always regenerated
  const scriptPath = path.join(scriptsDir, `run-${role}-relay.sh`);

  const agentMdPath = path.join(projectPath, '.claude', 'agents', `${role}.md`);
  const hasAgentTemplate = fs.existsSync(agentMdPath);

  const systemPromptLine = hasAgentTemplate
    ? `SYSTEM_PROMPT="$(cat .claude/agents/${role}.md)"`
    : `SYSTEM_PROMPT="You are the ${role} agent for the ${projectName} project. Work from the coordination directory at .claude/coordination/ to pick up tasks, update status, and coordinate with other agents. Check TASKS.md for your assignments."`;

  const script = `#!/usr/bin/env bash
# Auto-relay runner script for ${role} agent — task ${taskId}
# Project: ${projectName}
set -euo pipefail
cd "$(dirname "$0")/.."

unset CLAUDECODE

# Register agent in coordination registry
COORD_DIR=".claude/coordination"
REGISTRY="\${COORD_DIR}/registry.json"
mkdir -p "\${COORD_DIR}"
NOW=\$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

if command -v python3 &>/dev/null; then
  python3 -c "
import json, os, sys
reg_path = '\${REGISTRY}'
try:
    with open(reg_path) as f: reg = json.load(f)
except: reg = {'agents': []}
if not isinstance(reg.get('agents'), list): reg['agents'] = []
agents = [a for a in reg['agents'] if a.get('name') != '${role}']
agents.append({'name': '${role}', 'role': '${role}', 'status': 'working', 'current_task': '${taskId}', 'session_start': '\${NOW}', 'last_heartbeat': '\${NOW}'})
reg['agents'] = agents
with open(reg_path, 'w') as f: json.dump(reg, f, indent=2)
" 2>/dev/null || true
fi

${systemPromptLine}

exec claude \\
  --system-prompt "$SYSTEM_PROMPT" \\
  --allowedTools "Read,Write,Edit,Bash,Grep,Glob" \\
  -p "Work on task ${taskId}: ${sanitizeForShell(taskTitle)}. Read .claude/coordination/TASKS.md for details. Update task status as you progress."
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

function generateRunnerScript(projectPath: string, role: string, projectName: string): string {
  const scriptsDir = path.join(projectPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptPath = path.join(scriptsDir, `run-${role}.sh`);
  if (fs.existsSync(scriptPath)) return scriptPath;

  // Check if there's an agent template in .claude/agents/<role>.md
  const agentMdPath = path.join(projectPath, '.claude', 'agents', `${role}.md`);
  const hasAgentTemplate = fs.existsSync(agentMdPath);

  const systemPromptLine = hasAgentTemplate
    ? `SYSTEM_PROMPT="$(cat .claude/agents/${role}.md)"`
    : `SYSTEM_PROMPT="You are the ${role} agent for the ${projectName} project. Work from the coordination directory at .claude/coordination/ to pick up tasks, update status, and coordinate with other agents. Check TASKS.md for your assignments."`;

  const script = `#!/usr/bin/env bash
# Auto-generated runner script for ${role} agent
# Project: ${projectName}
set -euo pipefail
cd "$(dirname "$0")/.."

unset CLAUDECODE

# Register agent in coordination registry
COORD_DIR=".claude/coordination"
REGISTRY="\${COORD_DIR}/registry.json"
mkdir -p "\${COORD_DIR}"
NOW=\$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

if command -v python3 &>/dev/null; then
  python3 -c "
import json, os, sys
reg_path = '\${REGISTRY}'
try:
    with open(reg_path) as f: reg = json.load(f)
except: reg = {'agents': []}
if not isinstance(reg.get('agents'), list): reg['agents'] = []
agents = [a for a in reg['agents'] if a.get('name') != '${role}']
agents.append({'name': '${role}', 'role': '${role}', 'status': 'working', 'current_task': '', 'session_start': '\${NOW}', 'last_heartbeat': '\${NOW}'})
reg['agents'] = agents
with open(reg_path, 'w') as f: json.dump(reg, f, indent=2)
" 2>/dev/null || true
fi

${systemPromptLine}

exec claude \\
  --system-prompt "$SYSTEM_PROMPT" \\
  --allowedTools "Read,Write,Edit,Bash,Grep,Glob" \\
  -p "You are the ${role} agent. Read .claude/coordination/TASKS.md and begin working on your assigned tasks. Update task status as you progress."
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

function generateSupervisorScript(projectPath: string, projectName: string, projectId: string): string {
  const scriptsDir = path.join(projectPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptPath = path.join(scriptsDir, 'run-supervisor.sh');

  // Check if there's a custom agent template
  const agentMdPath = path.join(projectPath, '.claude', 'agents', 'supervisor.md');
  const hasAgentTemplate = fs.existsSync(agentMdPath);

  const pid = sanitizeForShell(projectId);
  const pname = sanitizeForShell(projectName);
  const systemPromptLine = hasAgentTemplate
    ? `SYSTEM_PROMPT="$(cat .claude/agents/supervisor.md)"`
    : `SYSTEM_PROMPT="You are Rataa, the supervisor agent for the ${pname} project. You are the BOSS. You decide when to spawn agents and push them to complete tasks.

PROJECT_ID: ${pid}
DASHBOARD: http://localhost:3000

== YOUR COMMANDS (run via bash curl) ==

CHECK AGENTS:
  curl -s 'http://localhost:3000/api/agent-actions?action=list-agents&projectId=${pid}'

CHECK BOARD:
  curl -s 'http://localhost:3000/api/agent-actions?action=board-summary&projectId=${pid}'

READ MISSION:
  curl -s 'http://localhost:3000/api/agent-actions?action=read-mission&projectId=${pid}'

LIST TODO TASKS:
  curl -s 'http://localhost:3000/api/agent-actions?action=list-tasks&projectId=${pid}&status=TODO'

SPAWN/RESPAWN AGENTS (you decide who to launch):
  curl -s -X POST http://localhost:3000/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"architect\\\",\\\"coder\\\",\\\"coder-2\\\",\\\"reviewer\\\",\\\"tester\\\"]}'

SPAWN ONE AGENT WITH A SPECIFIC TASK:
  curl -s -X POST http://localhost:3000/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"ROLE\\\"],\\\"task\\\":{\\\"id\\\":\\\"TASK_ID\\\",\\\"title\\\":\\\"TASK_TITLE\\\"}}'

SEND MESSAGE TO AN AGENT:
  curl -s -X POST http://localhost:3000/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"send-message\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"fromAgent\\\":\\\"supervisor\\\",\\\"toAgent\\\":\\\"AGENT_ID\\\",\\\"content\\\":\\\"MESSAGE\\\"}'

MOVE TASK STATUS:
  curl -s -X POST http://localhost:3000/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"move-task\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"taskId\\\":\\\"TASK_ID\\\",\\\"status\\\":\\\"IN_PROGRESS\\\"}'

COMMIT AND PUSH (only at 100%):
  curl -s -X POST http://localhost:3000/api/git -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"action\\\":\\\"commit-and-push\\\",\\\"message\\\":\\\"Mission complete\\\"}'

GIT STATUS:
  curl -s -X POST http://localhost:3000/api/git -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"action\\\":\\\"status\\\"}'

== EACH CYCLE ==
1. Check which agents are online. If agents are offline/completed, SPAWN them with the next TODO task.
2. Check board — identify stuck/blocked tasks and reassign.
3. Send messages to push agents.
4. At 100% completion: run tests, commit, push, provide summary.
5. You are Rataa. Be assertive. Get things done."`;

  // Supervisor runs in a bash loop — each iteration is one supervision cycle
  const script = `#!/usr/bin/env bash
# Supervisor (Rataa) runner script — loops every 5 minutes
# Project: ${sanitizeForShell(projectName)}
set -euo pipefail
cd "$(dirname "$0")/.."

unset CLAUDECODE

COORD_DIR=".claude/coordination"
REGISTRY="\${COORD_DIR}/registry.json"
mkdir -p "\${COORD_DIR}"

${systemPromptLine}

while true; do
  NOW=\$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  # Update heartbeat in registry
  if command -v python3 &>/dev/null; then
    python3 -c "
import json
reg_path = '\${REGISTRY}'
try:
    with open(reg_path) as f: reg = json.load(f)
except: reg = {'agents': []}
if not isinstance(reg.get('agents'), list): reg['agents'] = []
agents = [a for a in reg['agents'] if a.get('name') != 'supervisor']
agents.append({'name': 'supervisor', 'role': 'supervisor', 'status': 'working', 'current_task': 'supervision', 'session_start': '\${NOW}', 'last_heartbeat': '\${NOW}'})
reg['agents'] = agents
with open(reg_path, 'w') as f: json.dump(reg, f, indent=2)
" 2>/dev/null || true
  fi

  echo "=== Supervision cycle at \$(date) ==="
  claude \\
    --system-prompt "$SYSTEM_PROMPT" \\
    --allowedTools "Read,Bash,Grep,Glob" \\
    -p "Run one supervision cycle. Check all agents, review board progress, send messages to push agents, check if mission is 100% complete. Report your findings." \\
    --max-turns 15 || true

  echo "Cycle complete. Sleeping 5 minutes..."
  sleep 300
done
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

// Register a launched agent in DB + coordination files so it appears immediately
function registerLaunchedAgent(projectId: string, role: string, coordinationPath: string): void {
  const now = new Date().toISOString();
  const agentId = role; // Use role as agent ID (matches convention)
  // Supervisor starts as 'working' immediately (it's a loop); others start as 'initializing'
  const initialStatus = role === 'supervisor' ? 'working' : 'initializing';

  // 1. Ensure per-project tables exist
  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  // 2. Insert into per-project DB
  upsertProjectAgent(projectId, {
    id: `${projectId}-${agentId}`,
    agent_id: agentId,
    role,
    status: initialStatus,
    current_task: role === 'supervisor' ? 'supervision' : null,
    model: 'claude-sonnet-4-6',
    session_start: now,
    last_heartbeat: now,
    locked_files: '[]',
    progress: 0,
    estimated_cost: 0,
    created_at: now,
  });

  // 3. Update coordination registry.json so file-watcher picks it up
  try {
    const registryPath = path.join(coordinationPath, 'registry.json');
    let registry: { agents: Record<string, unknown>[] } = { agents: [] };
    if (fs.existsSync(registryPath)) {
      try {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        if (!Array.isArray(registry.agents)) registry.agents = [];
      } catch { registry = { agents: [] }; }
    }

    // Update or add agent entry
    const existingIdx = registry.agents.findIndex(
      (a) => (a.name === agentId || a.name === role)
    );
    const agentEntry = {
      name: agentId,
      role,
      status: initialStatus,
      current_task: role === 'supervisor' ? 'supervision' : '',
      session_start: now,
      last_heartbeat: now,
    };

    if (existingIdx >= 0) {
      registry.agents[existingIdx] = agentEntry;
    } else {
      registry.agents.push(agentEntry);
    }

    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  } catch {
    // Non-fatal — DB registration is the critical path
  }

  // 4. Broadcast SSE event for immediate UI update
  eventBus.broadcast('agent.updated', {
    projectId,
    agentId,
    id: `${projectId}-${agentId}`,
    role,
    status: initialStatus,
    currentTask: role === 'supervisor' ? 'supervision' : null,
    sessionStart: now,
    lastHeartbeat: now,
    lockedFiles: [],
    progress: 0,
    estimatedCost: 0,
    createdAt: now,
  }, projectId);
}

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

function getProjectPrefix(projectName: string): string {
  return projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const prefix = getProjectPrefix(project.name);
    const activeSessions = getTmuxSessions();
    const projectSessions = activeSessions.filter((s) =>
      s.startsWith(prefix) || s.startsWith(prefix.split('-')[0])
    );

    // Find available agent scripts
    const scriptsDir = path.join(project.path, 'scripts');
    const agentScripts: { role: string; script: string; running: boolean }[] = [];

    if (fs.existsSync(scriptsDir)) {
      const files = fs.readdirSync(scriptsDir).filter((f) => f.startsWith('run-') && f.endsWith('.sh'));
      for (const file of files) {
        const role = file.replace('run-', '').replace('.sh', '');
        const sessionName = `${prefix}-${role}`;
        agentScripts.push({
          role,
          script: file,
          running: projectSessions.includes(sessionName),
        });
      }
    }

    // Also check for .claude/agents/*.md
    const agentsDir = path.join(project.path, '.claude', 'agents');
    const agentTemplates: string[] = [];
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        agentTemplates.push(file.replace('.md', ''));
      }
    }

    return NextResponse.json({
      prefix,
      activeSessions: projectSessions,
      agentScripts,
      agentTemplates,
      launchScriptExists: fs.existsSync(path.join(scriptsDir, 'launch-agents.sh')),
    });
  } catch (err) {
    console.error('GET /api/agents/launch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { projectId, agents: agentRoles, launchAll, task: taskParam } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId as string))
      .get();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify project path exists
    if (!fs.existsSync(project.path)) {
      return NextResponse.json({ error: 'Project path does not exist' }, { status: 400 });
    }

    const prefix = getProjectPrefix(project.name);
    const scriptsDir = path.join(project.path, 'scripts');
    const activeSessions = getTmuxSessions();
    const results: { role: string; status: string; session?: string; error?: string }[] = [];

    // Option 0: Generate scripts only (no launch)
    if (body.generate && Array.isArray(body.agents)) {
      const generated: string[] = [];
      for (const role of body.agents as string[]) {
        const sanitizedRole = sanitizeName(role);
        if (!sanitizedRole) continue;
        try {
          generateRunnerScript(project.path, sanitizedRole, project.name);
          generated.push(sanitizedRole);
        } catch { /* skip */ }
      }
      return NextResponse.json({ generated });
    }

    // Option 1: Launch all agents via launch-agents.sh
    if (launchAll) {
      const launchScript = path.join(scriptsDir, 'launch-agents.sh');
      if (!fs.existsSync(launchScript)) {
        // Auto-generate launch-agents.sh from selected roles or all known scripts
        const roles = Array.isArray(agentRoles) ? agentRoles as string[] : [];
        if (roles.length === 0) {
          return NextResponse.json({ error: 'No agents specified and launch-agents.sh not found' }, { status: 400 });
        }
        // Generate individual scripts and a launch-all wrapper
        const scriptLines = ['#!/usr/bin/env bash', `# Auto-generated launch script for ${project.name}`, 'set -euo pipefail', 'cd "$(dirname "$0")/.."', ''];
        for (const role of roles) {
          const sanitizedRole = sanitizeName(role);
          if (!sanitizedRole) continue;
          generateRunnerScript(project.path, sanitizedRole, project.name);
          const sessionName = `${prefix}-${sanitizedRole}`;
          scriptLines.push(`echo "Launching ${sanitizedRole}..."`);
          scriptLines.push(`tmux new-session -d -s ${sessionName} -c "$(pwd)" "bash scripts/run-${sanitizedRole}.sh 2>&1 | tee /tmp/${sessionName}.log; echo '${sanitizedRole.toUpperCase()} DONE'; sleep 999999"`);
          scriptLines.push('');
        }
        scriptLines.push('echo "All agents launched."');
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
        fs.writeFileSync(launchScript, scriptLines.join('\n'), { mode: 0o755 });
      }
      // Validate script path is within the project directory
      const resolvedScript = path.resolve(launchScript);
      const resolvedProject = path.resolve(project.path);
      if (!resolvedScript.startsWith(resolvedProject + path.sep)) {
        return NextResponse.json({ error: 'Script path outside project directory' }, { status: 400 });
      }
      try {
        execFileSync('bash', [resolvedScript], {
          cwd: project.path,
          encoding: 'utf-8',
          timeout: 30000,
          env: { ...process.env, CLAUDECODE: undefined },
        });
        return NextResponse.json({
          launched: true,
          message: 'All agents launched via launch-agents.sh',
        });
      } catch (err) {
        return NextResponse.json({
          launched: false,
          error: err instanceof Error ? err.message : 'Launch failed',
        }, { status: 500 });
      }
    }

    // Option 2: Launch individual agents
    if (!Array.isArray(agentRoles) || (agentRoles as string[]).length === 0) {
      return NextResponse.json({ error: 'agents array required' }, { status: 400 });
    }

    for (const role of agentRoles as string[]) {
      const sanitizedRole = sanitizeName(role);
      if (!sanitizedRole) {
        results.push({ role, status: 'error', error: 'Invalid role name' });
        continue;
      }

      const sessionName = `${prefix}-${sanitizedRole}`;

      // Check if already running — but allow relaunch if agent status is completed/offline
      if (activeSessions.includes(sessionName)) {
        // Check DB status — if completed or offline, kill the stale session and relaunch
        let shouldKill = false;
        try {
          const { getProjectAgents } = await import('@/lib/db/project-queries');
          const dbAgents = getProjectAgents(projectId as string);
          const dbAgent = dbAgents.find((a) => a.agent_id === sanitizedRole);
          if (dbAgent && (dbAgent.status === 'completed' || dbAgent.status === 'offline')) {
            shouldKill = true;
          }
        } catch { /* fallback: treat as running */ }

        if (shouldKill) {
          try {
            execFileSync('tmux', ['kill-session', '-t', sessionName], {
              encoding: 'utf-8',
              timeout: 5000,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch { /* session may already be gone */ }
        } else {
          results.push({ role: sanitizedRole, status: 'already_running', session: sessionName });
          continue;
        }
      }

      // Use task-specific relay script or standard run script
      const taskInfo = taskParam as { id: string; title: string } | undefined;
      let scriptFile: string;
      if (taskInfo?.id) {
        try {
          generateTaskRunnerScript(project.path, sanitizedRole, project.name, taskInfo.id, taskInfo.title);
          scriptFile = `run-${sanitizedRole}-relay.sh`;
        } catch {
          scriptFile = `run-${sanitizedRole}.sh`;
        }
      } else {
        scriptFile = `run-${sanitizedRole}.sh`;
      }

      // Supervisor gets a special looping script — always regenerate to pick up latest commands
      if (sanitizedRole === 'supervisor' && !taskInfo?.id) {
        try {
          const oldScript = path.join(scriptsDir, 'run-supervisor.sh');
          if (fs.existsSync(oldScript)) fs.unlinkSync(oldScript);
          generateSupervisorScript(project.path, project.name, projectId as string);
          scriptFile = 'run-supervisor.sh';
        } catch { /* fall through to standard generation */ }
      }

      // Auto-generate standard run script if it doesn't exist
      let scriptPath = path.join(scriptsDir, scriptFile);
      if (!fs.existsSync(scriptPath)) {
        try {
          scriptPath = generateRunnerScript(project.path, sanitizedRole, project.name);
          scriptFile = `run-${sanitizedRole}.sh`;
        } catch (genErr) {
          results.push({ role: sanitizedRole, status: 'error', error: `Failed to generate script: ${genErr instanceof Error ? genErr.message : String(genErr)}` });
          continue;
        }
      }

      try {
        const shellCmd = `bash scripts/${scriptFile} 2>&1 | tee /tmp/${sessionName}.log; echo '${sanitizedRole.toUpperCase()} DONE'; sleep 999999`;
        execFileSync('tmux', [
          'new-session', '-d',
          '-s', sessionName,
          '-c', project.path,
          shellCmd,
        ], {
          encoding: 'utf-8',
          timeout: 10000,
          env: { ...process.env, CLAUDECODE: undefined },
        });
        // Register agent immediately in DB + coordination files
        registerLaunchedAgent(projectId as string, sanitizedRole, project.coordinationPath);
        results.push({ role: sanitizedRole, status: 'launched', session: sessionName });
      } catch (err) {
        results.push({
          role: sanitizedRole,
          status: 'error',
          error: err instanceof Error ? err.message : 'Launch failed',
        });
      }
    }

    // Broadcast full agent sync so PixelOffice updates immediately
    if (results.some((r) => r.status === 'launched')) {
      try {
        const { getProjectAgents } = await import('@/lib/db/project-queries');
        const allAgents = getProjectAgents(projectId as string);
        const mapped = allAgents.map((a) => ({
          id: a.id,
          projectId: projectId as string,
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
        eventBus.broadcast('agent.synced', { projectId, agents: mapped }, projectId as string);
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('POST /api/agents/launch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Direct server-side agent launch with a specific task (for relay system).
 * Avoids HTTP round-trip when called from the same process.
 */
export async function launchAgentWithTask(
  projectId: string,
  agentId: string,
  taskId: string,
  taskTitle: string,
): Promise<boolean> {
  try {
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project || !fs.existsSync(project.path)) return false;

    const sanitizedRole = sanitizeName(agentId);
    if (!sanitizedRole) return false;

    const prefix = getProjectPrefix(project.name);
    const sessionName = `${prefix}-${sanitizedRole}`;
    const activeSessions = getTmuxSessions();

    // Kill existing completed/idle session if it exists
    if (activeSessions.includes(sessionName)) {
      try {
        execFileSync('tmux', ['kill-session', '-t', sessionName], {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch { /* session might already be gone */ }
    }

    // Generate task-specific relay script
    generateTaskRunnerScript(project.path, sanitizedRole, project.name, taskId, taskTitle);

    const scriptFile = `run-${sanitizedRole}-relay.sh`;
    const shellCmd = `bash scripts/${scriptFile} 2>&1 | tee /tmp/${sessionName}.log; echo '${sanitizedRole.toUpperCase()} DONE'; sleep 999999`;

    execFileSync('tmux', [
      'new-session', '-d',
      '-s', sessionName,
      '-c', project.path,
      shellCmd,
    ], {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, CLAUDECODE: undefined },
    });

    // Register agent in DB
    registerLaunchedAgent(projectId, sanitizedRole, project.coordinationPath);

    return true;
  } catch (err) {
    console.error('launchAgentWithTask error:', err);
    return false;
  }
}
