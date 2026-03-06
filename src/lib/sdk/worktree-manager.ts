import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const WORKTREE_DIR = '.claude/worktrees';
const EXEC_TIMEOUT = 15_000; // 15s

/**
 * Create a git worktree for an agent role.
 * Worktree is placed at `.claude/worktrees/{role}` with branch `agent/{role}-{timestamp}`.
 */
export function createWorktree(
  projectPath: string,
  role: string,
): { worktreePath: string; branch: string } {
  const timestamp = Date.now();
  const branch = `agent/${role}-${timestamp}`;
  const worktreeDir = path.join(projectPath, WORKTREE_DIR);
  const worktreePath = path.join(worktreeDir, role);

  // Ensure parent directory exists
  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(worktreeDir, { recursive: true });
  }

  // Remove existing worktree at this path if present
  if (fs.existsSync(worktreePath)) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: EXEC_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Force cleanup if git worktree remove fails
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        execFileSync('git', ['worktree', 'prune'], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: EXEC_TIMEOUT,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch { /* best effort */ }
    }
  }

  // Delete the branch if it exists from a previous run
  try {
    execFileSync('git', ['branch', '-D', branch], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: EXEC_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch { /* branch doesn't exist — fine */ }

  // Create worktree with new branch based on HEAD
  execFileSync('git', ['worktree', 'add', '-b', branch, worktreePath], {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: EXEC_TIMEOUT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return { worktreePath, branch };
}

/**
 * Remove a git worktree and its branch.
 */
export function removeWorktree(projectPath: string, worktreePath: string): void {
  try {
    // Get the branch name from the worktree before removing
    let branch: string | null = null;
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: EXEC_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { /* worktree may not exist anymore */ }

    // Remove the worktree
    execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: EXEC_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Delete the branch
    if (branch && branch.startsWith('agent/')) {
      try {
        execFileSync('git', ['branch', '-D', branch], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: EXEC_TIMEOUT,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch { /* branch may already be gone */ }
    }
  } catch {
    // Force cleanup
    try {
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
      execFileSync('git', ['worktree', 'prune'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: EXEC_TIMEOUT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { /* best effort */ }
  }
}

/**
 * List active worktrees in a project.
 */
export function listWorktrees(projectPath: string): { path: string; branch: string; head: string }[] {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: EXEC_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const worktrees: { path: string; branch: string; head: string }[] = [];
    let current: { path: string; branch: string; head: string } = { path: '', branch: '', head: '' };

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current);
        current = { path: line.slice(9), branch: '', head: '' };
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '');
      }
    }
    if (current.path) worktrees.push(current);

    // Filter to only agent worktrees
    return worktrees.filter((wt) => wt.branch.startsWith('agent/'));
  } catch {
    return [];
  }
}
