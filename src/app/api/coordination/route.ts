import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const file = searchParams.get('file');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  if (file) {
    // Validate path to prevent traversal attacks
    const resolvedCoord = path.resolve(project.coordinationPath);
    const resolvedFile = path.resolve(path.join(project.coordinationPath, file));
    const relative = path.relative(resolvedCoord, resolvedFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    try {
      if (!fs.existsSync(resolvedFile)) {
        return NextResponse.json({ content: null, exists: false });
      }
      const content = fs.readFileSync(resolvedFile, 'utf-8');
      return NextResponse.json({ content, exists: true });
    } catch {
      return NextResponse.json({ content: null, exists: false, error: 'Read error' });
    }
  }

  // List all coordination files
  try {
    if (!fs.existsSync(project.coordinationPath)) {
      return NextResponse.json({ files: [], exists: false });
    }
    const files = fs.readdirSync(project.coordinationPath);
    return NextResponse.json({
      files: files.map((f) => ({
        name: f,
        size: fs.statSync(path.join(project.coordinationPath, f)).size,
      })),
      exists: true,
    });
  } catch {
    return NextResponse.json({ files: [], exists: false });
  }
}
