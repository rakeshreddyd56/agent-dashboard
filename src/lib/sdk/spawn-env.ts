/**
 * Build a safe environment for spawning child processes (claude, tmux, git, etc.).
 * Ensures common binary directories are on PATH even when the dev server
 * was started with a restricted PATH (e.g. just the Node.js bin dir).
 */
export function getSpawnEnv(): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH || '';
  const extraPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];

  // Deduplicate: only add paths not already present
  const existing = new Set(currentPath.split(':'));
  const additions = extraPaths.filter((p) => !existing.has(p));
  const fullPath = additions.length > 0
    ? `${currentPath}:${additions.join(':')}`
    : currentPath;

  return {
    ...process.env,
    PATH: fullPath,
    CLAUDECODE: undefined, // prevent nested session errors
  };
}
