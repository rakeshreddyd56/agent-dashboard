#!/usr/bin/env node
/**
 * ClawBot Slack Bridge — AI-powered gateway between #agent-missions and Agent Dashboard
 *
 * Uses Ollama (llama3.2:3b) locally to understand natural language messages,
 * classify intent, extract parameters, and route to the correct dashboard APIs.
 *
 * Monitors dashboard events and pushes updates back to Slack.
 *
 * Usage: node scripts/slack-bridge.mjs
 */

import { execSync } from 'child_process';

// ─── Config ───
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SLACK_BOT_TOKEN) {
  console.error('SLACK_BOT_TOKEN environment variable is required');
  process.exit(1);
}
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4000';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const POLL_INTERVAL = 5000;
const MONITOR_INTERVAL = 30000;
const CHANNEL_ID = process.env.CHANNEL_ID || 'C0AK6G6HS0M';
const PROJECTS_DIR = process.env.PROJECTS_DIR || '/Users/luffydeathmac';

let lastTs = (Date.now() / 1000).toFixed(6);
let botUserId = null;
let activeProjectId = null; // current project context

// Track last known state for change detection
let lastAgentStates = {};
let lastTaskCounts = {};
let lastOfficeState = null;

// ─── Workflow Orchestrator ───
// Tracks where each project is in the pipeline and guides the user through next steps
const projectWorkflow = {};

function getWorkflowState(projectId) {
  if (!projectWorkflow[projectId]) {
    projectWorkflow[projectId] = {
      phase: 'created',        // created → mission_set → floor1_launched → researching → floor2_launched → developing → floor3_launched → deploying → complete
      missionSet: false,
      agentsLaunched: [],
      researchStarted: false,
      devStarted: false,
      opsStarted: false,
    };
  }
  return projectWorkflow[projectId];
}

async function detectWorkflowPhase(projectId) {
  const wf = getWorkflowState(projectId);

  // Query dashboard for actual state
  const [mission, agents, office, tasks] = await Promise.all([
    dashboard(`/api/mission?projectId=${projectId}`),
    dashboard(`/api/agents?projectId=${projectId}`),
    dashboard(`/api/office?projectId=${projectId}`),
    dashboard(`/api/tasks?projectId=${projectId}`),
  ]);

  wf.missionSet = !!mission?.mission?.goal;

  if (agents?.agents) {
    wf.agentsLaunched = agents.agents.map(a => a.role);
    const floor1Roles = ['rataa-research', 'researcher-1', 'researcher-2', 'researcher-3', 'researcher-4'];
    const floor2Roles = ['rataa-frontend', 'rataa-backend', 'architect', 'frontend', 'backend-1', 'backend-2', 'tester-1', 'tester-2'];
    const floor3Roles = ['rataa-ops', 'supervisor', 'supervisor-2'];
    wf.researchStarted = floor1Roles.some(r => wf.agentsLaunched.includes(r));
    wf.devStarted = floor2Roles.some(r => wf.agentsLaunched.includes(r));
    wf.opsStarted = floor3Roles.some(r => wf.agentsLaunched.includes(r));
  }

  // Determine phase
  if (office?.state === 'COMPLETE') wf.phase = 'complete';
  else if (office?.state && ['DEPLOYING', 'BUILDING'].includes(office.state)) wf.phase = 'deploying';
  else if (office?.state && ['DEVELOPING', 'TESTING', 'DELEGATING'].includes(office.state)) wf.phase = 'developing';
  else if (office?.state && ['RESEARCHING', 'ANALYZING', 'CLONING', 'REVIEWING', 'SYNTHESIZING', 'PLANNING'].includes(office.state)) wf.phase = 'researching';
  else if (wf.opsStarted) wf.phase = 'deploying';
  else if (wf.devStarted) wf.phase = 'developing';
  else if (wf.researchStarted) wf.phase = 'researching';
  else if (wf.agentsLaunched.length > 0) wf.phase = 'agents_active';
  else if (wf.missionSet) wf.phase = 'mission_set';
  else wf.phase = 'created';

  return wf;
}

function getNextStepGuidance(wf) {
  switch (wf.phase) {
    case 'created':
      return `:arrow_right: *Next step:* Set a mission for this project.\nTell me what you want to build or what goal the agents should work towards.`;
    case 'mission_set':
      return `:arrow_right: *Next step:* Launch agents to start working.\n• \`launch floor 1\` — start with research (recommended)\n• \`launch floor 2\` — jump straight to development\n• \`launch all\` — launch the entire crew`;
    case 'agents_active':
      return `:arrow_right: Agents are active but no floor workflow has started. You can:\n• \`start research\` — trigger the research pipeline\n• \`tasks\` — see what's on the board\n• \`status\` — check agent health`;
    case 'researching':
      return `:microscope: Floor 1 is researching. You can:\n• \`office\` — see research progress\n• \`talk to robin what's the status?\` — ask the research lead\n• \`tasks\` — see research findings turned into tasks\n• Floor 2 will be prompted when research completes`;
    case 'developing':
      return `:hammer_and_wrench: Floor 2 is building. You can:\n• \`tasks\` — see development progress\n• \`talk to nami how's frontend?\` — ask the dev leads\n• \`analytics\` — check metrics\n• Floor 3 deploys when dev is done`;
    case 'deploying':
      return `:rocket: Floor 3 is deploying. You can:\n• \`talk to luffy what's the deploy status?\` — ask ops\n• \`office\` — see deployment state\n• \`git\` — check commits`;
    case 'complete':
      return `:tada: Project is complete! You can:\n• \`standup\` — get a final report\n• \`analytics\` — see full metrics\n• Start a new project or send another GitHub URL`;
    default:
      return '';
  }
}

// ─── Helpers ───

