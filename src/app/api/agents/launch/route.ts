import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { upsertProjectAgent } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';

// Prevent duplicate concurrent launches
const launchingLock = new Set<string>();

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

// Role-specific capabilities and focus areas for mission-aware prompts
const ROLE_CAPABILITIES: Record<string, { focus: string; skills: string; collaboration: string }> = {
  architect: {
    focus: 'System design, architecture decisions, technical specifications, and project structure',
    skills: 'Design patterns, API design, database schema, system decomposition, scalability planning',
    collaboration: 'Create detailed technical specs and task breakdowns. Define interfaces between components. Review architectural decisions made by other agents.',
  },
  coder: {
    focus: 'Primary implementation of features, core business logic, and backend systems',
    skills: 'Full-stack development, algorithm implementation, API endpoints, database operations',
    collaboration: 'Implement tasks from the board. Write clean, tested code. Create new tickets for bugs found. Coordinate with reviewer and tester.',
  },
  'coder-2': {
    focus: 'Secondary implementation, frontend components, UI/UX, and parallel development tracks',
    skills: 'Frontend development, component architecture, state management, responsive design',
    collaboration: 'Work on parallel tasks to coder. Focus on frontend/UI if coder handles backend. Avoid file conflicts by checking locked files.',
  },
  reviewer: {
    focus: 'Code review, quality assurance, best practices enforcement, and standards compliance',
    skills: 'Code review, security review, performance analysis, refactoring recommendations',
    collaboration: 'Review completed work from coders. Create tickets for issues found. Move tasks to DONE after verification. Ensure code meets project standards.',
  },
  tester: {
    focus: 'Testing strategy, test implementation, validation, and quality gates',
    skills: 'Unit testing, integration testing, E2E testing, test coverage analysis, regression testing',
    collaboration: 'Write and run tests for completed features. Create bug tickets for failures. Validate that tasks meet acceptance criteria before marking TESTED.',
  },
  'security-auditor': {
    focus: 'Security analysis, vulnerability detection, and security hardening',
    skills: 'OWASP top 10, dependency auditing, auth/authz review, input validation, secure coding',
    collaboration: 'Audit code for security vulnerabilities. Create P0/P1 tickets for critical issues. Review auth flows and data handling.',
  },
  devops: {
    focus: 'Infrastructure, CI/CD, deployment, monitoring, and operational excellence',
    skills: 'Docker, CI/CD pipelines, monitoring setup, deployment automation, environment management',
    collaboration: 'Set up build and deploy pipelines. Configure environments. Create tickets for infrastructure needs.',
  },
  coordinator: {
    focus: 'Team orchestration, task assignment, and workflow optimization',
    skills: 'Task prioritization, resource allocation, bottleneck identification, workflow management',
    collaboration: 'Monitor team progress. Reassign tasks when agents are blocked. Optimize parallel work streams.',
  },
};

/**
 * Generate a mission-aware system prompt for an agent role.
 * Reads mission.json from the project's coordination directory and tailors
 * the prompt to the agent's role, skills, and the mission context.
 */
