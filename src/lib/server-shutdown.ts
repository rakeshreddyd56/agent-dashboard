/**
 * Server shutdown handler — Node.js only.
 * Dynamically imported by instrumentation.ts to avoid Edge Runtime analysis.
 */
import { execFileSync } from 'child_process';
import { fileWatcher } from '@/lib/coordination/file-watcher';

export function setupShutdownHandlers() {
  const handleShutdown = (signal: string) => {
    console.log(`\n[shutdown] Received ${signal}, cleaning up...`);
    try {
      fileWatcher.stopAll?.();
    } catch {}

    // Kill all dashboard-spawned tmux sessions
    try {
      const output = execFileSync('tmux', ['ls'], {
        encoding: 'utf-8', timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (output) {
        const sessions = output.split('\n').map((l: string) => l.split(':')[0]);
        for (const session of sessions) {
          try {
            execFileSync('tmux', ['kill-session', '-t', session], {
              encoding: 'utf-8', timeout: 3000,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            console.log(`[shutdown] Killed tmux session: ${session}`);
          } catch { /* session may already be gone */ }
        }
      }
    } catch { /* tmux not available or no sessions */ }

    setTimeout(() => {
      console.log('[shutdown] Goodbye.');
      process.exit(0);
    }, 500);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