async function slackApi(method, params = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function slackPost(text, threadTs = null) {
  const params = { channel: CHANNEL_ID, text };
  if (threadTs) params.thread_ts = threadTs;
  return slackApi('chat.postMessage', params);
}

async function react(ts, emoji) {
  return slackApi('reactions.add', { channel: CHANNEL_ID, timestamp: ts, name: emoji }).catch(() => {});
}

async function dashboard(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${DASHBOARD_URL}${path}`, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `HTTP ${res.status}: ${text}` };
    }
    return res.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function ollama(prompt, system = '') {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        system,
        stream: false,
        options: { temperature: 0.1, num_predict: 512 },
      }),
    });
    const data = await res.json();
    return (data.response || '').trim();
  } catch (err) {
    console.error('[ollama] Error:', err.message);
    return null;
  }
}

// ─── Intent Classification ───

const INTENT_SYSTEM = `You are a command classifier for an AI agent dashboard. Given a user message, output ONLY a JSON object with the intent and extracted parameters. No explanation.

Available intents:
- "research_repo": User wants to research/analyze a GitHub repo. Extract: repo_url, mission_text
- "create_project": User wants to create/start/initialize a NEW project (no GitHub URL). Extract: project_name, description, path
- "delete_project": User wants to delete/remove a project. Extract: project_name
- "set_mission": User sets a mission/goal (no specific repo). Extract: mission_text, tech_stack
- "update_mission": User wants to update/change the current mission. Extract: mission_text, tech_stack
- "launch_agents": User wants to launch specific agents or floors. Extract: floor (1/2/3), agents[], all (boolean)
- "stop_agents": User wants to stop/kill agents. Extract: agents[] or all (boolean)
- "status": User asks for status/progress of agents, tasks, mission, office, or dashboard
- "task_create": User wants to create a task. Extract: title, description, priority (P0-P3), assignee
- "task_list": User wants to see tasks. Extract: status_filter, agent_filter
- "task_update": User wants to update/move a task. Extract: task_query, new_status, new_assignee
- "task_delete": User wants to delete a task. Extract: task_query
- "standup": User wants a standup report. Extract: date
- "analytics": User wants analytics/metrics/stats
- "git_status": User asks about git commits or wants to commit/push
- "git_commit": User wants to commit and/or push code. Extract: message, push (boolean)
- "office_status": User asks about the 3-floor office state, research sessions, council
- "start_research": User wants to trigger/start a research session. Extract: topic
- "chat_floor": User wants to talk to a floor lead (Robin/Nami/Franky/Luffy). Extract: floor (1/2/3), message
- "send_message": User wants to send a message to a specific agent. Extract: to_agent, content
- "notifications": User asks about notifications
- "health": User asks if the dashboard/system is healthy
- "list_projects": User wants to see registered projects
- "switch_project": User wants to switch active project context. Extract: project_name
- "schedule_job": User wants to schedule a recurring task. Extract: cron_expression, action
- "help": User asks for help or what they can do
- "unknown": Cannot classify

IMPORTANT DISTINCTIONS:
- "start a new project" / "create project X" / "initialize project" = create_project (NOT switch_project)
- "switch to project X" / "use project X" = switch_project
- "set mission" / "the mission is" = set_mission
- "update mission" / "change mission to" = update_mission

GitHub URL patterns: github.com/user/repo, git@github.com:user/repo.git

Example outputs:
{"intent":"create_project","project_name":"my-test-project","description":"A test project"}
{"intent":"research_repo","repo_url":"https://github.com/user/repo","mission_text":"research this repo"}
{"intent":"status"}
{"intent":"launch_agents","floor":1,"agents":["rataa-research"]}
{"intent":"task_create","title":"Fix login bug","priority":"P1"}
{"intent":"git_commit","message":"fix auth flow","push":true}`;

async function classifyIntent(message) {
  // Inject workflow context so Ollama knows the current state
  let contextualSystem = INTENT_SYSTEM;
  if (activeProjectId) {
    const wf = getWorkflowState(activeProjectId);
    contextualSystem += `\n\nCURRENT CONTEXT:
- Active project: "${activeProjectId}"
- Workflow phase: ${wf.phase}
- Mission set: ${wf.missionSet}
- Agents launched: ${wf.agentsLaunched.length > 0 ? wf.agentsLaunched.join(', ') : 'none'}
- Research started: ${wf.researchStarted}
- Dev started: ${wf.devStarted}
- Ops started: ${wf.opsStarted}

Use this context to better classify ambiguous messages. For example:
- If phase is "created" and user says something descriptive, it's likely "set_mission"
- If phase is "mission_set" and user mentions a floor or agents, it's likely "launch_agents"
- If user describes what to build after creating a project, it's "set_mission" not "create_project"`;
  }
  const raw = await ollama(message, contextualSystem);
  if (!raw) return { intent: 'unknown' };

  try {
    // Extract JSON from response (ollama sometimes wraps it)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[classify] Parse error:', err.message, 'Raw:', raw);
  }

  // Fallback: simple keyword matching
  const lower = message.toLowerCase();
  if (lower.match(/github\.com|git@github/)) {
    const urlMatch = message.match(/https?:\/\/github\.com\/[^\s>]+|git@github\.com:[^\s>]+/);
    return { intent: 'research_repo', repo_url: urlMatch?.[0], mission_text: message };
  }
  if (lower === 'status' || lower.startsWith('status')) return { intent: 'status' };
  if (lower === 'help') return { intent: 'help' };
  if (lower === 'stop' || lower.startsWith('stop')) return { intent: 'stop_agents', all: true };
  if (lower.includes('standup')) return { intent: 'standup' };
  if (lower.includes('analytics') || lower.includes('metrics')) return { intent: 'analytics' };
  if (lower.includes('health') || lower.includes('alive')) return { intent: 'health' };
  if (lower.includes('projects') || lower.includes('list project')) return { intent: 'list_projects' };

  return { intent: 'set_mission', mission_text: message };
}

// ─── Action Handlers ───

async function ensureProject(projectId) {
  // Check if project exists
  const res = await dashboard(`/api/projects`);
  if (res.projects) {
    const existing = res.projects.find(p => p.id === projectId);
    if (existing) return existing;
  }
  return null;
}

