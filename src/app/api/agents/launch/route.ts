import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { upsertProjectAgent } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';
import { getSpawnEnv } from '@/lib/sdk/spawn-env';

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
  // ═══ Floor 1 — Research Lab ═══
  // Team: rataa-research (lead), researcher-1, researcher-2, researcher-3, researcher-4
  'rataa-research': {
    focus: 'Research coordination, synthesis of findings, and directing the research team',
    skills: 'Literature review, research planning, cross-referencing sources, synthesizing insights, creating research briefs, creating tasks from research findings',
    collaboration: 'YOU LEAD Floor 1 (Research Lab). Your team: researcher-1 (Chopper/GPT-4o), researcher-2 (Brook/Claude), researcher-3 (Jinbe/Gemini), researcher-4 (Carrot/Llama). Send messages to each researcher with specific sub-tasks. Collect and synthesize their findings. CREATE TASKS on the dashboard board for actionable items from research (use create-task API). Move tasks to IN_PROGRESS when working, REVIEW when done. Report consolidated insights to rataa-frontend and rataa-backend on Floor 2 via send-message. Coordinate with supervisor on Floor 3 for task status.',
  },
  'researcher-1': {
    focus: 'Deep research using GPT-4o, web search, and document analysis',
    skills: 'Web research, API documentation analysis, competitive analysis, technical feasibility studies',
    collaboration: 'You are on Floor 1 (Research Lab). Your lead is rataa-research (Robin). ALWAYS use the dashboard API: check board for existing tasks, create new tasks for findings, move your tasks through statuses (TODO→IN_PROGRESS→REVIEW→DONE). Report findings via send-message to rataa-research. Coordinate with researcher-2, researcher-3, researcher-4 to avoid duplicate work.',
  },
  'researcher-2': {
    focus: 'Research and analysis using Claude, focusing on code analysis and technical docs',
    skills: 'Code analysis, technical documentation review, architecture research, best practices analysis',
    collaboration: 'You are on Floor 1 (Research Lab). Your lead is rataa-research (Robin). ALWAYS use the dashboard API: check board for existing tasks, create new tasks for findings, move your tasks through statuses (TODO→IN_PROGRESS→REVIEW→DONE). Report findings via send-message to rataa-research. Coordinate with researcher-1, researcher-3, researcher-4.',
  },
  'researcher-3': {
    focus: 'Research using Gemini, focusing on broad knowledge synthesis and multimodal analysis',
    skills: 'Multi-source synthesis, trend analysis, technology comparison, visual documentation analysis',
    collaboration: 'You are on Floor 1 (Research Lab). Your lead is rataa-research (Robin). ALWAYS use the dashboard API: check board for existing tasks, create new tasks for findings, move your tasks through statuses (TODO→IN_PROGRESS→REVIEW→DONE). Report findings via send-message to rataa-research. Coordinate with researcher-1, researcher-2, researcher-4.',
  },
  'researcher-4': {
    focus: 'Research using Llama, focusing on open-source ecosystem and community insights',
    skills: 'Open-source research, community analysis, package evaluation, ecosystem mapping',
    collaboration: 'You are on Floor 1 (Research Lab). Your lead is rataa-research (Robin). ALWAYS use the dashboard API: check board for existing tasks, create new tasks for findings, move your tasks through statuses (TODO→IN_PROGRESS→REVIEW→DONE). Report findings via send-message to rataa-research. Coordinate with researcher-1, researcher-2, researcher-3.',
  },
  // ═══ Floor 2 — Dev Floor ═══
  // Team: rataa-frontend (lead), rataa-backend (lead), architect, frontend, backend-1, backend-2, tester-1, tester-2
  'rataa-frontend': {
    focus: 'Frontend architecture, UI/UX coordination, and component design leadership',
    skills: 'React/Next.js architecture, design systems, component patterns, state management, responsive design',
    collaboration: 'YOU LEAD frontend on Floor 2 (Dev Floor). Your team: frontend (Sanji), tester-2 (Tashigi). Coordinate with rataa-backend (Franky) for API contracts. Send messages to your team with task assignments. Review frontend PRs. Message rataa-research on Floor 1 for research needs. Message rataa-ops on Floor 3 for deployment coordination.',
  },
  'rataa-backend': {
    focus: 'Backend architecture, API design, and database coordination',
    skills: 'API design, database schema, server architecture, performance optimization, security patterns',
    collaboration: 'YOU LEAD backend on Floor 2 (Dev Floor). Your team: backend-1 (Zoro), backend-2 (Law), tester-1 (Smoker). Coordinate with rataa-frontend (Nami) for API contracts. Send messages to your team with task assignments. Message rataa-research on Floor 1 for research needs. Message rataa-ops on Floor 3 for deployment.',
  },
  architect: {
    focus: 'System design, architecture decisions, technical specifications, and project structure',
    skills: 'Design patterns, API design, database schema, system decomposition, scalability planning',
    collaboration: 'You are on Floor 2 (Dev Floor). You report to both rataa-frontend and rataa-backend. Create technical specs and task breakdowns. Define interfaces between frontend and backend. Review architecture decisions. Send specs to rataa-frontend and rataa-backend via message.',
  },
  frontend: {
    focus: 'Frontend implementation, React components, and UI polish',
    skills: 'React components, CSS/Tailwind, animations, accessibility, responsive layouts',
    collaboration: 'You are on Floor 2 (Dev Floor). Your lead is rataa-frontend (Nami). Report progress via send-message to rataa-frontend. Coordinate with backend-1 and backend-2 on API integration. Ask tester-2 to validate your work.',
  },
  'backend-1': {
    focus: 'Backend implementation, API endpoints, and business logic',
    skills: 'API endpoints, database queries, business logic, middleware, authentication',
    collaboration: 'You are on Floor 2 (Dev Floor). Your lead is rataa-backend (Franky). Report progress via send-message to rataa-backend. Coordinate with backend-2 to avoid file conflicts. Ask tester-1 to validate your work.',
  },
  'backend-2': {
    focus: 'Secondary backend work, data processing, and infrastructure code',
    skills: 'Data pipelines, background jobs, caching, file processing, third-party integrations',
    collaboration: 'You are on Floor 2 (Dev Floor). Your lead is rataa-backend (Franky). Report progress via send-message to rataa-backend. Coordinate with backend-1 to avoid file conflicts. Check locked files before editing shared code.',
  },
  'tester-1': {
    focus: 'Test implementation, test coverage, and quality validation',
    skills: 'Unit testing, integration testing, test coverage analysis, fixture creation, assertion patterns',
    collaboration: 'You are on Floor 2 (Dev Floor). Your lead is rataa-backend (Franky). Write and run tests for backend-1 and backend-2 work. Report failures via send-message to rataa-backend and the failing agent. Create bug tickets for failures.',
  },
  'tester-2': {
    focus: 'E2E testing, regression testing, and edge case validation',
    skills: 'E2E testing, browser testing, edge cases, performance testing, regression suites',
    collaboration: 'You are on Floor 2 (Dev Floor). Your lead is rataa-frontend (Nami). Write E2E and regression tests for frontend work. Report failures via send-message to rataa-frontend and the failing agent. Coordinate with tester-1 on shared test infrastructure.',
  },
  // ═══ Floor 3 — Ops Center ═══
  // Team: rataa-ops (lead), supervisor, supervisor-2
  'rataa-ops': {
    focus: 'Operations coordination, deployment, monitoring, and infrastructure management',
    skills: 'CI/CD, deployment automation, monitoring, log analysis, incident response, infrastructure as code',
    collaboration: 'YOU LEAD Floor 3 (Ops Center). You handle deployments and infrastructure. Coordinate with supervisor (Rataa-1) for agent lifecycle and supervisor-2 (Rataa-2) for quality gates. Message rataa-frontend and rataa-backend on Floor 2 for deployment readiness. Message rataa-research on Floor 1 for infrastructure research needs.',
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

  const pid = sanitizeForShell(projectId);
  parts.push(`\n== DASHBOARD API (execute via Bash tool with curl) ==

CHECK BOARD (task counts by status):
  curl -s '${dashboardUrl}/api/agent-actions?action=board-summary&projectId=${pid}'

LIST TASKS BY STATUS:
  curl -s '${dashboardUrl}/api/agent-actions?action=list-tasks&projectId=${pid}&status=TODO'

GET TASK DETAILS:
  curl -s '${dashboardUrl}/api/agent-actions?action=get-task&projectId=${pid}&taskId=TASK_ID'

CREATE TASK:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{"action":"create-task","projectId":"${pid}","title":"TITLE","description":"DESC","status":"TODO","priority":"P1","agentId":"${role}"}'

MOVE TASK STATUS (TODO, IN_PROGRESS, REVIEW, DONE, etc.):
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{"action":"move-task","projectId":"${pid}","taskId":"TASK_ID","status":"DONE","agentId":"${role}"}'

COMMENT ON TASK:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{"action":"comment-task","projectId":"${pid}","taskId":"TASK_ID","agentId":"${role}","content":"COMMENT"}'

SEND MESSAGE TO AGENT:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{"action":"send-message","projectId":"${pid}","fromAgent":"${role}","toAgent":"AGENT_ID","content":"MSG"}'

IMPORTANT: You MUST use these API commands to create tasks, move tasks across the board, and communicate. Do NOT just edit TASKS.md directly — always use the API so the dashboard updates in real time.`);

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
  // Always regenerate to pick up prompt/mission changes

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
=== VISIBILITY (read-only) ===

FULL STATUS (all floors, all agents, all tasks — use this FIRST every cycle):
  curl -s '${dashboardUrl}/api/agent-actions?action=full-status\\&projectId=${pid}'

FLOOR STATUS (per-floor: agents + their tasks — floor=1 Research, 2 Dev, 3 Ops):
  curl -s '${dashboardUrl}/api/agent-actions?action=floor-status\\&projectId=${pid}\\&floor=1'
  curl -s '${dashboardUrl}/api/agent-actions?action=floor-status\\&projectId=${pid}\\&floor=2'
  curl -s '${dashboardUrl}/api/agent-actions?action=floor-status\\&projectId=${pid}\\&floor=3'

HEALTH REPORT (crashes, stale heartbeats, recommendations):
  curl -s '${dashboardUrl}/api/agents/health?projectId=${pid}'

CHECK BOARD (task counts by status):
  curl -s '${dashboardUrl}/api/agent-actions?action=board-summary\\&projectId=${pid}'

LIST TASKS BY STATUS (TODO, IN_PROGRESS, DONE, REVIEW, etc.):
  curl -s '${dashboardUrl}/api/agent-actions?action=list-tasks\\&projectId=${pid}\\&status=IN_PROGRESS'

GET TASK DETAILS + COMMENTS (full history for one task):
  curl -s '${dashboardUrl}/api/agent-actions?action=get-task\\&projectId=${pid}\\&taskId=TASK_ID'

LIST EVENTS (errors/warnings — filter by level and agent):
  curl -s '${dashboardUrl}/api/agent-actions?action=list-events\\&projectId=${pid}\\&level=error,warn\\&limit=30'

CAPTURE AGENT OUTPUT (live tmux output — see what agent is doing):
  curl -s '${dashboardUrl}/api/agent-actions?action=capture-output\\&projectId=${pid}\\&agentId=AGENT_ID\\&lines=30'

READ MISSION:
  curl -s '${dashboardUrl}/api/agent-actions?action=read-mission\\&projectId=${pid}'

LIST CONVERSATIONS (inter-agent messages):
  curl -s '${dashboardUrl}/api/agent-actions?action=list-conversations\\&projectId=${pid}'

READ MESSAGES (for a specific agent or conversation):
  curl -s '${dashboardUrl}/api/agent-actions?action=list-messages\\&projectId=${pid}\\&agentId=AGENT_ID'

=== ACTIONS (write) ===

MOVE TASK STATUS (DONE, IN_PROGRESS, TODO, REVIEW, etc.):
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"move-task\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"taskId\\\":\\\"TASK_ID\\\",\\\"status\\\":\\\"DONE\\\",\\\"agentId\\\":\\\"${variant}\\\"}'

CREATE TASK:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"create-task\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"title\\\":\\\"TITLE\\\",\\\"status\\\":\\\"TODO\\\",\\\"priority\\\":\\\"P1\\\",\\\"agentId\\\":\\\"${variant}\\\"}'

COMMENT ON TASK:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"comment-task\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"taskId\\\":\\\"TASK_ID\\\",\\\"agentId\\\":\\\"${variant}\\\",\\\"content\\\":\\\"COMMENT\\\"}'

SEND MESSAGE TO AGENT:
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"send-message\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"fromAgent\\\":\\\"${variant}\\\",\\\"toAgent\\\":\\\"AGENT_ID\\\",\\\"content\\\":\\\"MESSAGE\\\"}'

BROADCAST MESSAGE (to all agents):
  curl -s -X POST ${dashboardUrl}/api/agent-actions -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"send-message\\\",\\\"projectId\\\":\\\"${pid}\\\",\\\"fromAgent\\\":\\\"${variant}\\\",\\\"content\\\":\\\"MESSAGE\\\"}'

LIST TMUX SESSIONS:
  curl -s '${dashboardUrl}/api/tmux?action=list'

KILL AGENT TMUX SESSION:
  curl -s -X POST ${dashboardUrl}/api/tmux -H 'Content-Type: application/json' -d '{\\\"action\\\":\\\"kill\\\",\\\"session\\\":\\\"SESSION_NAME\\\"}'`;

  // Ops-specific commands (Rataa-1)
  const opsCommands = `
SPAWN AGENTS (replace ROLE and TASK fields):
  curl -s -X POST ${dashboardUrl}/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"ROLE\\\"],\\\"task\\\":{\\\"id\\\":\\\"TASK_ID\\\",\\\"title\\\":\\\"TASK_TITLE\\\"}}'

SPAWN ALL DEV FLOOR AGENTS:
  curl -s -X POST ${dashboardUrl}/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"architect\\\",\\\"frontend\\\",\\\"backend-1\\\",\\\"backend-2\\\",\\\"tester-1\\\",\\\"tester-2\\\",\\\"rataa-frontend\\\",\\\"rataa-backend\\\"]}'

SPAWN ALL RESEARCH AGENTS:
  curl -s -X POST ${dashboardUrl}/api/agents/launch -H 'Content-Type: application/json' -d '{\\\"projectId\\\":\\\"${pid}\\\",\\\"agents\\\":[\\\"rataa-research\\\",\\\"researcher-1\\\",\\\"researcher-2\\\",\\\"researcher-3\\\",\\\"researcher-4\\\"]}'

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
1. RUN full-status FIRST to see all 3 floors at once — agents, tasks, who's working on what.
2. RUN health report to check for crashes, stale heartbeats, and stuck agents.
3. For EVERY crashed/offline/completed agent, IMMEDIATELY respawn them with a pending task.
4. If any agent stuck in initializing >5 min, capture-output to see what happened, then kill and respawn.
5. Kill tmux sessions for completed agents (check tmux list).
6. Check floor-status for each floor (1, 2, 3) to find gaps in coverage.
7. Use capture-output on working agents to verify they are making progress (not looping or stuck).
8. If agents need guidance, send-message to them with specific task instructions.
9. Check list-events for errors/warnings — surface issues to Rataa-2.
10. NEVER end a cycle without all agents busy. Spawn idle agents on pending tasks.
11. At 100% completion: commit and push, print summary.
12. You work WITH Rataa-2 (Quality). You handle spawning, killing, failure recovery. Rataa-2 handles quality.`;

  const qualityActions = `== MANDATORY ACTIONS EVERY CYCLE ==
1. RUN full-status FIRST to see all 3 floors — agents, tasks, progress across Research/Dev/Ops.
2. RUN health report to find crashes and failures. Message Rataa-1 with specific respawn instructions.
3. Check floor-status for each floor (1, 2, 3) individually. Identify which floors are underperforming.
4. Read mission. COMPARE mission deliverables vs board progress — flag gaps to agents via messages.
5. Use get-task for each IN_PROGRESS task to read comments/history — verify agents are making real progress.
6. Use capture-output on key agents to verify work quality (are they writing good code or just looping?).
7. Check list-events for errors/warnings — diagnose root causes and message affected agents.
8. Review list-conversations to monitor inter-agent coordination — flag miscommunication.
9. For DONE tasks: use get-task to verify acceptance criteria were met. Use submit-review to approve or reject.
10. Create new tasks if mission deliverables have gaps. Set priority and assign to appropriate floor agents.
11. Generate standup report periodically to track progress.
12. At 100%: generate final standup, review all deliverables, report gaps.
13. You work WITH Rataa-1 (Ops). You handle quality, mission alignment, and communication monitoring.`;

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
    --max-budget-usd 5 || true

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
    launch_mode: 'tmux',
    sdk_session_id: null,
    hook_enabled: 0,
    worktree_path: null,
    worktree_branch: null,
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
    const { projectId, launchAll, task: taskParam, launchMode: launchModeParam, useWorktree: useWorktreeParam } = body;
    let agentRoles = body.agents;

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

    // Option 1: Launch all agents — convert to individual agent loop
    // (Previously used a monolithic bash script which timed out at 30s)
    if (launchAll) {
      const roles = Array.isArray(agentRoles) ? agentRoles as string[] : [];
      if (roles.length === 0) {
        return NextResponse.json({ error: 'No agents specified' }, { status: 400 });
      }
      // Fall through to individual agent loop below
      agentRoles = roles;
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
          launchingLock.delete(sessionName);
          results.push({ role: sanitizedRole, status: 'already_running', session: sessionName });
          continue;
        }
      }

      // SDK launch mode — use programmatic spawning instead of tmux
      if (launchModeParam === 'sdk') {
        try {
          const { launchAgentWithSDK } = await import('@/lib/sdk/agent-launcher');

          // Optionally create worktree
          let worktreePath: string | undefined;
          let worktreeBranch: string | undefined;
          if (useWorktreeParam) {
            try {
              const { createWorktree } = await import('@/lib/sdk/worktree-manager');
              const wt = createWorktree(project.path, sanitizedRole);
              worktreePath = wt.worktreePath;
              worktreeBranch = wt.branch;
            } catch (wtErr) {
              // Non-fatal — launch without worktree
              console.error('Worktree creation failed:', wtErr);
            }
          }

          const systemPrompt = generateMissionAwarePrompt(
            project.path, project.name, sanitizedRole, projectId as string
          );
          const taskInfo = taskParam as { id: string; title: string } | undefined;
          const prompt = taskInfo?.id
            ? `Work on task ${taskInfo.id}: ${taskInfo.title}. Read .claude/coordination/TASKS.md for details.`
            : `You are the ${sanitizedRole} agent. Read .claude/coordination/TASKS.md and begin working on your assigned tasks.`;

          const result = await launchAgentWithSDK({
            projectId: projectId as string,
            role: sanitizedRole,
            systemPrompt,
            prompt,
            cwd: project.path,
            coordinationPath: project.coordinationPath,
            worktreePath,
            worktreeBranch,
          });

          results.push({ role: sanitizedRole, status: 'launched', session: result.sessionId });
        } catch (sdkErr) {
          results.push({
            role: sanitizedRole,
            status: 'error',
            error: sdkErr instanceof Error ? sdkErr.message : 'SDK launch failed',
          });
        } finally {
          launchingLock.delete(sessionName);
        }
        continue;
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
        // Optionally create worktree for tmux agents too
        let tmuxCwd = project.path;
        if (useWorktreeParam) {
          try {
            const { createWorktree } = await import('@/lib/sdk/worktree-manager');
            const wt = createWorktree(project.path, sanitizedRole);
            tmuxCwd = wt.worktreePath;
            // Store worktree info — registerLaunchedAgent will be called below
          } catch (wtErr) {
            console.error('Worktree creation failed for tmux agent:', wtErr);
          }
        }

        const shellCmd = `bash scripts/${scriptFile} 2>&1 | tee /tmp/${sessionName}.log; echo '${sanitizedRole.toUpperCase()} DONE'; sleep 999999`;
        execFileSync('tmux', [
          'new-session', '-d',
          '-s', sessionName,
          '-c', tmuxCwd,
          shellCmd,
        ], {
          encoding: 'utf-8',
          timeout: 10000,
          env: getSpawnEnv(),
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
        env: getSpawnEnv(),
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
