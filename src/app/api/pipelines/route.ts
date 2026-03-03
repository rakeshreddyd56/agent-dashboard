import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const pipelines = db.select().from(schema.workflowPipelines)
    .where(eq(schema.workflowPipelines.projectId, projectId))
    .orderBy(desc(schema.workflowPipelines.updatedAt))
    .all()
    .map((p) => ({ ...p, steps: JSON.parse(p.steps) }));

  return NextResponse.json({ pipelines });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { projectId, name, description, steps } = body;

    if (!projectId || !name || !steps || !Array.isArray(steps)) {
      return NextResponse.json({ error: 'projectId, name, and steps[] required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    db.insert(schema.workflowPipelines).values({
      id,
      projectId: projectId as string,
      name: name as string,
      description: (description as string) || null,
      steps: JSON.stringify(steps),
      useCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('POST /api/pipelines error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const setObj: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) setObj.name = updates.name;
    if (updates.description !== undefined) setObj.description = updates.description;
    if (updates.steps !== undefined) setObj.steps = JSON.stringify(updates.steps);

    db.update(schema.workflowPipelines).set(setObj).where(eq(schema.workflowPipelines.id, id as string)).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/pipelines error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    db.delete(schema.workflowPipelines).where(eq(schema.workflowPipelines.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/pipelines error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