async function handleResearchRepo(ts, params) {
  await react(ts, 'mag');

  let repoUrl = params.repo_url || '';
  // Clean URL (remove trailing slashes, .git, angle brackets)
  repoUrl = repoUrl.replace(/[<>]/g, '').replace(/\/+$/, '');
  if (!repoUrl.includes('github.com')) {
    await slackPost(':x: Could not find a valid GitHub URL in your message.', ts);
    return;
  }

  // Normalize to HTTPS
  const httpsUrl = repoUrl.startsWith('git@')
    ? repoUrl.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '')
    : repoUrl.replace(/\.git$/, '');

  // Extract repo name for project ID
  const parts = httpsUrl.split('/');
  const repoName = parts[parts.length - 1];
  const repoOwner = parts[parts.length - 2];
  const projectName = repoName;
  const projectId = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const localPath = `${PROJECTS_DIR}/${repoName}`;

  await slackPost(`:hourglass_flowing_sand: Processing *${repoOwner}/${repoName}*...\n\n` +
    `1. Cloning repository\n2. Registering project\n3. Setting mission\n4. Launching Floor 1 research crew`, ts);

  // Step 1: Clone repo if not exists
  try {
    execSync(`test -d "${localPath}/.git"`, { stdio: 'ignore' });
    await slackPost(`:file_folder: Repo already cloned at \`${localPath}\``, ts);
  } catch {
    try {
      await slackPost(`:arrow_down: Cloning \`${httpsUrl}\`...`, ts);
      execSync(`git clone "${httpsUrl}.git" "${localPath}" 2>&1`, { timeout: 120000 });
      await slackPost(`:white_check_mark: Cloned to \`${localPath}\``, ts);
    } catch (err) {
      await slackPost(`:x: Clone failed: ${err.message?.split('\n')[0]}`, ts);
      return;
    }
  }

  // Step 2: Register project in dashboard
  let project = await ensureProject(projectId);
  if (project) {
    await slackPost(`:card_index: Project \`${projectId}\` already registered`, ts);
  } else {
    const regResult = await dashboard('/api/projects', 'POST', {
      name: projectName,
      path: localPath,
      gitUrl: httpsUrl,
    });
    if (regResult.error) {
      await slackPost(`:x: Failed to register project: ${regResult.error}`, ts);
      return;
    }
    await slackPost(`:white_check_mark: Project \`${regResult.id}\` registered`, ts);
    project = regResult;
  }

  activeProjectId = projectId;

  // Step 3: Set mission
  const missionGoal = params.mission_text || `Research and analyze the ${repoOwner}/${repoName} repository`;
  const missionResult = await dashboard('/api/mission', 'POST', {
    projectId,
    goal: missionGoal,
    techStack: '',
    deliverables: ['Research report', 'Architecture analysis', 'Improvement recommendations'],
    agentTeam: ['rataa-research', 'researcher-1', 'researcher-2', 'researcher-3', 'researcher-4'],
  });

  if (missionResult.error) {
    await slackPost(`:x: Failed to set mission: ${missionResult.error}`, ts);
    return;
  }

  // Step 4: Launch Floor 1 research crew
  const floor1Agents = ['rataa-research', 'researcher-1', 'researcher-2', 'researcher-3', 'researcher-4'];
  const launchResults = [];

  for (const role of floor1Agents) {
    const result = await dashboard('/api/agents/launch', 'POST', {
      projectId,
      role,
      launchMode: 'tmux',
    });
    launchResults.push({ role, success: !result.error, error: result.error });
  }

  const launched = launchResults.filter(r => r.success).map(r => r.role);
  const failed = launchResults.filter(r => !r.success);

  let summary = `:pirate_flag: *Floor 1 Research Crew Launched!*\n`;
  summary += `*Project:* \`${projectId}\`\n`;
  summary += `*Mission:* ${missionGoal}\n\n`;
  summary += `*Agents:*\n`;
  for (const r of launchResults) {
    summary += r.success
      ? `:large_green_circle: \`${r.role}\` — launched\n`
      : `:red_circle: \`${r.role}\` — ${r.error}\n`;
  }
  const wf = getWorkflowState(projectId);
  wf.missionSet = true;
  wf.researchStarted = true;
  wf.phase = 'researching';
  summary += `\n${getNextStepGuidance(wf)}`;

  await slackPost(summary, ts);
}

async function handleSetMission(ts, params) {
  await react(ts, 'rocket');

  if (!activeProjectId) {
    // Try to find an active project
    const projects = await dashboard('/api/projects');
    const nonDemo = projects.projects?.filter(p => !p.isDemo);
    if (nonDemo?.length === 1) {
      activeProjectId = nonDemo[0].id;
    } else if (nonDemo?.length > 1) {
      let msg = ':question: Which project? Active projects:\n';
      for (const p of nonDemo) msg += `• \`${p.id}\` — ${p.name}\n`;
      msg += '\nType `switch <project-id>` first.';
      await slackPost(msg, ts);
      return;
    } else {
      await slackPost(':x: No projects registered. Send a GitHub URL first to set up a project.', ts);
      return;
    }
  }

  const result = await dashboard('/api/mission', 'POST', {
    projectId: activeProjectId,
    goal: params.mission_text,
    techStack: params.tech_stack || '',
    deliverables: [],
    agentTeam: [],
  });

  if (result.error) {
    await slackPost(`:x: Failed to set mission: ${result.error}`, ts);
    return;
  }

  // Workflow guidance
  const wf = getWorkflowState(activeProjectId);
  wf.missionSet = true;
  wf.phase = 'mission_set';
  await slackPost(`:white_check_mark: *Mission set on \`${activeProjectId}\`:*\n> ${params.mission_text}\n\n${getNextStepGuidance(wf)}`, ts);
}

async function handleCreateProject(ts, params) {
  await react(ts, 'hammer_and_wrench');

  let projectName = params.project_name || '';
  if (!projectName) {
    await slackPost(':x: Please provide a project name. E.g., `create project my-awesome-app`', ts);
    return;
  }

  // Clean name
  projectName = projectName.trim();
  const projectId = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const localPath = `${PROJECTS_DIR}/${projectName}`;

  await slackPost(`:hourglass_flowing_sand: Creating project *${projectName}*...`, ts);

  // Create the local directory if it doesn't exist
  try {
    execSync(`mkdir -p "${localPath}"`);
  } catch (err) {
    await slackPost(`:x: Failed to create directory: ${err.message}`, ts);
    return;
  }

  // Initialize git if not already
  try {
    execSync(`test -d "${localPath}/.git"`, { stdio: 'ignore' });
  } catch {
    try {
      execSync(`cd "${localPath}" && git init && git commit --allow-empty -m "Initial commit"`, { stdio: 'ignore' });
    } catch { /* non-fatal */ }
  }

  // Register in dashboard
  const result = await dashboard('/api/projects', 'POST', {
    name: projectName,
    path: localPath,
  });

  if (result.error) {
    await slackPost(`:x: Failed to register project: ${result.error}`, ts);
    return;
  }

  activeProjectId = result.id;

  let msg = `:white_check_mark: *Project created!*\n`;
  msg += `• *ID:* \`${result.id}\`\n`;
  msg += `• *Name:* ${projectName}\n`;
  msg += `• *Path:* \`${localPath}\`\n`;
  msg += `• *Tables:* created\n\n`;

  // Workflow guidance
  const wf = getWorkflowState(result.id);
  wf.phase = 'created';
  msg += getNextStepGuidance(wf);

  await slackPost(msg, ts);
}

async function handleDeleteProject(ts, params) {
  await react(ts, 'wastebasket');

  const name = params.project_name;
  if (!name) {
    await slackPost(':x: Specify which project to delete. E.g., `delete project my-app`', ts);
    return;
  }

  // Find the project
  const data = await dashboard('/api/projects');
  const project = data.projects?.find(p =>
    p.id === name || p.id === name.toLowerCase().replace(/[^a-z0-9]/g, '-') || p.name.toLowerCase().includes(name.toLowerCase())
  );

  if (!project) {
    await slackPost(`:x: Project "${name}" not found.`, ts);
    return;
  }

  if (project.isDemo) {
    await slackPost(':x: Cannot delete the demo project.', ts);
    return;
  }

  const result = await dashboard(`/api/projects?id=${project.id}`, 'DELETE');
  if (result.error) {
    await slackPost(`:x: Delete failed: ${result.error}`, ts);
    return;
  }

  if (activeProjectId === project.id) activeProjectId = null;
  await slackPost(`:wastebasket: Project \`${project.id}\` (${project.name}) deleted.`, ts);
}