function generateMissionAwarePrompt(
  projectPath: string,
  projectName: string,
  role: string,
  projectId: string,
): string {
  // Read mission if available
  let missionGoal = '';
  let missionTechStack = '';
  let missionDeliverables: string[] = [];
  try {
    const missionPath = path.join(projectPath, '.claude', 'coordination', 'mission.json');
    if (fs.existsSync(missionPath)) {
      const mission = JSON.parse(fs.readFileSync(missionPath, 'utf-8'));
      missionGoal = mission.goal || '';
      missionTechStack = mission.techStack || '';
      missionDeliverables = mission.deliverables || [];
    }
  } catch { /* no mission */ }

  const cap = ROLE_CAPABILITIES[role];
  const dashboardPort = process.env.PORT || '4000';
  const dashboardUrl = `http://localhost:${dashboardPort}`;

  // Build the prompt
  const parts: string[] = [];
  parts.push(`You are the ${role} agent for the "${projectName}" project.`);

  if (missionGoal) {
    parts.push(`\n== MISSION ==\n${missionGoal}`);
  }
  if (missionTechStack) {
    parts.push(`\nTech Stack: ${missionTechStack}`);
  }
  if (missionDeliverables.length > 0) {
    parts.push(`\nKey Deliverables:\n${missionDeliverables.map(d => `- ${d}`).join('\n')}`);
  }

  if (cap) {
    parts.push(`\n== YOUR ROLE ==\nFocus: ${cap.focus}\nSkills: ${cap.skills}\n\n== COLLABORATION ==\n${cap.collaboration}`);
  }

  parts.push(`\n== WORKFLOW ==
1. Read .claude/coordination/TASKS.md for your task assignments
2. Update task status as you progress (modify TASKS.md status field)
3. Write to .claude/coordination/progress.txt to log progress
4. Check .claude/coordination/registry.json for other active agents
5. Create new tickets in TASKS.md for bugs or sub-tasks you discover
6. Coordinate with other agents — check their status before modifying shared files`);

  parts.push(`\n== DASHBOARD API ==
Check board: curl -s '${dashboardUrl}/api/agent-actions?action=board-summary&projectId=${sanitizeForShell(projectId)}'
Move task: curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{"action":"move-task","projectId":"${sanitizeForShell(projectId)}","taskId":"TASK_ID","status":"DONE"}'
Send message: curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{"action":"send-message","projectId":"${sanitizeForShell(projectId)}","fromAgent":"${role}","toAgent":"AGENT","content":"MSG"}'`);

  const prompt = parts.join('\n');

  // Log prompt to DB
  try {
    const rawDb = (db as unknown as { $client: InstanceType<typeof import('better-sqlite3')> }).$client;
    if (rawDb) {
      rawDb.prepare(`
        INSERT OR REPLACE INTO agent_system_prompts (id, project_id, agent_role, prompt, mission_goal, generated_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'rataa', ?)
      `).run(
        `prompt-${projectId}-${role}-${Date.now()}`,
        projectId,
        role,
        prompt,
        missionGoal || null,
        new Date().toISOString(),
      );
    }
  } catch { /* non-fatal — prompt logging should never block launch */ }

  return prompt;
}

/**
 * Generate a shell-escaped SYSTEM_PROMPT variable line for agent scripts.
 * Priority: 1) .claude/agents/<role>.md template, 2) mission-aware generated prompt
 */
function getSystemPromptLine(projectPath: string, projectName: string, role: string, projectId: string): string {
  const agentMdPath = path.join(projectPath, '.claude', 'agents', `${role}.md`);
  if (fs.existsSync(agentMdPath)) {
    // Still log the template-based prompt
    try {
      const templateContent = fs.readFileSync(agentMdPath, 'utf-8');
      const rawDb = (db as unknown as { $client: InstanceType<typeof import('better-sqlite3')> }).$client;
      if (rawDb) {
        rawDb.prepare(`
          INSERT OR REPLACE INTO agent_system_prompts (id, project_id, agent_role, prompt, mission_goal, generated_by, created_at)
          VALUES (?, ?, ?, ?, ?, 'template', ?)
        `).run(
          `prompt-${projectId}-${role}-${Date.now()}`,
          projectId,
          role,
          templateContent.slice(0, 5000),
          null,
          new Date().toISOString(),
        );
      }
    } catch { /* non-fatal */ }
    return `SYSTEM_PROMPT="$(cat .claude/agents/${role}.md)"`;
  }

  // Generate mission-aware prompt
  const prompt = generateMissionAwarePrompt(projectPath, projectName, role, projectId);
  // Escape for shell embedding in double quotes
  const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  return `SYSTEM_PROMPT="${escaped}"`;
}

