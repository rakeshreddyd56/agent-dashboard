/**
 * Git Analyzer — Clones repos and analyzes project structure for research council.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { GitProjectAnalysis } from '@/lib/types';

const REPOS_DIR = path.resolve('./data/office/repos');

function safeExecFile(cmd: string, args: string[], cwd?: string): string {
  try {
    return execFileSync(cmd, args, { cwd, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return '';
  }
}

// Validate git URLs to prevent command injection
function isValidGitUrl(url: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/)[\w.\-\/:@]+\.git$/.test(url) || /^(https?:\/\/|git@)[\w.\-\/:@]+$/.test(url);
}

export async function cloneAndAnalyze(gitUrl: string, projectId: string): Promise<GitProjectAnalysis> {
  if (!isValidGitUrl(gitUrl)) {
    throw new Error('Invalid git URL format');
  }

  // Sanitize projectId for filesystem safety
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9._-]/g, '');
  const repoDir = path.join(REPOS_DIR, safeProjectId);

  // Clone or pull
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true });
    safeExecFile('git', ['clone', '--depth', '50', gitUrl, repoDir]);
  } else if (fs.existsSync(path.join(repoDir, '.git'))) {
    safeExecFile('git', ['pull', '--ff-only'], repoDir);
  }

  return analyzeProject(repoDir);
}

export async function analyzeLocalProject(projectPath: string): Promise<GitProjectAnalysis> {
  return analyzeProject(projectPath);
}

function analyzeProject(projectPath: string): GitProjectAnalysis {
  const repoName = path.basename(projectPath);

  // Recent commits
  const commitLog = safeExecFile('git', ['log', '--oneline', '-20'], projectPath);
  const recentCommits = commitLog ? commitLog.split('\n').filter(Boolean) : [];

  // Tech stack detection
  const techStack: string[] = [];
  const pkgPath = path.join(projectPath, 'package.json');
  let description = '';
  let currentVersion = '0.0.0';

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      description = pkg.description || '';
      currentVersion = pkg.version || '0.0.0';
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depsKeys = Object.keys(deps);

      if (depsKeys.some(d => d.includes('next'))) techStack.push('Next.js');
      if (depsKeys.some(d => d === 'react')) techStack.push('React');
      if (depsKeys.some(d => d === 'vue')) techStack.push('Vue');
      if (depsKeys.some(d => d === 'svelte' || d === '@sveltejs/kit')) techStack.push('Svelte');
      if (depsKeys.some(d => d.includes('express'))) techStack.push('Express');
      if (depsKeys.some(d => d.includes('fastify'))) techStack.push('Fastify');
      if (depsKeys.some(d => d.includes('prisma'))) techStack.push('Prisma');
      if (depsKeys.some(d => d.includes('drizzle'))) techStack.push('Drizzle');
      if (depsKeys.some(d => d.includes('tailwind'))) techStack.push('Tailwind CSS');
      if (depsKeys.some(d => d.includes('typescript'))) techStack.push('TypeScript');
      if (depsKeys.some(d => d.includes('sqlite') || d.includes('better-sqlite'))) techStack.push('SQLite');
      if (depsKeys.some(d => d.includes('postgres') || d.includes('pg'))) techStack.push('PostgreSQL');
      if (depsKeys.some(d => d.includes('mongodb') || d.includes('mongoose'))) techStack.push('MongoDB');
    } catch { /* ignore parse errors */ }
  }

  // Python project
  const reqPath = path.join(projectPath, 'requirements.txt');
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  if (fs.existsSync(reqPath) || fs.existsSync(pyprojectPath)) {
    techStack.push('Python');
    if (fs.existsSync(reqPath)) {
      const reqs = fs.readFileSync(reqPath, 'utf-8');
      if (reqs.includes('django')) techStack.push('Django');
      if (reqs.includes('flask')) techStack.push('Flask');
      if (reqs.includes('fastapi')) techStack.push('FastAPI');
    }
  }

  // README for description
  if (!description) {
    const readmePath = path.join(projectPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf-8');
      const firstParagraph = readme.split('\n\n').find(p => p.length > 20 && !p.startsWith('#'));
      description = firstParagraph?.slice(0, 500) || '';
    }
  }

  // File structure (top 2 levels)
  const fileStructure = safeExecFile('find', ['.', '-maxdepth', '2', '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'], projectPath).split('\n').slice(0, 50).join('\n')
    || safeExecFile('ls', ['-la'], projectPath);

  return {
    repoName,
    description,
    techStack,
    recentCommits,
    fileStructure,
    currentVersion,
  };
}
