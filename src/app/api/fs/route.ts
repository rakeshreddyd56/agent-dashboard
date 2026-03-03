import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Sensitive directories that should never be accessible
const BLOCKED_DIRS = new Set(['.ssh', '.aws', '.gnupg', '.env', '.npmrc', '.netrc', '.config/gh']);

function getRegisteredProjectPaths(): string[] {
  const projects = db.select({ path: schema.projects.path }).from(schema.projects).all();
  return projects.map((p) => path.resolve(p.path));
}

function isPathSafe(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);

  // Block sensitive dotfile directories
  const parts = resolved.split(path.sep);
  for (const blocked of BLOCKED_DIRS) {
    if (parts.some((part, i) => {
      if (blocked.includes('/')) {
        // Multi-part blocked path (e.g., ".config/gh")
        const blockedParts = blocked.split('/');
        return blockedParts.every((bp, j) => parts[i + j] === bp);
      }
      return part === blocked;
    })) {
      return false;
    }
  }

  // Only allow paths within registered project directories
  const projectPaths = getRegisteredProjectPaths();
  return projectPaths.some((pp) => resolved.startsWith(pp + path.sep) || resolved === pp);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetPath = searchParams.get('path');
    const action = searchParams.get('action') || 'list';

    if (!targetPath) {
      return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
    }

    if (!isPathSafe(targetPath)) {
      return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
    }

    const resolved = path.resolve(targetPath);

    switch (action) {
      case 'exists': {
        const exists = fs.existsSync(resolved);
        const isDir = exists ? fs.statSync(resolved).isDirectory() : false;

        // Check for known project markers
        const markers: Record<string, boolean> = {};
        if (isDir) {
          markers['claude.md'] = fs.existsSync(path.join(resolved, 'CLAUDE.md'));
          markers['coordination'] = fs.existsSync(path.join(resolved, '.claude', 'coordination'));
          markers['agents'] = fs.existsSync(path.join(resolved, '.claude', 'agents'));
          markers['scripts'] = fs.existsSync(path.join(resolved, 'scripts'));
          markers['launchScript'] = fs.existsSync(path.join(resolved, 'scripts', 'launch-agents.sh'));
          markers['tasksMd'] = fs.existsSync(path.join(resolved, 'docs', 'TASKS.md'));
          markers['packageJson'] = fs.existsSync(path.join(resolved, 'package.json'));
        }

        return NextResponse.json({ exists, isDir, path: resolved, markers });
      }

      case 'list': {
        if (!fs.existsSync(resolved)) {
          return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
        }

        const stat = fs.statSync(resolved);
        if (!stat.isDirectory()) {
          return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
        }

        try {
          const entries = fs.readdirSync(resolved, { withFileTypes: true })
            .filter((e) => !e.name.startsWith('.') || e.name === '.claude')
            .map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              path: path.join(resolved, entry.name),
            }))
            .sort((a, b) => {
              // Directories first, then alphabetical
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .slice(0, 100); // Limit to 100 entries

          return NextResponse.json({
            path: resolved,
            parent: path.dirname(resolved),
            entries,
          });
        } catch {
          return NextResponse.json({ error: 'Cannot read directory' }, { status: 403 });
        }
      }

      case 'read': {
        // Read a specific file's content (limited to small files)
        if (!fs.existsSync(resolved)) {
          return NextResponse.json({ error: 'File does not exist' }, { status: 404 });
        }

        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          return NextResponse.json({ error: 'Cannot read directory as file' }, { status: 400 });
        }

        // Limit to 100KB
        if (stat.size > 100 * 1024) {
          return NextResponse.json({ error: 'File too large (max 100KB)' }, { status: 400 });
        }

        const content = fs.readFileSync(resolved, 'utf-8');
        return NextResponse.json({ path: resolved, content, size: stat.size });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('GET /api/fs error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
