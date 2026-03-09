import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getProjectAgents } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { execFileSync } from 'child_process';

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

/**
 * GET: List remote-controllable sessions.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    if (!projectTablesExist(projectId)) {
      return NextResponse.json({ sessions: [] });
    }

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get();
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const agents = getProjectAgents(projectId);
    const tmuxSessions = getTmuxSessions();
    const prefix = getProjectPrefix(project.name);

    const sessions = agents
      .filter((a) => a.status === 'working' || a.status === 'initializing' || a.status === 'planning' || a.status === 'reviewing')
      .map((agent) => {
        const sessionName = tmuxSessions.find((s) => s === agent.agent_id || s.endsWith('-' + agent.agent_id)) || `${prefix}-${agent.agent_id}`;
        const isLive = tmuxSessions.includes(sessionName);

        return {
          agentId: agent.agent_id,
          role: agent.role,
          status: agent.status,
          launchMode: agent.launch_mode || 'tmux',
          sessionName: isLive ? sessionName : null,
          sdkSessionId: agent.sdk_session_id,
          isLive,
          remoteCommand: isLive && agent.launch_mode !== 'sdk'
            ? `claude remote-control --session ${sessionName}`
            : null,
          teleportSessionId: agent.launch_mode === 'sdk' ? agent.sdk_session_id : null,
        };
      });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('GET /api/remote-control error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST: Get remote control instructions for a specific agent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, projectId } = body;

    if (!agentId || !projectId) {
      return NextResponse.json({ error: 'agentId and projectId required' }, { status: 400 });
    }

    if (!projectTablesExist(projectId)) {
      return NextResponse.json({ error: 'Project tables not found' }, { status: 404 });
    }

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get();
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const agents = getProjectAgents(projectId);
    const agent = agents.find((a) => a.agent_id === agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const tmuxSessions = getTmuxSessions();
    const prefix = getProjectPrefix(project.name);
    const sessionName = tmuxSessions.find((s) => s === agent.agent_id || s.endsWith('-' + agent.agent_id)) || `${prefix}-${agent.agent_id}`;
    const isLive = tmuxSessions.includes(sessionName);

    if (agent.launch_mode === 'sdk') {
      return NextResponse.json({
        type: 'sdk',
        agentId: agent.agent_id,
        sdkSessionId: agent.sdk_session_id,
        instructions: `Use 'claude --teleport' with session ID: ${agent.sdk_session_id}`,
        teleportUrl: agent.sdk_session_id ? `https://claude.ai/code?session=${agent.sdk_session_id}` : null,
      });
    }

    if (isLive) {
      return NextResponse.json({
        type: 'tmux',
        agentId: agent.agent_id,
        sessionName,
        instructions: `Run: claude remote-control --session ${sessionName}`,
        remoteCommand: `claude remote-control --session ${sessionName}`,
        attachCommand: `tmux attach-session -t ${sessionName}`,
      });
    }

    return NextResponse.json({
      type: 'offline',
      agentId: agent.agent_id,
      instructions: 'Agent session is not currently active.',
    });
  } catch (err) {
    console.error('POST /api/remote-control error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
