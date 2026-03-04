import { NextRequest, NextResponse } from 'next/server';
import { getProjectAgents } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const include = searchParams.get('include');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  // Return system prompts if requested
  if (include === 'prompts') {
    try {
      const prompts = db.select().from(schema.agentSystemPrompts)
        .where(eq(schema.agentSystemPrompts.projectId, projectId))
        .orderBy(desc(schema.agentSystemPrompts.createdAt))
        .limit(50)
        .all();
      return NextResponse.json({ prompts });
    } catch {
      return NextResponse.json({ prompts: [] });
    }
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
