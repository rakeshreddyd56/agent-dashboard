import { NextRequest, NextResponse } from 'next/server';
import { eventBus } from '@/lib/events/event-bus';
import {
  getProjectTasks,
  getProjectTask,
  upsertProjectTask,
  updateProjectTask,
  deleteProjectTask,
} from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';

const VALID_STATUSES = new Set(['BACKLOG', 'TODO', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'TESTING', 'FAILED', 'TESTED', 'DONE']);
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }

  const rawTasks = getProjectTasks(projectId).map((t) => ({
    id: t.id,
    projectId,
    externalId: t.external_id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignedAgent: t.assigned_agent,
    tags: JSON.parse(t.tags || '[]'),
    effort: t.effort,
    dependencies: JSON.parse(t.dependencies || '[]'),
    source: t.source,
    columnOrder: t.column_order,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  // Deduplicate by externalId — prefer tasks_md over coordination source
  const seenExt = new Set<string>();
  const tasks = rawTasks
    .sort((a, b) => (a.source === 'tasks_md' ? -1 : b.source === 'tasks_md' ? 1 : 0))
    .filter((t) => {
      if (t.externalId && seenExt.has(t.externalId)) return false;
      if (t.externalId) seenExt.add(t.externalId);
      return true;
    });

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

    if (!projectTablesExist(projectId as string)) {
      createProjectTables(projectId as string);
    }

    const now = new Date().toISOString();
    const id = `${projectId}-dash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const taskStatus = (status as string) || 'BACKLOG';

    // Get next column order
    const existingTasks = getProjectTasks(projectId as string).filter((t) => t.status === taskStatus);

    upsertProjectTask(projectId as string, {
      id,
      external_id: null,
      title: title as string,
      description: (description as string) || null,
      status: taskStatus,
      priority: (priority as string) || 'P2',
      assigned_agent: (assignedAgent as string) || null,
      tags: JSON.stringify(tags || []),
      effort: (effort as string) || null,
      dependencies: JSON.stringify(dependencies || []),
      source: 'dashboard',
      column_order: existingTasks.length,
      created_at: now,
      updated_at: now,
    });

    const task = {
      id,
      projectId,
      title,
      description,
      status: taskStatus,
      priority: priority || 'P2',
      assignedAgent,
      tags: tags || [],
      effort,
      dependencies: dependencies || [],
      source: 'dashboard',
      columnOrder: existingTasks.length,
      createdAt: now,
      updatedAt: now,
    };

    eventBus.broadcast('task.created', task, projectId as string);
    return NextResponse.json({
      ...task,
      undo: {
        method: 'DELETE',
        url: `/api/tasks?id=${id}&projectId=${projectId}`,
        description: `Delete task "${title}"`,
      },
    }, { status: 201 });
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
    const { id, projectId, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const existing = getProjectTask(projectId as string, id as string);
    if (!existing) {
      return NextResponse.json({ error: 'task not found' }, { status: 404 });
    }

    if (updates.status !== undefined && !VALID_STATUSES.has(updates.status as string)) {
      return NextResponse.json({ error: `Invalid status: ${updates.status}` }, { status: 400 });
    }
    if (updates.priority !== undefined && !VALID_PRIORITIES.has(updates.priority as string)) {
      return NextResponse.json({ error: `Invalid priority: ${updates.priority}` }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.assignedAgent !== undefined) updateData.assigned_agent = updates.assignedAgent;
    if (updates.tags !== undefined) updateData.tags = JSON.stringify(updates.tags);
    if (updates.effort !== undefined) updateData.effort = updates.effort;
    if (updates.columnOrder !== undefined) updateData.column_order = updates.columnOrder;

    updateProjectTask(projectId as string, id as string, updateData);

    const updated = getProjectTask(projectId as string, id as string);
    if (updated) {
      eventBus.broadcast('task.updated', {
        id: updated.id,
        projectId,
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        assignedAgent: updated.assigned_agent,
        tags: JSON.parse(updated.tags || '[]'),
        dependencies: JSON.parse(updated.dependencies || '[]'),
        updatedAt: updated.updated_at,
      }, projectId as string);
    }

    // Build undo payload from the previous state
    const undoBody: Record<string, unknown> = { id, projectId };
    if (updates.status !== undefined) undoBody.status = existing.status;
    if (updates.priority !== undefined) undoBody.priority = existing.priority;
    if (updates.title !== undefined) undoBody.title = existing.title;
    if (updates.description !== undefined) undoBody.description = existing.description;
    if (updates.assignedAgent !== undefined) undoBody.assignedAgent = existing.assigned_agent;
    if (updates.tags !== undefined) undoBody.tags = JSON.parse(existing.tags || '[]');
    if (updates.effort !== undefined) undoBody.effort = existing.effort;
    if (updates.columnOrder !== undefined) undoBody.columnOrder = existing.column_order;

    return NextResponse.json(updated ? {
      ...updated,
      projectId,
      tags: JSON.parse(updated.tags || '[]'),
      dependencies: JSON.parse(updated.dependencies || '[]'),
      undo: {
        method: 'PATCH',
        url: '/api/tasks',
        body: undoBody,
        description: `Revert task "${updated.title}" changes`,
      },
    } : null);
  } catch (err) {
    console.error('PATCH /api/tasks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const projectId = searchParams.get('projectId');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const task = getProjectTask(projectId, id);
    deleteProjectTask(projectId, id);

    if (task) {
      eventBus.broadcast('task.deleted', { id }, projectId);
    }

    return NextResponse.json({
      ok: true,
      undo: task ? {
        method: 'POST',
        url: '/api/tasks',
        body: {
          projectId,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignedAgent: task.assigned_agent,
          tags: JSON.parse(task.tags || '[]'),
          effort: task.effort,
          dependencies: JSON.parse(task.dependencies || '[]'),
        },
        description: `Recreate task "${task.title}"`,
      } : undefined,
    });
  } catch (err) {
    console.error('DELETE /api/tasks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
