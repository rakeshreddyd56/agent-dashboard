import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc, or } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const conversationId = searchParams.get('conversationId');
  const agentId = searchParams.get('agentId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (conversationId) {
    const messages = db.select().from(schema.messages)
      .where(and(
        eq(schema.messages.projectId, projectId),
        eq(schema.messages.conversationId, conversationId),
      ))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .all()
      .reverse();

    return NextResponse.json({ messages });
  }

  if (agentId) {
    const messages = db.select().from(schema.messages)
      .where(and(
        eq(schema.messages.projectId, projectId),
        or(
          eq(schema.messages.fromAgent, agentId),
          eq(schema.messages.toAgent, agentId),
        ),
      ))
      .orderBy(desc(schema.messages.createdAt))
      .limit(limit)
      .all()
      .reverse();

    return NextResponse.json({ messages });
  }

  const messages = db.select().from(schema.messages)
    .where(eq(schema.messages.projectId, projectId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit)
    .all()
    .reverse();

  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, fromAgent, toAgent, content, messageType, metadata } = body;

  if (!projectId || !fromAgent || !content) {
    return NextResponse.json({ error: 'projectId, fromAgent, and content required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Auto-create or find conversation
  const conversationId = toAgent
    ? `dm:${[fromAgent, toAgent].sort().join(':')}`
    : `broadcast:${projectId}`;

  // Upsert conversation
  const existingConv = db.select().from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .get();

  if (!existingConv) {
    const participants = toAgent ? [fromAgent, toAgent] : [fromAgent];
    db.insert(schema.conversations).values({
      id: conversationId,
      projectId,
      name: toAgent ? `${fromAgent} & ${toAgent}` : 'Broadcast',
      participants: JSON.stringify(participants),
      lastMessageAt: now,
      createdAt: now,
    }).run();
  } else {
    db.update(schema.conversations)
      .set({ lastMessageAt: now })
      .where(eq(schema.conversations.id, conversationId))
      .run();
  }

  db.insert(schema.messages).values({
    id,
    projectId,
    conversationId,
    fromAgent,
    toAgent: toAgent || null,
    content,
    messageType: messageType || 'text',
    metadata: metadata ? JSON.stringify(metadata) : null,
    readAt: null,
    createdAt: now,
  }).run();

  eventBus.broadcast('message.created', {
    id, projectId, conversationId, fromAgent, toAgent, content, messageType,
  }, projectId);

  return NextResponse.json({ success: true, id, conversationId });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { messageIds, agentId } = body;

  if (!messageIds || !agentId) {
    return NextResponse.json({ error: 'messageIds and agentId required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const msgId of messageIds) {
    const result = db.update(schema.messages)
      .set({ readAt: now })
      .where(and(
        eq(schema.messages.id, msgId),
        eq(schema.messages.toAgent, agentId),
      ))
      .run();
    updated += result.changes;
  }

  eventBus.broadcast('message.read', { messageIds, agentId }, '');

  return NextResponse.json({ success: true, updated });
}
