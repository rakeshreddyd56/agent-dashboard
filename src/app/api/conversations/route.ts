import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const conversations = db.select().from(schema.conversations)
    .where(eq(schema.conversations.projectId, projectId))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .all()
    .map((c) => ({
      ...c,
      participants: JSON.parse(c.participants),
    }));

  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, name, participants } = body;

  if (!projectId || !participants || !Array.isArray(participants)) {
    return NextResponse.json({ error: 'projectId and participants[] required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.insert(schema.conversations).values({
    id,
    projectId,
    name: name || participants.join(', '),
    participants: JSON.stringify(participants),
    lastMessageAt: null,
    createdAt: now,
  }).run();

  return NextResponse.json({ success: true, id });
}
