import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'child_process';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limitParam = searchParams.get('limit') || '20';

    // Validate limit is a positive integer
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: 'limit must be a positive integer (1-100)' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    if (!project) {
      return NextResponse.json({ error: 'project not found' }, { status: 404 });
    }

    try {
      const output = execFileSync('git', [
        'log',
        '--oneline',
        `-${limit}`,
        '--format=%H|%h|%s|%an|%ai',
      ], {
        cwd: project.path,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();

      if (!output) {
        return NextResponse.json({ commits: [] });
      }

      const commits = output.split('\n').filter(Boolean).map((line) => {
        const [hash, shortHash, subject, author, date] = line.split('|');
        return { hash, shortHash, subject, author, date };
      });

      return NextResponse.json({ commits });
    } catch {
      return NextResponse.json({ commits: [], error: 'Not a git repository or git unavailable' });
    }
  } catch (err) {
    console.error('GET /api/git error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
