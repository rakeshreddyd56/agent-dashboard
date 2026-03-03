import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Only allow safe characters in role/session names
function sanitizeName(name: string): string | null {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '');
  return sanitized.length > 0 && sanitized.length <= 50 ? sanitized : null;
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
    const { projectId, agents: agentRoles, launchAll } = body;

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

    // Option 1: Launch all agents via launch-agents.sh
    if (launchAll) {
      const launchScript = path.join(scriptsDir, 'launch-agents.sh');
      if (!fs.existsSync(launchScript)) {
        return NextResponse.json({ error: 'launch-agents.sh not found' }, { status: 400 });
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

      // Check if already running
      if (activeSessions.includes(sessionName)) {
        results.push({ role: sanitizedRole, status: 'already_running', session: sessionName });
        continue;
      }

      // Check for run script
      const scriptPath = path.join(scriptsDir, `run-${sanitizedRole}.sh`);
      if (!fs.existsSync(scriptPath)) {
        results.push({ role: sanitizedRole, status: 'error', error: `Script run-${sanitizedRole}.sh not found` });
        continue;
      }

      try {
        const shellCmd = `bash scripts/run-${sanitizedRole}.sh 2>&1 | tee /tmp/${sessionName}.log; echo '${sanitizedRole.toUpperCase()} DONE'; sleep 999999`;
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
        results.push({ role: sanitizedRole, status: 'launched', session: sessionName });
      } catch (err) {
        results.push({
          role: sanitizedRole,
          status: 'error',
          error: err instanceof Error ? err.message : 'Launch failed',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('POST /api/agents/launch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
