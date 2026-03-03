import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';

const VALID_STATUSES = new Set(['BACKLOG', 'TODO', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'TESTING', 'FAILED', 'TESTED', 'DONE']);
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const tasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .all()
    .map((t) => ({
      ...t,
      tags: JSON.parse(t.tags || '[]'),
      dependencies: JSON.parse(t.dependencies || '[]'),
    }));

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { projectId, title, description, status, priority, assignedAgent, tags, effort, dependencies } = body as Record<string, string | string[] | undefined>;

    if (!projectId || !title) {
      return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
    }

    if (status && !VALID_STATUSES.has(status as string)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }
    if (priority && !VALID_PRIORITIES.has(priority as string)) {
      return NextResponse.json({ error: `Invalid priority: ${priority}` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `${projectId}-dash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Get next column order
    const maxOrder = db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId as string), eq(schema.tasks.status, (status as string) || 'BACKLOG')))
      .all();

    db.insert(schema.tasks).values({
      id,
      projectId: projectId as string,
      title: title as string,
      description: (description as string) || null,
      status: (status as string) || 'BACKLOG',
      priority: (priority as string) || 'P2',
      assignedAgent: (assignedAgent as string) || null,
      tags: JSON.stringify(tags || []),
      effort: (effort as string) || null,
      dependencies: JSON.stringify(dependencies || []),
      source: 'dashboard',
      columnOrder: maxOrder.length,
      createdAt: now,
      updatedAt: now,
    }).run();

    const task = {
      id,
      projectId,
      title,
      description,
      status: status || 'BACKLOG',
      priority: priority || 'P2',
      assignedAgent,
      tags: tags || [],
      effort,
      dependencies: dependencies || [],
      source: 'dashboard',
      columnOrder: maxOrder.length,
      createdAt: now,
      updatedAt: now,
    };

    eventBus.broadcast('task.created', task, projectId as string);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

    const existing = db.select().from(schema.tasks).where(eq(schema.tasks.id, id as string)).get();
    if (!existing) {
      return NextResponse.json({ error: 'task not found' }, { status: 404 });
    }

    if (updates.status !== undefined && !VALID_STATUSES.has(updates.status as string)) {
      return NextResponse.json({ error: `Invalid status: ${updates.status}` }, { status: 400 });
    }
    if (updates.priority !== undefined && !VALID_PRIORITIES.has(updates.priority as string)) {
      return NextResponse.json({ error: `Invalid priority: ${updates.priority}` }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.assignedAgent !== undefined) updateData.assignedAgent = updates.assignedAgent;
    if (updates.tags !== undefined) updateData.tags = JSON.stringify(updates.tags);
    if (updates.effort !== undefined) updateData.effort = updates.effort;
    if (updates.columnOrder !== undefined) updateData.columnOrder = updates.columnOrder;

    db.update(schema.tasks).set(updateData).where(eq(schema.tasks.id, id as string)).run();

    const updated = db.select().from(schema.tasks).where(eq(schema.tasks.id, id as string)).get();
    if (updated) {
      eventBus.broadcast('task.updated', {
        ...updated,
        tags: JSON.parse(updated.tags || '[]'),
        dependencies: JSON.parse(updated.dependencies || '[]'),
      }, updated.projectId);
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/tasks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
    db.delete(schema.tasks).where(eq(schema.tasks.id, id)).run();

    if (task) {
      eventBus.broadcast('task.deleted', { id }, task.projectId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/tasks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
