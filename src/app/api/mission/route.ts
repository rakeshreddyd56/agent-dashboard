import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { eventBus } from '@/lib/events/event-bus';

function getMissionPath(coordinationPath: string): string {
  return path.join(coordinationPath, 'mission.json');
}

export async function GET(req: NextRequest) {
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

  const missionPath = getMissionPath(project.coordinationPath);

  try {
    if (fs.existsSync(missionPath)) {
      const content = fs.readFileSync(missionPath, 'utf-8');
      const mission = JSON.parse(content);
      return NextResponse.json({ mission, exists: true });
    }
    return NextResponse.json({ mission: null, exists: false });
  } catch {
    return NextResponse.json({ mission: null, exists: false });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, goal, techStack, deliverables, agentTeam } = body;

  if (!projectId || !goal) {
    return NextResponse.json({ error: 'projectId and goal are required' }, { status: 400 });
  }

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const mission = {
    goal: goal || '',
    techStack: techStack || '',
    deliverables: Array.isArray(deliverables) ? deliverables : [],
    agentTeam: Array.isArray(agentTeam) ? agentTeam : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Ensure coordination directory exists
  const coordDir = project.coordinationPath;
  if (!fs.existsSync(coordDir)) {
    fs.mkdirSync(coordDir, { recursive: true });
  }

  const missionPath = getMissionPath(coordDir);
  fs.writeFileSync(missionPath, JSON.stringify(mission, null, 2), 'utf-8');

  // Emit SSE event
  eventBus.broadcast('mission.updated', { mission }, projectId);

  return NextResponse.json({ mission, saved: true });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { projectId, ...updates } = body;

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

  const missionPath = getMissionPath(project.coordinationPath);

  let existing = {
    goal: '',
    techStack: '',
    deliverables: [] as string[],
    agentTeam: [] as string[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    if (fs.existsSync(missionPath)) {
      existing = JSON.parse(fs.readFileSync(missionPath, 'utf-8'));
    }
  } catch {
    // use defaults
  }

  const mission = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(missionPath, JSON.stringify(mission, null, 2), 'utf-8');
  eventBus.broadcast('mission.updated', { mission }, projectId);

  return NextResponse.json({ mission, saved: true });
}
