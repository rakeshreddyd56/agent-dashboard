import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const date = req.nextUrl.searchParams.get('date');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30');

  try {
    if (date) {
      const session = db.select().from(schema.researchSessions)
        .where(and(
          eq(schema.researchSessions.projectId, projectId),
          eq(schema.researchSessions.date, date),
        ))
        .get();

      return NextResponse.json({ session });
    }

    const sessions = db.select().from(schema.researchSessions)
      .where(eq(schema.researchSessions.projectId, projectId))
      .orderBy(desc(schema.researchSessions.createdAt))
      .limit(limit)
      .all();

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('GET /api/office/research error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
