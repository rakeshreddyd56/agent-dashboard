import { NextRequest, NextResponse } from 'next/server';
import { getProjectAgents } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  const agents = getProjectAgents(projectId).map((a) => ({
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

  return NextResponse.json({ agents });
}