async function handleUpdateMission(ts, params) {
  await react(ts, 'pencil2');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const updates = {};
  if (params.mission_text) updates.goal = params.mission_text;
  if (params.tech_stack) updates.techStack = params.tech_stack;

  const result = await dashboard('/api/mission', 'PUT', {
    projectId: activeProjectId,
    ...updates,
  });

  if (result.error) {
    await slackPost(`:x: Failed to update mission: ${result.error}`, ts);
    return;
  }

  await slackPost(`:white_check_mark: *Mission updated on \`${activeProjectId}\`*\n> ${result.mission?.goal || params.mission_text}`, ts);
}

async function handleTaskDelete(ts, params) {
  await react(ts, 'wastebasket');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const all = await dashboard(`/api/tasks?projectId=${activeProjectId}`);
  const query = (params.task_query || '').toLowerCase();
  const task = all.tasks?.find(t => t.title.toLowerCase().includes(query) || t.id === query);

  if (!task) {
    await slackPost(`:x: Could not find task matching "${params.task_query}"`, ts);
    return;
  }

  const result = await dashboard(`/api/tasks?id=${task.id}&projectId=${activeProjectId}`, 'DELETE');
  if (result.error) {
    await slackPost(`:x: Delete failed: ${result.error}`, ts);
    return;
  }

  await slackPost(`:wastebasket: Task deleted: *${task.title}*`, ts);
}

async function handleGitCommit(ts, params) {
  await react(ts, 'git');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const result = await dashboard('/api/git', 'POST', {
    projectId: activeProjectId,
    action: 'commit-and-push',
    message: params.message || 'Update from Slack bridge',
  });

  if (result.error) {
    await slackPost(`:x: Git error: ${result.error}`, ts);
    return;
  }

  let msg = `:white_check_mark: *Git commit*\n`;
  if (result.commitHash) msg += `• Hash: \`${result.commitHash}\`\n`;
  if (result.message) msg += `• ${result.message}\n`;
  if (result.pushed) msg += `• Pushed to remote\n`;

  await slackPost(msg, ts);
}

async function handleStartResearch(ts, params) {
  await react(ts, 'microscope');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const result = await dashboard('/api/office', 'POST', {
    projectId: activeProjectId,
    action: 'trigger_research',
  });

  if (result.error) {
    await slackPost(`:x: Failed to start research: ${result.error}`, ts);
    return;
  }

  await slackPost(`:microscope: *Research session triggered on \`${activeProjectId}\`*${params.topic ? `\nTopic: ${params.topic}` : ''}`, ts);
}

async function handleLaunchAgents(ts, params) {
  await react(ts, 'rocket');

  if (!activeProjectId) {
    await slackPost(':x: No active project. Send a GitHub URL or `switch <project-id>` first.', ts);
    return;
  }

  const floorMap = {
    1: ['rataa-research', 'researcher-1', 'researcher-2', 'researcher-3', 'researcher-4'],
    2: ['rataa-frontend', 'rataa-backend', 'architect', 'frontend', 'backend-1', 'backend-2', 'tester-1', 'tester-2'],
    3: ['rataa-ops', 'supervisor', 'supervisor-2'],
  };

  let agents = params.agents || [];
  if (params.floor) agents = floorMap[params.floor] || [];
  if (params.all) agents = [...floorMap[1], ...floorMap[2], ...floorMap[3]];

  if (agents.length === 0) {
    await slackPost(':x: Specify which agents or floor to launch. E.g., `launch floor 1` or `launch all`.', ts);
    return;
  }

  await slackPost(`:hourglass_flowing_sand: Launching ${agents.length} agent(s)...`, ts);

  const results = [];
  for (const role of agents) {
    const res = await dashboard('/api/agents/launch', 'POST', {
      projectId: activeProjectId,
      role,
      launchMode: 'tmux',
    });
    results.push({ role, success: !res.error, error: res.error });
  }

  let msg = '*Launch Results:*\n';
  for (const r of results) {
    msg += r.success
      ? `:large_green_circle: \`${r.role}\`\n`
      : `:red_circle: \`${r.role}\` — ${r.error}\n`;
  }

  // Check if mission is set, guide if not
  if (activeProjectId) {
    const mission = await dashboard(`/api/mission?projectId=${activeProjectId}`);
    if (!mission?.mission?.goal) {
      msg += `\n:warning: *No mission set yet!* Agents won't know what to work on.\nTell me the goal for this project and I'll set the mission.`;
    } else {
      const wf = await detectWorkflowPhase(activeProjectId);
      msg += `\n${getNextStepGuidance(wf)}`;
    }
  }

  await slackPost(msg, ts);
}

