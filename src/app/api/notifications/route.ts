import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const recipient = searchParams.get('recipient');
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const conditions = [eq(schema.notifications.projectId, projectId)];
  if (recipient) conditions.push(eq(schema.notifications.recipient, recipient));
  if (unreadOnly) conditions.push(isNull(schema.notifications.readAt));

  const notifications = db.select().from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .all();

  // Count unread
  const unreadConditions = [eq(schema.notifications.projectId, projectId), isNull(schema.notifications.readAt)];
  if (recipient) unreadConditions.push(eq(schema.notifications.recipient, recipient));

  const unreadCount = db.select().from(schema.notifications)
    .where(and(...unreadConditions))
    .all().length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { notificationIds, markAllRead, projectId, recipient } = body;

  const now = new Date().toISOString();
  let updated = 0;

  if (markAllRead && projectId) {
    const conditions = [eq(schema.notifications.projectId, projectId), isNull(schema.notifications.readAt)];
    if (recipient) conditions.push(eq(schema.notifications.recipient, recipient));

    const result = db.update(schema.notifications)
      .set({ readAt: now })
      .where(and(...conditions))
      .run();
    updated = result.changes;
  } else if (notificationIds && Array.isArray(notificationIds)) {
    for (const id of notificationIds) {
      const result = db.update(schema.notifications)
        .set({ readAt: now })
        .where(eq(schema.notifications.id, id))
        .run();
      updated += result.changes;
    }
  }

  if (projectId) {
    eventBus.broadcast('notification.read', { updated }, projectId);
  }

  return NextResponse.json({ success: true, updated });
}
