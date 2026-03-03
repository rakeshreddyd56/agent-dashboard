import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const templates = db.select().from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.projectId, projectId))
    .orderBy(desc(schema.workflowTemplates.updatedAt))
    .all()
    .map((t) => ({ ...t, tags: JSON.parse(t.tags) }));

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { projectId, name, description, taskTitle, taskDescription, assignToRole, priority, estimatedEffort, tags } = body;

    if (!projectId || !name || !taskTitle) {
      return NextResponse.json({ error: 'projectId, name, and taskTitle required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    db.insert(schema.workflowTemplates).values({
      id,
      projectId: projectId as string,
      name: name as string,
      description: (description as string) || null,
      taskTitle: taskTitle as string,
      taskDescription: (taskDescription as string) || null,
      assignToRole: (assignToRole as string) || null,
      priority: (priority as string) || 'P2',
      estimatedEffort: (estimatedEffort as string) || null,
      tags: JSON.stringify(tags || []),
      createdAt: now,
      updatedAt: now,
    }).run();

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('POST /api/workflow-templates error:', err);
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
    if (updates.taskTitle !== undefined) setObj.taskTitle = updates.taskTitle;
    if (updates.taskDescription !== undefined) setObj.taskDescription = updates.taskDescription;
    if (updates.assignToRole !== undefined) setObj.assignToRole = updates.assignToRole;
    if (updates.priority !== undefined) setObj.priority = updates.priority;
    if (updates.estimatedEffort !== undefined) setObj.estimatedEffort = updates.estimatedEffort;
    if (updates.tags !== undefined) setObj.tags = JSON.stringify(updates.tags);

    db.update(schema.workflowTemplates).set(setObj).where(eq(schema.workflowTemplates.id, id as string)).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/workflow-templates error:', err);
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

    db.delete(schema.workflowTemplates).where(eq(schema.workflowTemplates.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/workflow-templates error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
