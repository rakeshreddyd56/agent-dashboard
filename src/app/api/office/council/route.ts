import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const members = db.select().from(schema.councilMembers)
    .where(eq(schema.councilMembers.projectId, projectId))
    .all();

  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, name, provider, model, role } = body;

    if (!projectId || !name || !provider || !model) {
      return NextResponse.json({ error: 'projectId, name, provider, model required' }, { status: 400 });
    }

    const id = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    db.insert(schema.councilMembers).values({
      id,
      projectId,
      name,
      provider,
      model,
      role: role || 'member',
      isActive: true,
      totalVotes: 0,
      createdAt: new Date().toISOString(),
    }).run();

    const member = db.select().from(schema.councilMembers)
      .where(eq(schema.councilMembers.id, id))
      .get();

    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error('POST /api/office/council error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, memberId } = body;

    if (!projectId || !memberId) {
      return NextResponse.json({ error: 'projectId, memberId required' }, { status: 400 });
    }

    db.delete(schema.councilMembers)
      .where(and(
        eq(schema.councilMembers.id, memberId),
        eq(schema.councilMembers.projectId, projectId),
      ))
      .run();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/office/council error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
