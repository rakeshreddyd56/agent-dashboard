import fs from 'fs';
import path from 'path';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { seedDemoData } from './seed-demo';
import { seedCoordination } from './seed-coordination';
import { createProjectTables, projectTablesExist, migrateProjectData } from '@/lib/db/dynamic-tables';

export function discoverProjects() {
  const defaultPaths = (process.env.DEFAULT_PROJECTS || '').split(',').filter(Boolean);

  for (const projectPath of defaultPaths) {
    const trimmed = projectPath.trim();
    if (!fs.existsSync(trimmed)) continue;

    const name = path.basename(trimmed);
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    // Check if already registered
    const existing = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (existing) {
      // Ensure per-project tables exist and migrate if needed
      if (!projectTablesExist(id)) {
        createProjectTables(id);
        migrateProjectData(id);
      }
      continue;
    }

    // Seed coordination directory if missing
    const coordinationPath = seedCoordination(trimmed);

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

    // Create per-project tables for new project
    createProjectTables(id);
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
