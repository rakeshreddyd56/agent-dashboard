import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'child_process';
import fs from 'fs';

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

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { projectId, action, message, branch } = body as Record<string, string | undefined>;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!fs.existsSync(project.path)) {
      return NextResponse.json({ error: 'Project path does not exist' }, { status: 400 });
    }

    const execOpts = { cwd: project.path, encoding: 'utf-8' as const, timeout: 30000 };

    switch (action) {
      case 'commit-and-push': {
        const commitMsg = message || `Auto-commit by supervisor at ${new Date().toISOString()}`;
        try {
          execFileSync('git', ['add', '-A'], execOpts);

          const status = execFileSync('git', ['status', '--porcelain'], execOpts).trim();
          if (!status) {
            return NextResponse.json({ success: true, message: 'Nothing to commit', committed: false });
          }

          execFileSync('git', ['commit', '-m', commitMsg], execOpts);

          const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], execOpts).trim();
          const pushBranch = branch || currentBranch;
          execFileSync('git', ['push', 'origin', pushBranch], { ...execOpts, timeout: 60000 });

          const commitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], execOpts).trim();

          return NextResponse.json({
            success: true,
            committed: true,
            pushed: true,
            branch: pushBranch,
            commitHash,
            message: `Committed and pushed to ${pushBranch} (${commitHash})`,
          });
        } catch (err) {
          return NextResponse.json({
            success: false,
            error: err instanceof Error ? err.message : 'Git operation failed',
          }, { status: 500 });
        }
      }

      case 'status': {
        try {
          const status = execFileSync('git', ['status', '--porcelain'], execOpts).trim();
          const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], execOpts).trim();
          return NextResponse.json({ status, branch: currentBranch, clean: !status });
        } catch (err) {
          return NextResponse.json({
            error: err instanceof Error ? err.message : 'Git status failed',
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({
          error: `Unknown action: ${action}`,
          validActions: ['commit-and-push', 'status'],
        }, { status: 400 });
    }
  } catch (err) {
    console.error('POST /api/git error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
