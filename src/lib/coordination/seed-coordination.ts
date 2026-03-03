import fs from 'fs';
import path from 'path';

const DEFAULT_FILES: Record<string, string> = {
  'registry.json': JSON.stringify({ agents: [] }, null, 2),
  'health.json': JSON.stringify({}, null, 2),
  'queue.json': JSON.stringify({ pending: [], in_progress: [], completed: [] }, null, 2),
  'locks.json': JSON.stringify([], null, 2),
  'events.log': '',
};

/**
 * Seeds the .claude/coordination/ directory for a project if it doesn't exist.
 * Returns the coordination path.
 */
export function seedCoordination(projectPath: string): string {
  const coordDir = path.join(projectPath, '.claude', 'coordination');

  if (!fs.existsSync(coordDir)) {
    fs.mkdirSync(coordDir, { recursive: true });
  }

  for (const [filename, content] of Object.entries(DEFAULT_FILES)) {
    const filePath = path.join(coordDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }

  return coordDir;
}
