import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

// Only allow alphanumeric, hyphens, underscores, dots in session names
function sanitizeSessionName(name: string): string | null {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '');
  return sanitized.length > 0 ? sanitized : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'list';

  try {
    switch (action) {
      case 'list': {
        const output = execSync('tmux ls 2>/dev/null || true', {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();

        if (!output) {
          return NextResponse.json({ sessions: [] });
        }

        const sessions = output.split('\n').filter(Boolean).map((line) => {
          // Format: "session-name: N windows (created Day Mon DD HH:MM:SS YYYY)"
          const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s*(?:\(created\s+(.+)\))?/);
          if (match) {
            return {
              name: match[1],
              windows: parseInt(match[2], 10),
              created: match[3] || null,
            };
          }
          return { name: line.split(':')[0], windows: 0, created: null };
        });

        return NextResponse.json({ sessions });
      }

      case 'capture': {
        const session = searchParams.get('session');
        if (!session) {
          return NextResponse.json({ error: 'session parameter required' }, { status: 400 });
        }

        const sanitized = sanitizeSessionName(session);
        if (!sanitized) {
          return NextResponse.json({ error: 'Invalid session name' }, { status: 400 });
        }

        const lines = Math.min(Number(searchParams.get('lines') || '100'), 500);

        const output = execSync(
          `tmux capture-pane -t ${sanitized} -p -S -${lines} 2>/dev/null || echo "[Session not found or not accessible]"`,
          { encoding: 'utf-8', timeout: 5000 }
        );

        return NextResponse.json({
          session: sanitized,
          content: output,
          lines,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      error: 'tmux command failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