async function handleStopAgents(ts, params) {
  await react(ts, 'octagonal_sign');

  if (!activeProjectId) {
    await slackPost(':x: No active project.', ts);
    return;
  }

  const agents = await dashboard(`/api/agents?projectId=${activeProjectId}`);
  if (!agents.agents?.length) {
    await slackPost('_No agents found._', ts);
    return;
  }

  const toStop = params.all
    ? agents.agents.filter(a => ['working', 'planning', 'initializing', 'idle'].includes(a.status))
    : agents.agents.filter(a => (params.agents || []).includes(a.role));

  if (toStop.length === 0) {
    await slackPost('_No active agents to stop._', ts);
    return;
  }

  for (const a of toStop) {
    try {
      execSync(`tmux kill-session -t "${a.agentId || a.role}" 2>/dev/null || true`);
    } catch { /* ignore */ }
  }

  await slackPost(`:octagonal_sign: Stopped ${toStop.length} agent(s): ${toStop.map(a => `\`${a.role}\``).join(', ')}`, ts);
}

async function handleStatus(ts) {
  await react(ts, 'bar_chart');
  const pid = activeProjectId;

  if (!pid) {
    // Show project list
    const projects = await dashboard('/api/projects');
    if (!projects.projects?.length) {
      await slackPost('_No projects registered. Send a GitHub URL to get started._', ts);
      return;
    }
    let msg = '*Registered Projects:*\n';
    for (const p of projects.projects) {
      msg += `• \`${p.id}\` — ${p.name} ${p.isActive ? ':large_green_circle:' : ':white_circle:'}\n`;
    }
    msg += '\n_No active project selected. Type `switch <id>` to select one._';
    await slackPost(msg, ts);
    return;
  }

  // Gather all status in parallel
  const [mission, agents, health, tasks, office] = await Promise.all([
    dashboard(`/api/mission?projectId=${pid}`),
    dashboard(`/api/agents/health?projectId=${pid}`),
    dashboard(`/api/health`),
    dashboard(`/api/tasks?projectId=${pid}`),
    dashboard(`/api/office?projectId=${pid}`),
  ]);

  let msg = `:bar_chart: *Dashboard Status — \`${pid}\`*\n\n`;

  // System health
  if (health.status) {
    const icon = health.status === 'ok' ? ':large_green_circle:' : ':red_circle:';
    msg += `${icon} *System:* ${health.status} (uptime: ${Math.floor(health.uptime || 0)}s)\n\n`;
  }

  // Mission
  if (mission?.mission) {
    msg += `:dart: *Mission:* ${mission.mission.goal}\n`;
    if (mission.mission.techStack) msg += `*Tech:* ${mission.mission.techStack}\n`;
    msg += '\n';
  } else {
    msg += '_No active mission_\n\n';
  }

  // Office state
  if (office?.state) {
    msg += `:office: *Office State:* \`${office.state}\` (Floor ${office.activeFloor || '?'})\n\n`;
  }

  // Agents
  if (agents?.agents?.length) {
    msg += `*Agents (${agents.counts?.healthy || 0}/${agents.counts?.total || 0} healthy):*\n`;
    for (const a of agents.agents) {
      const icon = a.healthStatus === 'healthy' ? ':large_green_circle:'
        : a.healthStatus === 'completed' ? ':white_check_mark:'
        : a.healthStatus === 'offline' ? ':red_circle:'
        : ':yellow_circle:';
      msg += `${icon} \`${a.role}\` — ${a.dbStatus}`;
      if (a.currentTask) msg += ` _(${a.currentTask})_`;
      if (a.issue) msg += ` :warning: ${a.issue}`;
      msg += '\n';
    }
    msg += '\n';
  }

  // Tasks summary
  if (tasks?.tasks?.length) {
    const byStatus = {};
    for (const t of tasks.tasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    }
    msg += `*Tasks (${tasks.tasks.length} total):*\n`;
    for (const [status, count] of Object.entries(byStatus)) {
      msg += `• ${status}: ${count}\n`;
    }
    msg += '\n';
  }

  await slackPost(msg, ts);
}

async function handleTaskCreate(ts, params) {
  await react(ts, 'heavy_plus_sign');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const result = await dashboard('/api/tasks', 'POST', {
    projectId: activeProjectId,
    title: params.title || 'Untitled Task',
    description: params.description || '',
    priority: params.priority || 'P2',
    assignedAgent: params.assignee || null,
    status: 'TODO',
  });

  if (result.error) {
    await slackPost(`:x: Failed to create task: ${result.error}`, ts);
    return;
  }

  await slackPost(`:white_check_mark: *Task created:* ${result.title}\n• Priority: ${result.priority}\n• Status: ${result.status}${result.assignedAgent ? `\n• Assigned: \`${result.assignedAgent}\`` : ''}`, ts);
}

async function handleTaskList(ts, params) {
  await react(ts, 'clipboard');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const result = await dashboard(`/api/tasks?projectId=${activeProjectId}`);
  if (result.error) { await slackPost(`:x: ${result.error}`, ts); return; }

  let tasks = result.tasks || [];
  if (params.status_filter) tasks = tasks.filter(t => t.status === params.status_filter.toUpperCase());
  if (params.agent_filter) tasks = tasks.filter(t => t.assignedAgent === params.agent_filter);

  if (tasks.length === 0) {
    await slackPost('_No tasks found._', ts);
    return;
  }

  let msg = `*Tasks (${tasks.length}):*\n`;
  const priorityIcon = { P0: ':red_circle:', P1: ':orange_circle:', P2: ':yellow_circle:', P3: ':white_circle:' };
  for (const t of tasks.slice(0, 20)) {
    msg += `${priorityIcon[t.priority] || ':white_circle:'} *${t.title}* — \`${t.status}\``;
    if (t.assignedAgent) msg += ` (\`${t.assignedAgent}\`)`;
    msg += '\n';
  }
  if (tasks.length > 20) msg += `_...and ${tasks.length - 20} more_\n`;

  await slackPost(msg, ts);
}

async function handleTaskUpdate(ts, params) {
  await react(ts, 'pencil2');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  // Find task by query
  const all = await dashboard(`/api/tasks?projectId=${activeProjectId}`);
  const query = (params.task_query || '').toLowerCase();
  const task = all.tasks?.find(t => t.id === query || t.externalId === query)
    || (query.length >= 5 ? all.tasks?.find(t => t.title.toLowerCase().includes(query)) : null);

  if (!task) {
    await slackPost(`:x: Could not find task matching "${params.task_query}"`, ts);
    return;
  }

  const updates = {};
  if (params.new_status) updates.status = params.new_status.toUpperCase();
  if (params.new_assignee) updates.assignedAgent = params.new_assignee;

  const result = await dashboard('/api/tasks', 'PATCH', {
    id: task.id,
    projectId: activeProjectId,
    ...updates,
  });

  if (result.error) {
    await slackPost(`:x: Failed to update: ${result.error}`, ts);
    return;
  }

  await slackPost(`:white_check_mark: Updated *${task.title}*: ${Object.entries(updates).map(([k, v]) => `${k} → \`${v}\``).join(', ')}`, ts);
}

async function handleStandup(ts, params) {
  await react(ts, 'sunrise');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const result = await dashboard('/api/standup', 'POST', {
    projectId: activeProjectId,
    date: params.date || new Date().toISOString().split('T')[0],
  });

  if (result.error) {
    await slackPost(`:x: Standup failed: ${result.error}`, ts);
    return;
  }

  const report = result.report?.report;
  if (report) {
    let msg = `:sunrise: *Standup Report — ${result.report.date}*\n\n`;
    if (typeof report === 'string') {
      msg += report;
    } else if (report.summary) {
      msg += report.summary;
    } else {
      msg += JSON.stringify(report, null, 2).slice(0, 2000);
    }
    await slackPost(msg, ts);
  } else {
    await slackPost('_No standup data available._', ts);
  }
}

async function handleAnalytics(ts) {
  await react(ts, 'chart_with_upwards_trend');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const data = await dashboard(`/api/analytics?projectId=${activeProjectId}`);
  if (data.error) { await slackPost(`:x: ${data.error}`, ts); return; }

  let msg = `:chart_with_upwards_trend: *Analytics — \`${activeProjectId}\`*\n\n`;
  msg += `*Total Tasks:* ${data.totalTasks || 0}\n`;
  msg += `*Total Agents:* ${data.totalAgents || 0}\n`;

  if (data.tasksByStatus) {
    msg += '\n*Tasks by Status:*\n';
    for (const [status, count] of Object.entries(data.tasksByStatus)) {
      msg += `• ${status}: ${count}\n`;
    }
  }

  if (data.agentsByStatus) {
    msg += '\n*Agents by Status:*\n';
    for (const [status, count] of Object.entries(data.agentsByStatus)) {
      msg += `• ${status}: ${count}\n`;
    }
  }

  if (data.costData?.totalCost) {
    msg += `\n*Estimated Cost:* $${data.costData.totalCost.toFixed(2)}\n`;
  }

  await slackPost(msg, ts);
}

