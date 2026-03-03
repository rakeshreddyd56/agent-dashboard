import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { discoverProjects } from '@/lib/coordination/discover';
import { fileWatcher } from '@/lib/coordination/file-watcher';
import { cleanupProject } from '@/lib/coordination/sync-engine';
import { seedCoordination } from '@/lib/coordination/seed-coordination';
import { setupGitRepo } from '@/lib/git/setup';
import { createProjectTables, dropProjectTables, projectTablesExist } from '@/lib/db/dynamic-tables';
import fs from 'fs';

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
      gitUrl: p.gitUrl,
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
    const { name, path: projectPath, gitUrl: providedGitUrl } = body as Record<string, string | undefined>;

    if (!name || !projectPath) {
      return NextResponse.json({ error: 'name and path are required' }, { status: 400 });
    }

    // Validate path exists
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: 'Project path does not exist on disk' }, { status: 400 });
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const now = new Date().toISOString();

    // Check for duplicate
    const existing = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (existing) {
      return NextResponse.json({ error: 'Project with this ID already exists' }, { status: 409 });
    }

    // 1. Seed coordination directory
    const coordPath = seedCoordination(projectPath);

    // 2. Git setup (auto-create private repo if no URL provided)
    let gitUrl: string | null = null;
    let gitCreated = false;
    let gitError: string | undefined;
    try {
      const gitResult = setupGitRepo(projectPath, providedGitUrl || undefined);
      gitUrl = gitResult.gitUrl;
      gitCreated = gitResult.created;
      gitError = gitResult.error;
    } catch (err) {
      gitError = err instanceof Error ? err.message : String(err);
    }

    // 3. Insert project record
    db.insert(schema.projects).values({
      id,
      name,
      path: projectPath,
      coordinationPath: coordPath,
      gitUrl: gitUrl || null,
      isActive: false,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    }).run();

    // 4. Create per-project tables
    createProjectTables(id);

    // 5. Start file watcher
    fileWatcher.startWatching({
      id,
      name,
      path: projectPath,
      coordinationPath: coordPath,
      isActive: false,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      id,
      name,
      path: projectPath,
      coordinationPath: coordPath,
      gitUrl,
      gitCreated,
      gitError,
      tablesCreated: true,
    }, { status: 201 });
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

    // Drop per-project tables
    if (projectTablesExist(id)) {
      dropProjectTables(id);
    }

    // Delete related data from shared tables (for any remaining legacy data)
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
