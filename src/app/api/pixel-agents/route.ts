import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const HOME = os.homedir();

function checkExtensionDirs(): { installed: boolean; location: string | null; version: string | null } {
  const searchDirs = [
    path.join(HOME, '.vscode', 'extensions'),
    path.join(HOME, '.cursor', 'extensions'),
    path.join(HOME, '.vscode-insiders', 'extensions'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      const pixelAgent = entries.find((e) => e.startsWith('pablodelucca.pixel-agents'));
      if (pixelAgent) {
        const version = pixelAgent.split('-').pop() || null;
        return { installed: true, location: path.join(dir, pixelAgent), version };
      }
    } catch {
      continue;
    }
  }

  return { installed: false, location: null, version: null };
}

function checkVSCodeCLI(): { available: boolean; path: string | null; editor: string } {
  // Check for real VS Code first (the `code` shell command may be Cursor)
  const candidates = [
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders',
    '/usr/local/bin/code',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const version = execFileSync(candidate, ['--version'], {
          encoding: 'utf-8',
          timeout: 3000,
        }).trim().split('\n')[0];
        // Cursor versions are 2.x, VS Code is 1.x
        const isCursor = version.startsWith('2.');
        if (!isCursor) {
          return { available: true, path: candidate, editor: 'VS Code' };
        }
      } catch { /* continue */ }
    }
  }

  // Fall back to whatever `code` or `cursor` resolves to
  try {
    let codePath = '';
    try {
      codePath = execFileSync('which', ['code'], { encoding: 'utf-8', timeout: 3000 }).trim();
    } catch {
      try {
        codePath = execFileSync('which', ['cursor'], { encoding: 'utf-8', timeout: 3000 }).trim();
      } catch { /* neither found */ }
    }
    return { available: !!codePath, path: codePath || null, editor: 'Unknown' };
  } catch {
    return { available: false, path: null, editor: 'None' };
  }
}

function getActiveSessions(): { projectSlug: string; sessionId: string; lastModified: string }[] {
  const claudeDir = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(claudeDir)) return [];

  const sessions: { projectSlug: string; sessionId: string; lastModified: string }[] = [];
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  try {
    for (const slug of fs.readdirSync(claudeDir)) {
      const slugDir = path.join(claudeDir, slug);
      if (!fs.statSync(slugDir).isDirectory()) continue;

      for (const file of fs.readdirSync(slugDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = path.join(slugDir, file);
        const stat = fs.statSync(filePath);

        // Only show sessions active in the last hour
        if (now - stat.mtimeMs < ONE_HOUR) {
          sessions.push({
            projectSlug: slug,
            sessionId: file.replace('.jsonl', ''),
            lastModified: stat.mtime.toISOString(),
          });
        }
      }
    }
  } catch {
    // ignore
  }

  return sessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'status';

  switch (action) {
    case 'status': {
      const extension = checkExtensionDirs();
      const cli = checkVSCodeCLI();
      const sessions = getActiveSessions();

      return NextResponse.json({
        extension,
        cli,
        activeSessions: sessions,
        claudeDir: path.join(HOME, '.claude', 'projects'),
      });
    }

    case 'install': {
      const cli = checkVSCodeCLI();
      if (!cli.available || !cli.path) {
        return NextResponse.json({
          success: false,
          error: 'VS Code CLI not found. Install manually from the marketplace.',
        }, { status: 400 });
      }

      try {
        execFileSync(cli.path, ['--install-extension', 'pablodelucca.pixel-agents'], {
          encoding: 'utf-8',
          timeout: 60000,
        });
        return NextResponse.json({ success: true, message: `Pixel Agents installed via ${cli.editor}` });
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : 'Install failed',
        }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

export async function POST() {
  const cli = checkVSCodeCLI();
  if (!cli.available || !cli.path) {
    return NextResponse.json({
      success: false,
      error: 'VS Code CLI not found. Open VS Code and run "Shell Command: Install code command in PATH".',
    }, { status: 400 });
  }

  try {
    const output = execFileSync(cli.path, ['--install-extension', 'pablodelucca.pixel-agents'], {
      encoding: 'utf-8',
      timeout: 60000,
    }).toString();
    return NextResponse.json({ success: true, output: output.trim(), editor: cli.editor });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Install failed',
    }, { status: 500 });
  }
}
