import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface GitSetupResult {
  gitUrl: string | null;
  created: boolean;
  error?: string;
}

/**
 * Sets up a git repository for a project.
 * - If gitUrl provided: sets it as remote origin
 * - If gitUrl not provided: auto-creates a private repo under githubUser
 * - If not a git repo: runs git init first
 */
export function setupGitRepo(
  projectPath: string,
  gitUrl?: string,
  githubUser: string = 'rakeshreddyd56'
): GitSetupResult {
  const isGitRepo = fs.existsSync(path.join(projectPath, '.git'));

  // Initialize git if needed
  if (!isGitRepo) {
    try {
      execFileSync('git', ['init'], { cwd: projectPath, stdio: 'pipe' });
    } catch (err) {
      return { gitUrl: null, created: false, error: `git init failed: ${err}` };
    }
  }

  // Check if remote origin already exists
  let existingRemote: string | null = null;
  try {
    existingRemote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      stdio: 'pipe',
    }).toString().trim();
  } catch {
    // No remote set — that's fine
  }

  if (gitUrl) {
    // User provided a git URL — set it as origin
    if (existingRemote) {
      if (existingRemote === gitUrl) {
        return { gitUrl, created: false };
      }
      // Update existing remote
      try {
        execFileSync('git', ['remote', 'set-url', 'origin', gitUrl], {
          cwd: projectPath,
          stdio: 'pipe',
        });
      } catch (err) {
        return { gitUrl: null, created: false, error: `Failed to set remote: ${err}` };
      }
    } else {
      try {
        execFileSync('git', ['remote', 'add', 'origin', gitUrl], {
          cwd: projectPath,
          stdio: 'pipe',
        });
      } catch (err) {
        return { gitUrl: null, created: false, error: `Failed to add remote: ${err}` };
      }
    }
    return { gitUrl, created: false };
  }

  // If remote already exists, just return it
  if (existingRemote) {
    return { gitUrl: existingRemote, created: false };
  }

  // Auto-create a private repo under githubUser
  const repoName = path.basename(projectPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  try {
    const result = execFileSync('gh', [
      'repo', 'create',
      `${githubUser}/${repoName}`,
      '--private',
      '--source=.',
      '--remote=origin',
    ], {
      cwd: projectPath,
      stdio: 'pipe',
    }).toString().trim();

    // gh repo create outputs the URL
    const createdUrl = result.includes('github.com')
      ? result.split('\n').find((l) => l.includes('github.com'))?.trim() || `https://github.com/${githubUser}/${repoName}`
      : `https://github.com/${githubUser}/${repoName}`;

    return { gitUrl: createdUrl, created: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // If repo already exists on GitHub, just add as remote
    if (errMsg.includes('already exists')) {
      const fallbackUrl = `https://github.com/${githubUser}/${repoName}.git`;
      try {
        execFileSync('git', ['remote', 'add', 'origin', fallbackUrl], {
          cwd: projectPath,
          stdio: 'pipe',
        });
        return { gitUrl: fallbackUrl, created: false };
      } catch {
        return { gitUrl: fallbackUrl, created: false, error: 'Repo exists but failed to add remote' };
      }
    }
    return { gitUrl: null, created: false, error: `gh repo create failed: ${errMsg}` };
  }
}
