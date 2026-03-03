import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const agents = db
    .select()
    .from(schema.agentSnapshots)
    .where(eq(schema.agentSnapshots.projectId, projectId))
    .all()
    .map((a) => ({
      ...a,
      lockedFiles: JSON.parse(a.lockedFiles || '[]'),
    }));

  return NextResponse.json({ agents });
}