function generateTaskRunnerScript(projectPath: string, role: string, projectName: string, taskId: string, taskTitle: string, projectId?: string): string {
  const scriptsDir = path.join(projectPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  // Task-specific script — always regenerated
  const scriptPath = path.join(scriptsDir, `run-${role}-relay.sh`);

  const systemPromptLine = projectId
    ? getSystemPromptLine(projectPath, projectName, role, projectId)
    : (() => {
        const agentMdPath = path.join(projectPath, '.claude', 'agents', `${role}.md`);
        return fs.existsSync(agentMdPath)
          ? `SYSTEM_PROMPT="$(cat .claude/agents/${role}.md)"`
          : `SYSTEM_PROMPT="You are the ${role} agent for the ${projectName} project. Work from the coordination directory at .claude/coordination/ to pick up tasks, update status, and coordinate with other agents. Check TASKS.md for your assignments."`;
      })();

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

function generateRunnerScript(projectPath: string, role: string, projectName: string, projectId?: string): string {
  const scriptsDir = path.join(projectPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptPath = path.join(scriptsDir, `run-${role}.sh`);
  if (fs.existsSync(scriptPath)) return scriptPath;

  const systemPromptLine = projectId
    ? getSystemPromptLine(projectPath, projectName, role, projectId)
    : (() => {
        const agentMdPath = path.join(projectPath, '.claude', 'agents', `${role}.md`);
        return fs.existsSync(agentMdPath)
          ? `SYSTEM_PROMPT="$(cat .claude/agents/${role}.md)"`
          : `SYSTEM_PROMPT="You are the ${role} agent for the ${projectName} project. Work from the coordination directory at .claude/coordination/ to pick up tasks, update status, and coordinate with other agents. Check TASKS.md for your assignments."`;
      })();

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

function generateSupervisorScript(projectPath: string, projectName: string, projectId: string, variant: string = 'supervisor'): string {
  const scriptsDir = path.join(projectPath, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptPath = path.join(scriptsDir, `run-${variant}.sh`);
  const isQuality = variant === 'supervisor-2';
  const rataaLabel = isQuality ? 'Rataa-2 (Quality)' : 'Rataa-1 (Ops)';

  // Check if there's a custom agent template
  const agentMdPath = path.join(projectPath, '.claude', 'agents', `${variant}.md`);
  const hasAgentTemplate = fs.existsSync(agentMdPath);

  const pid = sanitizeForShell(projectId);
  const pname = sanitizeForShell(projectName);
  // Detect dashboard port from environment or Next.js config
  const dashboardPort = process.env.PORT || '4000';
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  // Shared commands for both supervisors
  const sharedCommands = `
CHECK AGENTS:
  curl -s ${dashboardUrl}/api/agent-actions?action=list-agents\\&projectId=${pid}

CHECK BOARD:
  curl -s ${dashboardUrl}/api/agent-actions?action=board-summary\\&projectId=${pid}

READ MISSION:
  curl -s ${dashboardUrl}/api/agent-actions?action=read-mission\\&projectId=${pid}

LIST PENDING TASKS:
  curl -s ${dashboardUrl}/api/agent-actions?action=list-tasks\\&projectId=${pid}\\&status=TODO

MOVE TASK STATUS (use DONE, IN_PROGRESS, TODO):
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"move-task\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"taskId\\\":\\\"TASK_ID\\\",\\\"status\\\":\\\"DONE\\\"}'

SEND MESSAGE TO AGENT:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"send-message\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"fromAgent\\\":\\\"${variant}\\\",\\\"toAgent\\\":\\\"AGENT_ID\\\",\\\"content\\\":\\\"MESSAGE\\\"}'

LIST TMUX SESSIONS:
  curl -s '${dashboardUrl}/api/tmux?action=list'

KILL AGENT TMUX SESSION:
  curl -s -X POST ${dashboardUrl}/api/tmux -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"kill\\\",\\\"session\\\":\\\"SESSION_NAME\\\"}'`;

  // Ops-specific commands (Rataa-1)
  const opsCommands = `
SPAWN AGENTS (replace ROLE and TASK fields):
  curl -s -X POST ${dashboardUrl}/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"ROLE\\\"],\\\"task\\\":{\\\"id\\\":\\\"TASK_ID\\\",\\\"title\\\":\\\"TASK_TITLE\\\"}}'

SPAWN ALL IDLE AGENTS AT ONCE:
  curl -s -X POST ${dashboardUrl}/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"coder\\\",\\\"coder-2\\\",\\\"reviewer\\\",\\\"tester\\\",\\\"architect\\\",\\\"security-auditor\\\",\\\"devops\\\"]}'

COMMIT AND PUSH:
  curl -s -X POST ${dashboardUrl}/api/git -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"action\\\":\\\"commit-and-push\\\",\\\"message\\\":\\\"YOUR_MESSAGE\\\"}'`;

  // Quality-specific commands (Rataa-2)
  const qualityCommands = `
READ ANALYTICS:
  curl -s '${dashboardUrl}/api/analytics?projectId=${pid}'

GENERATE STANDUP (force regenerate):
  curl -s -X POST ${dashboardUrl}/api/standup -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"force\\\":true}'

GIT STATUS:
  curl -s '${dashboardUrl}/api/git?projectId=${pid}'`;

  const opsActions = `== MANDATORY ACTIONS EVERY CYCLE ==
1. Check agents. For EVERY offline/completed agent, IMMEDIATELY spawn them with a pending task. Do not skip this.
2. Kill tmux sessions for completed agents to save compute (check tmux list, kill idle ones).
3. Check board. Move any tasks with verified acceptance criteria to DONE.
4. If agents are working, send them encouraging messages with specific task guidance.
5. NEVER end a cycle without spawning all available agents on pending tasks.
6. At 100% completion: commit and push, print summary.
7. You work WITH Rataa-2 (Quality). You handle spawning and killing. Rataa-2 handles quality and mission alignment.`;

  const qualityActions = `== MANDATORY ACTIONS EVERY CYCLE ==
1. Read mission. COMPARE mission goal vs current board progress — identify gaps.
2. Check board for tasks that are DONE but not properly validated. Review their quality.
3. If work does not align with mission deliverables, create new tasks or send messages to agents with corrections.
4. Review analytics — check agent performance, identify bottlenecks or idle agents. Send findings to Rataa-1 via message.
5. Generate standup report periodically to track progress.
6. Verify code quality by reading key files agents have modified. Send review feedback as messages.
7. At 100% completion: generate final standup, review all deliverables against mission, report gaps.
8. You work WITH Rataa-1 (Ops). You handle quality and mission. Rataa-1 handles spawning and killing.`;

  const roleDesc = isQuality
    ? `You are Rataa-2 (Quality Supervisor) for ${pname}. Your job is mission alignment, quality review, analytics monitoring, and ensuring deliverables match the mission. You DO NOT spawn or kill agents — that is Rataa-1's job. You COMPARE mission vs work done, review code quality, and send feedback to agents and Rataa-1.`
    : `You are Rataa-1 (Ops Supervisor) for ${pname}. Your job is agent lifecycle management: spawning, monitoring, killing tmux sessions, and ensuring all agents are working on tasks. You DO NOT review code quality — that is Rataa-2's job. You keep agents busy and the board moving.`;

  const variantCommands = isQuality ? qualityCommands : opsCommands;
  const variantActions = isQuality ? qualityActions : opsActions;

  const systemPromptLine = hasAgentTemplate
    ? `SYSTEM_PROMPT="$(cat .claude/agents/${variant}.md)"`
    : `SYSTEM_PROMPT="${roleDesc} You DO NOT ask permission. You EXECUTE actions immediately using the bash curl commands below. NEVER say 'shall I' or 'should I' — just DO IT.

PROJECT_ID: ${pid}
DASHBOARD: ${dashboardUrl}

== COMMANDS (execute via Bash tool with curl) ==
${sharedCommands}
${variantCommands}

${variantActions}"`;

  const executionPrompt = isQuality
    ? `EXECUTE one quality review cycle NOW. Step 1: Read mission and compare with board status. Step 2: Review DONE tasks for quality. Step 3: Check analytics for bottlenecks. Step 4: Send feedback messages to agents. Step 5: Generate standup if needed. DO NOT ask permission. EXECUTE the curl commands.`
    : `EXECUTE one ops supervision cycle NOW. Step 1: curl to check agents — spawn ALL offline/completed agents immediately with pending tasks. Step 2: Kill tmux sessions for completed agents. Step 3: Check board — move verified tasks to DONE. Step 4: Send messages to working agents. DO NOT ask permission. EXECUTE the curl commands.`;

  // Supervisor runs in a bash loop — each iteration is one supervision cycle
  const script = `#!/usr/bin/env bash
# ${rataaLabel} runner script — loops every 60 seconds
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
agents = [a for a in reg['agents'] if a.get('name') != '${variant}']
agents.append({'name': '${variant}', 'role': '${variant}', 'status': 'working', 'current_task': 'supervision', 'session_start': '\${NOW}', 'last_heartbeat': '\${NOW}'})
reg['agents'] = agents
with open(reg_path, 'w') as f: json.dump(reg, f, indent=2)
" 2>/dev/null || true
  fi

  echo "=== ${rataaLabel} cycle at \$(date) ==="
  claude \\
    --system-prompt "$SYSTEM_PROMPT" \\
    --allowedTools "Read,Bash,Grep,Glob" \\
    -p "${executionPrompt}" \\
    --max-turns 30 || true

  echo "Cycle complete. Next cycle in 60 seconds..."
  sleep 60
done
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

// Register a launched agent in DB + coordination files so it appears immediately
function registerLaunchedAgent(projectId: string, role: string, coordinationPath: string): void {
  const now = new Date().toISOString();
  const agentId = role; // Use role as agent ID (matches convention)
  // Supervisors start as 'working' immediately (they're loops); others start as 'initializing'
  const isSupervisorRole = role === 'supervisor' || role === 'supervisor-2';
  const initialStatus = isSupervisorRole ? 'working' : 'initializing';

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
    current_task: isSupervisorRole ? 'supervision' : null,
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
      current_task: isSupervisorRole ? 'supervision' : '',
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
    currentTask: isSupervisorRole ? 'supervision' : null,
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
          generateRunnerScript(project.path, sanitizedRole, project.name, projectId as string);
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
          generateRunnerScript(project.path, sanitizedRole, project.name, projectId as string);
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

      // Prevent duplicate concurrent launches
      if (launchingLock.has(sessionName)) {
        results.push({ role: sanitizedRole, status: 'already_launching', session: sessionName });
        continue;
      }
      launchingLock.add(sessionName);

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
          generateTaskRunnerScript(project.path, sanitizedRole, project.name, taskInfo.id, taskInfo.title, projectId as string);
          scriptFile = `run-${sanitizedRole}-relay.sh`;
        } catch {
          scriptFile = `run-${sanitizedRole}.sh`;
        }
      } else {
        scriptFile = `run-${sanitizedRole}.sh`;
      }

      // Supervisors get special looping scripts — always regenerate to pick up latest commands
      const isSupervisor = sanitizedRole === 'supervisor' || sanitizedRole === 'supervisor-2';
      if (isSupervisor && !taskInfo?.id) {
        try {
          const scriptName = `run-${sanitizedRole}.sh`;
          const oldScript = path.join(scriptsDir, scriptName);
          if (fs.existsSync(oldScript)) fs.unlinkSync(oldScript);
          generateSupervisorScript(project.path, project.name, projectId as string, sanitizedRole);
          scriptFile = scriptName;
        } catch { /* fall through to standard generation */ }
      }

      // Auto-generate standard run script if it doesn't exist
      let scriptPath = path.join(scriptsDir, scriptFile);
      if (!fs.existsSync(scriptPath)) {
        try {
          scriptPath = generateRunnerScript(project.path, sanitizedRole, project.name, projectId as string);
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
      } finally {
        launchingLock.delete(sessionName);
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

    // Prevent duplicate concurrent launches
    if (launchingLock.has(sessionName)) return false;
    launchingLock.add(sessionName);

    try {
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
      generateTaskRunnerScript(project.path, sanitizedRole, project.name, taskId, taskTitle, projectId);

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
    } finally {
      launchingLock.delete(sessionName);
    }
  } catch (err) {
    console.error('launchAgentWithTask error:', err);
    return false;
  }
}