async function handleGitStatus(ts) {
  await react(ts, 'git');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const data = await dashboard(`/api/git?projectId=${activeProjectId}&limit=10`);
  if (data.error) { await slackPost(`:x: ${data.error}`, ts); return; }

  if (!data.commits?.length) {
    await slackPost('_No git commits found._', ts);
    return;
  }

  let msg = `:git: *Recent Commits — \`${activeProjectId}\`*\n\n`;
  for (const c of data.commits.slice(0, 10)) {
    msg += `\`${c.shortHash}\` ${c.subject} — _${c.author}, ${c.date}_\n`;
  }

  await slackPost(msg, ts);
}

async function handleOfficeStatus(ts) {
  await react(ts, 'office');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const data = await dashboard(`/api/office?projectId=${activeProjectId}`);
  if (data.error) { await slackPost(`:x: ${data.error}`, ts); return; }

  let msg = `:office: *Office Status — \`${activeProjectId}\`*\n\n`;
  msg += `*State:* \`${data.state || 'IDLE'}\`\n`;
  msg += `*Active Floor:* ${data.activeFloor || 'None'}\n\n`;

  if (data.floorStatuses) {
    for (const [floor, status] of Object.entries(data.floorStatuses)) {
      msg += `*Floor ${floor}:* ${JSON.stringify(status)}\n`;
    }
    msg += '\n';
  }

  if (data.currentSession) {
    msg += `*Current Research Session:*\n`;
    msg += `• Topic: ${data.currentSession.topic || 'N/A'}\n`;
    msg += `• State: ${data.currentSession.state || 'N/A'}\n`;
  }

  // Get recent comms
  const comms = await dashboard(`/api/office/communications?projectId=${activeProjectId}&limit=5`);
  if (comms.communications?.length) {
    msg += '\n*Recent Floor Communications:*\n';
    for (const c of comms.communications) {
      msg += `• Floor ${c.fromFloor} → Floor ${c.toFloor}: _${c.messageType}_ — ${c.content?.slice(0, 80)}\n`;
    }
  }

  await slackPost(msg, ts);
}

async function handleChatFloor(ts, params) {
  await react(ts, 'speech_balloon');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const floor = params.floor || 1;
  const result = await dashboard('/api/rataa-chat', 'POST', {
    projectId: activeProjectId,
    floor,
    message: params.message,
  });

  if (result.error) {
    await slackPost(`:x: Chat error: ${result.error}`, ts);
    return;
  }

  const name = { 1: 'Robin', 2: 'Nami & Franky', 3: 'Luffy' }[floor] || `Floor ${floor}`;
  await slackPost(`:speech_balloon: *${name}:*\n\n${result.response || '_No response_'}`, ts);
}

async function handleSendMessage(ts, params) {
  await react(ts, 'envelope');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const result = await dashboard('/api/messages', 'POST', {
    projectId: activeProjectId,
    fromAgent: 'slack-bridge',
    toAgent: params.to_agent,
    content: params.content,
    messageType: 'directive',
  });

  if (result.error) {
    await slackPost(`:x: Message failed: ${result.error}`, ts);
    return;
  }

  await slackPost(`:envelope: Message sent to \`${params.to_agent}\`: ${params.content}`, ts);
}

async function handleNotifications(ts) {
  await react(ts, 'bell');
  if (!activeProjectId) { await slackPost(':x: No active project.', ts); return; }

  const data = await dashboard(`/api/notifications?projectId=${activeProjectId}&limit=10`);
  if (data.error) { await slackPost(`:x: ${data.error}`, ts); return; }

  if (!data.notifications?.length) {
    await slackPost('_No notifications._', ts);
    return;
  }

  let msg = `:bell: *Notifications (${data.unreadCount || 0} unread):*\n\n`;
  for (const n of data.notifications.slice(0, 10)) {
    const icon = n.readAt ? ':white_circle:' : ':red_circle:';
    msg += `${icon} *${n.title}*: ${n.message}\n`;
  }
  await slackPost(msg, ts);
}

async function handleHealth(ts) {
  await react(ts, 'heartpulse');

  const data = await dashboard('/api/health');
  if (data.error) {
    await slackPost(`:red_circle: *Dashboard is DOWN:* ${data.error}`, ts);
    return;
  }

  const icon = data.status === 'ok' ? ':large_green_circle:' : ':red_circle:';
  let msg = `${icon} *System Health*\n`;
  msg += `• Status: ${data.status}\n`;
  msg += `• Uptime: ${Math.floor(data.uptime || 0)}s\n`;
  msg += `• DB: ${data.dbConnected ? 'connected' : 'disconnected'}\n`;
  msg += `• Version: ${data.version}\n`;

  // Check Ollama
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`);
    msg += `• Ollama: :large_green_circle: connected\n`;
  } catch {
    msg += `• Ollama: :red_circle: offline\n`;
  }

  await slackPost(msg, ts);
}

async function handleListProjects(ts) {
  const data = await dashboard('/api/projects');
  if (data.error) { await slackPost(`:x: ${data.error}`, ts); return; }

  if (!data.projects?.length) {
    await slackPost('_No projects registered. Send a GitHub URL to get started._', ts);
    return;
  }

  let msg = '*Projects:*\n';
  for (const p of data.projects) {
    const active = p.id === activeProjectId ? ' :arrow_left: _active_' : '';
    const demo = p.isDemo ? ' _(demo)_' : '';
    msg += `• \`${p.id}\` — ${p.name}${demo}${active}\n`;
    if (p.gitUrl) msg += `  ${p.gitUrl}\n`;
  }
  await slackPost(msg, ts);
}

async function handleSwitchProject(ts, params) {
  const name = params.project_name;
  if (!name) { await slackPost(':x: Specify a project ID. Use `projects` to see list.', ts); return; }

  const data = await dashboard('/api/projects');
  const project = data.projects?.find(p =>
    p.id === name || p.id === name.toLowerCase().replace(/[^a-z0-9]/g, '-') || p.name.toLowerCase().includes(name.toLowerCase())
  );

  if (!project) {
    await slackPost(`:x: Project "${name}" not found. Use \`projects\` to see list.`, ts);
    return;
  }

  activeProjectId = project.id;
  await slackPost(`:arrows_counterclockwise: Switched to project \`${project.id}\` (${project.name})`, ts);
}

