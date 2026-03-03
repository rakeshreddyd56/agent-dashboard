import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { discoverProjects } from '@/lib/coordination/discover';
import { fileWatcher } from '@/lib/coordination/file-watcher';
import { cleanupProject } from '@/lib/coordination/sync-engine';

// One-time initialization flag
let discoveryDone = false;

export async function GET() {
  // Discover projects only once per server lifecycle
  if (!discoveryDone) {
    discoverProjects();
    discoveryDone = true;
  }

  const projects = db.select().from(schema.projects).all();

  // Start watchers for projects with existing coordination dirs
  for (const p of projects) {
    if (!p.isDemo && !fileWatcher.isWatching(p.id)) {
      const fs = await import('fs');
      if (fs.existsSync(p.coordinationPath)) {
        fileWatcher.startWatching({
          id: p.id,
          name: p.name,
          path: p.path,
          coordinationPath: p.coordinationPath,
          isActive: !!p.isActive,
          isDemo: !!p.isDemo,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        });
      }
    }
  }

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      coordinationPath: p.coordinationPath,
      isActive: p.isActive,
      isDemo: p.isDemo,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { name, path: projectPath, coordinationPath } = body as Record<string, string | undefined>;

    if (!name || !projectPath) {
      return NextResponse.json({ error: 'name and path are required' }, { status: 400 });
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const now = new Date().toISOString();
    const coordPath = coordinationPath || `${projectPath}/.claude/coordination`;

    // Check for duplicate
    const existing = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (existing) {
      return NextResponse.json({ error: 'Project with this ID already exists' }, { status: 409 });
    }

    db.insert(schema.projects).values({
      id,
      name,
      path: projectPath,
      coordinationPath: coordPath,
      isActive: false,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    }).run();

    return NextResponse.json({ id, name, path: projectPath, coordinationPath: coordPath }, { status: 201 });
  } catch (err) {
    console.error('POST /api/projects error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    fileWatcher.stopWatching(id);
    cleanupProject(id);

    // Delete related data
    db.delete(schema.tasks).where(eq(schema.tasks.projectId, id)).run();
    db.delete(schema.agentSnapshots).where(eq(schema.agentSnapshots.projectId, id)).run();
    db.delete(schema.events).where(eq(schema.events.projectId, id)).run();
    db.delete(schema.fileLocks).where(eq(schema.fileLocks.projectId, id)).run();
    db.delete(schema.analyticsSnapshots).where(eq(schema.analyticsSnapshots.projectId, id)).run();
    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/projects error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
