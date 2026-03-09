import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';
import { getProjectTask, updateProjectTask } from '@/lib/db/project-queries';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const taskId = searchParams.get('taskId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (taskId) {
    const reviews = db.select().from(schema.qualityReviews)
      .where(and(eq(schema.qualityReviews.projectId, projectId), eq(schema.qualityReviews.taskId, taskId)))
      .orderBy(desc(schema.qualityReviews.createdAt))
      .all();
    return NextResponse.json({ reviews });
  }

  // Return latest review per task for board view
  const reviews = db.select().from(schema.qualityReviews)
    .where(eq(schema.qualityReviews.projectId, projectId))
    .orderBy(desc(schema.qualityReviews.createdAt))
    .all();

  // Group by taskId, keep latest
  const latest: Record<string, typeof reviews[0]> = {};
  for (const r of reviews) {
    if (!latest[r.taskId]) latest[r.taskId] = r;
  }

  return NextResponse.json({ reviews: Object.values(latest) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, taskId, reviewer, status, notes } = body;

  if (!projectId || !taskId || !reviewer || !status) {
    return NextResponse.json({ error: 'projectId, taskId, reviewer, and status required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.insert(schema.qualityReviews).values({
    id,
    projectId,
    taskId,
    reviewer,
    status,
    notes: notes || null,
    createdAt: now,
  }).run();

  // If approved and task is in QUALITY_REVIEW, auto-advance to DONE
  if (status === 'approved') {
    const task = getProjectTask(projectId, taskId);

    if (task && task.status === 'QUALITY_REVIEW') {
      updateProjectTask(projectId, taskId, { status: 'DONE', updated_at: now });
      eventBus.broadcast('task.status_changed', {
        id: taskId, title: task.title, status: 'DONE', previousStatus: 'QUALITY_REVIEW',
      }, projectId);
    }
  }

  eventBus.broadcast('review.decided', { id, taskId, reviewer, status }, projectId);

  return NextResponse.json({ success: true, id });
}