async function handleHelp(ts) {
  await slackPost(`*ClawBot Bridge — Commands*

:mag: *Research:*
• Send a GitHub URL → clones, registers, launches Floor 1 research
• \`research <url> <optional description>\`

:dart: *Mission:*
• Type any text → sets as mission on active project
• \`mission <goal text>\`

:rocket: *Agents:*
• \`launch floor 1\` / \`launch floor 2\` / \`launch all\`
• \`stop\` / \`stop all\` — halt active agents

:bar_chart: *Status:*
• \`status\` — full dashboard status
• \`health\` — system health check
• \`office\` — 3-floor office state
• \`analytics\` — metrics & charts
• \`standup\` — generate standup report
• \`git\` — recent commits

:clipboard: *Tasks:*
• \`tasks\` — list all tasks
• \`create task <title>\` — create a task
• \`move <task> to <status>\`

:speech_balloon: *Communication:*
• \`talk to robin <message>\` — chat with Floor 1 lead
• \`talk to nami <message>\` — chat with Floor 2
• \`talk to luffy <message>\` — chat with Floor 3
• \`message <agent> <text>\` — direct message to agent
• \`notifications\` — view notifications

:file_folder: *Projects:*
• \`projects\` — list all projects
• \`switch <project-id>\` — change active project

:question: \`help\` — this message`, ts);
}

// ─── Dashboard Monitor ───
// Watches for state changes and pushes updates to Slack proactively

async function monitorDashboard() {
  if (!activeProjectId) return;

  try {
    // Check agent state changes
    const agents = await dashboard(`/api/agents?projectId=${activeProjectId}`);
    if (agents.agents) {
      for (const a of agents.agents) {
        const key = `${a.agentId || a.role}`;
        const prev = lastAgentStates[key];
        if (prev && prev !== a.status) {
          // State changed
          const icon = a.status === 'working' ? ':large_green_circle:'
            : a.status === 'completed' ? ':white_check_mark:'
            : a.status === 'blocked' ? ':warning:'
            : a.status === 'offline' ? ':red_circle:'
            : ':yellow_circle:';
          await slackPost(`${icon} Agent \`${a.role}\`: ${prev} → *${a.status}*${a.currentTask ? ` (${a.currentTask})` : ''}`);
        }
        lastAgentStates[key] = a.status;
      }
    }

    // Check office state changes
    const office = await dashboard(`/api/office?projectId=${activeProjectId}`);
    if (office.state && office.state !== lastOfficeState && lastOfficeState !== null) {
      const wf = await detectWorkflowPhase(activeProjectId);
      let msg = `:office: Office state changed: \`${lastOfficeState}\` → *\`${office.state}\`*`;

      // Add workflow context on major transitions
      const majorTransitions = {
        'PLANNING': ':brain: Research complete! Architecture planning in progress. Floor 2 dev agents will be next.',
        'DELEGATING': ':clipboard: Plan finalized! Tasks being assigned to dev agents on Floor 2.',
        'DEVELOPING': ':hammer_and_wrench: Development has started! Frontend and backend agents are building.',
        'TESTING': ':test_tube: Development done — testers are validating.',
        'BUILDING': ':package: Tests passed — building for deployment.',
        'DEPLOYING': ':rocket: Build ready — Luffy is deploying to production!',
        'COMPLETE': ':tada: *Project complete!* All deliverables shipped. Type `standup` for a final report.',
      };
      if (majorTransitions[office.state]) {
        msg += `\n${majorTransitions[office.state]}`;
      }

      msg += `\n${getNextStepGuidance(wf)}`;
      await slackPost(msg);
    }
    if (office.state) lastOfficeState = office.state;

    // Check for task completion milestones
    const tasks = await dashboard(`/api/tasks?projectId=${activeProjectId}`);
    if (tasks?.tasks) {
      const doneTasks = tasks.tasks.filter(t => t.status === 'DONE').length;
      const totalTasks = tasks.tasks.length;
      const prevDone = lastTaskCounts.done || 0;
      if (totalTasks > 0 && doneTasks > prevDone && doneTasks % 5 === 0) {
        await slackPost(`:chart_with_upwards_trend: *Milestone:* ${doneTasks}/${totalTasks} tasks completed (${Math.round(doneTasks/totalTasks*100)}%)`);
      }
      lastTaskCounts = { done: doneTasks, total: totalTasks };
    }

  } catch (err) {
    console.error('[monitor] Error:', err.message);
  }
}

// ─── Message Router ───

