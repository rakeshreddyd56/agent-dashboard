import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc, and, like, gte, lte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const action = searchParams.get('action');
  const actor = searchParams.get('actor');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
  const offset = parseInt(searchParams.get('offset') || '0');

  // Build conditions
  const conditions = [];
  if (projectId) conditions.push(eq(schema.auditLog.projectId, projectId));
  if (action) conditions.push(like(schema.auditLog.action, `%${action}%`));
  if (actor) conditions.push(eq(schema.auditLog.actor, actor));
  if (startDate) conditions.push(gte(schema.auditLog.createdAt, startDate));
  if (endDate) conditions.push(lte(schema.auditLog.createdAt, endDate));

  let query = db.select().from(schema.auditLog);

  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as typeof query;
  }

  const entries = query
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit)
    .offset(offset)
    .all()
    .map((entry) => ({
      ...entry,
      detail: entry.detail ? JSON.parse(entry.detail) : null,
    }));

  return NextResponse.json({ entries, count: entries.length, limit, offset });
}
