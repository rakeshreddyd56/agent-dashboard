import fs from 'fs';
import path from 'path';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { seedDemoData } from './seed-demo';

export function discoverProjects() {
  const defaultPaths = (process.env.DEFAULT_PROJECTS || '').split(',').filter(Boolean);

  for (const projectPath of defaultPaths) {
    const trimmed = projectPath.trim();
    if (!fs.existsSync(trimmed)) continue;

    // Try both coordination path patterns
    let coordinationPath = '';
    const candidates = [
      path.join(trimmed, '.claude', 'coordination'),
      path.join(trimmed, 'coordination'),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        coordinationPath = c;
        break;
      }
    }

    // Even if coordination path doesn't exist yet, register the project
    if (!coordinationPath) {
      coordinationPath = path.join(trimmed, '.claude', 'coordination');
    }

    const name = path.basename(trimmed);
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Check if already registered
    const existing = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (existing) continue;

    const now = new Date().toISOString();
    db.insert(schema.projects).values({
      id,
      name,
      path: trimmed,
      coordinationPath,
      isActive: false,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  // Seed demo data
  seedDemoData();

  // Set first real project as active if none active
  const allProjects = db.select().from(schema.projects).all();
  const hasActive = allProjects.some((p) => p.isActive);
  if (!hasActive && allProjects.length > 0) {
    const first = allProjects.find((p) => !p.isDemo) || allProjects[0];
    db.update(schema.projects)
      .set({ isActive: true })
      .where(eq(schema.projects.id, first.id))
      .run();
  }

  return db.select().from(schema.projects).all();
}