async function routeMessage(ts, text) {
  console.log(`[bridge] Classifying: "${text.slice(0, 80)}"`);

  // Quick keyword shortcuts before hitting Ollama
  const lower = text.toLowerCase().trim();

  if (lower === 'status') return handleStatus(ts);
  if (lower === 'help') return handleHelp(ts);
  if (lower === 'stop' || lower === 'stop all') return handleStopAgents(ts, { all: true });
  if (lower === 'health') return handleHealth(ts);
  if (lower === 'tasks' || lower === 'list tasks') return handleTaskList(ts, {});
  if (lower === 'standup') return handleStandup(ts, {});
  if (lower === 'analytics' || lower === 'metrics') return handleAnalytics(ts);
  if (lower === 'projects' || lower === 'list projects') return handleListProjects(ts);
  if (lower === 'office' || lower === 'office status') return handleOfficeStatus(ts);
  if (lower === 'notifications') return handleNotifications(ts);

  // Quick match: create project
  const createProjMatch = lower.match(/^(?:create|start|new|init(?:ialize)?)\s+(?:a\s+)?(?:new\s+)?project\s+(?:named?\s+)?(.+)$/);
  if (createProjMatch) return handleCreateProject(ts, { project_name: createProjMatch[1].trim() });

  // Quick match: delete project
  const deleteProjMatch = lower.match(/^(?:delete|remove)\s+project\s+(.+)$/);
  if (deleteProjMatch) return handleDeleteProject(ts, { project_name: deleteProjMatch[1].trim() });

  // Quick match: switch project
  const switchMatch = lower.match(/^switch\s+(?:to\s+)?(?:project\s+)?(.+)$/);
  if (switchMatch) return handleSwitchProject(ts, { project_name: switchMatch[1].trim() });

  // Quick match: GitHub URL present
  const githubMatch = text.match(/https?:\/\/github\.com\/[^\s>]+|git@github\.com:[^\s>]+/);
  if (githubMatch) {
    return handleResearchRepo(ts, { repo_url: githubMatch[0], mission_text: text });
  }

  // Quick match: launch floor N / launch agent
  const launchMatch = lower.match(/^launch\s+(floor\s+)?(\d|all)$/);
  if (launchMatch) {
    const val = launchMatch[2];
    if (val === 'all') return handleLaunchAgents(ts, { all: true });
    return handleLaunchAgents(ts, { floor: parseInt(val) });
  }

  // Quick match: launch specific agents
  const launchAgentMatch = lower.match(/^launch\s+(.+)$/);
  if (launchAgentMatch) {
    const names = launchAgentMatch[1].split(/[,\s]+and\s+|[,\s]+/).map(s => s.trim()).filter(Boolean);
    return handleLaunchAgents(ts, { agents: names });
  }

  // Quick match: create task
  const createTaskMatch = lower.match(/^(?:create|add)\s+task\s+(.+)$/);
  if (createTaskMatch) return handleTaskCreate(ts, { title: createTaskMatch[1].trim() });

  // Quick match: delete task
  const deleteTaskMatch = lower.match(/^(?:delete|remove)\s+task\s+(.+)$/);
  if (deleteTaskMatch) return handleTaskDelete(ts, { task_query: deleteTaskMatch[1].trim() });

  // Quick match: move task
  const moveTaskMatch = lower.match(/^move\s+(.+?)\s+to\s+(.+)$/);
  if (moveTaskMatch) return handleTaskUpdate(ts, { task_query: moveTaskMatch[1].trim(), new_status: moveTaskMatch[2].trim() });

  // Quick match: git log/status/commits
  if (lower.match(/^git\b/)) return handleGitStatus(ts);

  // Quick match: git commit
  const commitMatch = lower.match(/^commit\s+(.+)$/);
  if (commitMatch) return handleGitCommit(ts, { message: commitMatch[1].trim() });

  // Quick match: start research
  if (lower.match(/^(?:start|trigger|begin)\s+research/)) return handleStartResearch(ts, {});

  // Quick match: talk to <floor lead>
  const talkMatch = lower.match(/^(?:talk|speak|ask|tell)\s+(?:to\s+)?(robin|nami|franky|luffy)\s+(.+)$/i);
  if (talkMatch) {
    const floorMap = { robin: 1, nami: 2, franky: 2, luffy: 3 };
    return handleChatFloor(ts, { floor: floorMap[talkMatch[1].toLowerCase()], message: talkMatch[2] });
  }

  // Quick match: message agent
  const msgMatch = lower.match(/^(?:message|msg|dm)\s+([\w-]+)\s+(.+)$/);
  if (msgMatch) return handleSendMessage(ts, { to_agent: msgMatch[1], content: msgMatch[2] });

  // Quick match: set/update mission
  const missionMatch = lower.match(/^(?:set\s+)?mission\s+(.+)$/);
  if (missionMatch) return handleSetMission(ts, { mission_text: missionMatch[1].trim() });

  const updateMissionMatch = lower.match(/^update\s+mission\s+(?:to\s+)?(.+)$/);
  if (updateMissionMatch) return handleUpdateMission(ts, { mission_text: updateMissionMatch[1].trim() });

  // Use Ollama for complex/natural language messages
  const intent = await classifyIntent(text);
  console.log(`[bridge] Intent:`, JSON.stringify(intent));

  switch (intent.intent) {
    case 'research_repo': return handleResearchRepo(ts, intent);
    case 'create_project': return handleCreateProject(ts, intent);
    case 'delete_project': return handleDeleteProject(ts, intent);
    case 'set_mission': return handleSetMission(ts, intent);
    case 'update_mission': return handleUpdateMission(ts, intent);
    case 'launch_agents': return handleLaunchAgents(ts, intent);
    case 'stop_agents': return handleStopAgents(ts, intent);
    case 'status': return handleStatus(ts);
    case 'task_create': return handleTaskCreate(ts, intent);
    case 'task_list': return handleTaskList(ts, intent);
    case 'task_update': return handleTaskUpdate(ts, intent);
    case 'task_delete': return handleTaskDelete(ts, intent);
    case 'standup': return handleStandup(ts, intent);
    case 'analytics': return handleAnalytics(ts);
    case 'git_status': return handleGitStatus(ts);
    case 'git_commit': return handleGitCommit(ts, intent);
    case 'office_status': return handleOfficeStatus(ts);
    case 'start_research': return handleStartResearch(ts, intent);
    case 'chat_floor': return handleChatFloor(ts, intent);
    case 'send_message': return handleSendMessage(ts, intent);
    case 'notifications': return handleNotifications(ts);
    case 'health': return handleHealth(ts);
    case 'list_projects': return handleListProjects(ts);
    case 'switch_project': return handleSwitchProject(ts, intent);
    case 'schedule_job': return slackPost(':construction: Scheduling not yet implemented from Slack. Use the dashboard UI.', ts);
    case 'help': return handleHelp(ts);
    default:
      // Default: treat as a mission
      return handleSetMission(ts, { mission_text: text });
  }
}

// ─── Poll Loop ───

async function pollMessages() {
  const result = await slackApi('conversations.history', {
    channel: CHANNEL_ID,
    oldest: lastTs,
    limit: 10,
  });

  if (!result.ok) {
    if (result.error !== 'not_authed') console.error('[bridge] Slack error:', result.error);
    return;
  }

  if (!result.messages?.length) return;

  for (const msg of result.messages.reverse()) {
    if (msg.bot_id || msg.user === botUserId || msg.subtype) continue;
    lastTs = msg.ts;
    const text = (msg.text || '').trim();
    if (!text) continue;

    console.log(`[bridge] Message from ${msg.user}: ${text.slice(0, 100)}`);

    try {
      await routeMessage(msg.ts, text);
    } catch (err) {
      console.error('[bridge] Handler error:', err);
      await slackPost(`:x: Error processing message: ${err.message}`, msg.ts);
    }
  }
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   ClawBot Slack Bridge v2.0              ║');
  console.log('║   AI-Powered Dashboard Gateway           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`[bridge] Channel: #agent-missions (${CHANNEL_ID})`);
  console.log(`[bridge] Dashboard: ${DASHBOARD_URL}`);
  console.log(`[bridge] Ollama: ${OLLAMA_URL} (${OLLAMA_MODEL})`);
  console.log(`[bridge] Projects dir: ${PROJECTS_DIR}`);
  console.log('[bridge] Listening...\n');

  const auth = await slackApi('auth.test', {});
  if (auth.ok) {
    botUserId = auth.user_id;
    console.log(`[bridge] Bot: ${auth.user} (${botUserId})`);
  }

  // Main loops
  let monitorTick = 0;
  while (true) {
    try {
      await pollMessages();
    } catch (err) {
      console.error('[bridge] Poll error:', err.message);
    }

    // Run monitor every MONITOR_INTERVAL
    monitorTick += POLL_INTERVAL;
    if (monitorTick >= MONITOR_INTERVAL) {
      monitorTick = 0;
      try {
        await monitorDashboard();
      } catch (err) {
        console.error('[monitor] Error:', err.message);
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(console.error);
