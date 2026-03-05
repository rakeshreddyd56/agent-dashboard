/**
 * Memory System — ClawdBot-inspired dual-layer memory per floor.
 *
 * Layer 1: Daily logs (append-only markdown files)
 * Layer 2: Long-term memory (curated MEMORY.md per floor)
 * SQLite indexing for search across all floors.
 */

import fs from 'fs';
import path from 'path';
import { db, schema } from '@/lib/db';
import { eq, and, like, desc } from 'drizzle-orm';
import type { FloorNumber, MemoryType, OfficeMemoryEntry } from '@/lib/types';

const OFFICE_DIR = path.resolve('./data/office');

function floorDir(floor: FloorNumber): string {
  return path.join(OFFICE_DIR, `floor-${floor}`);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function nowISO(): string {
  return new Date().toISOString();
}

function genId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Layer 1: Daily Logs ──────────────────────────────────────────

export function appendDailyLog(
  projectId: string,
  floor: FloorNumber,
  entry: { title: string; content: string; source: string; tags?: string[] },
) {
  const date = today();
  const logsDir = path.join(floorDir(floor), 'logs');
  ensureDir(logsDir);

  const filePath = path.join(logsDir, `${date}.md`);
  const timestamp = new Date().toLocaleTimeString();
  const markdown = `\n## [${timestamp}] ${entry.title}\n\n${entry.content}\n\n---\n`;

  fs.appendFileSync(filePath, markdown, 'utf-8');

  // Index in SQLite
  const now = nowISO();
  db.insert(schema.officeMemory).values({
    id: genId(),
    projectId,
    floor,
    type: 'daily_log' as MemoryType,
    date,
    title: entry.title,
    content: entry.content,
    tags: JSON.stringify(entry.tags || []),
    source: entry.source,
    importance: 3,
    filePath,
    createdAt: now,
    updatedAt: now,
  }).run();
}

// ─── Layer 2: Long-Term Memory ────────────────────────────────────

export function addToLongTermMemory(
  projectId: string,
  floor: FloorNumber,
  entry: { title: string; content: string; tags?: string[]; importance?: number },
) {
  const dir = floorDir(floor);
  ensureDir(dir);

  const filePath = path.join(dir, 'MEMORY.md');
  const date = today();
  const markdown = `\n### ${entry.title}\n*${date}*\n\n${entry.content}\n\n---\n`;

  fs.appendFileSync(filePath, markdown, 'utf-8');

  const now = nowISO();
  db.insert(schema.officeMemory).values({
    id: genId(),
    projectId,
    floor,
    type: 'long_term' as MemoryType,
    date,
    title: entry.title,
    content: entry.content,
    tags: JSON.stringify(entry.tags || []),
    source: 'memory',
    importance: entry.importance || 7,
    filePath,
    createdAt: now,
    updatedAt: now,
  }).run();
}

// ─── Pre-compaction Flush ─────────────────────────────────────────

export function flushKeyInsights(
  projectId: string,
  floor: FloorNumber,
  insights: { title: string; content: string; importance?: number }[],
) {
  for (const insight of insights) {
    addToLongTermMemory(projectId, floor, {
      ...insight,
      tags: ['pre-compaction-flush'],
      importance: insight.importance || 8,
    });
  }
}

// ─── Read Operations ──────────────────────────────────────────────

export function getDailyLog(floor: FloorNumber, date?: string): string | null {
  const filePath = path.join(floorDir(floor), 'logs', `${date || today()}.md`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

export function getLongTermMemory(floor: FloorNumber): string | null {
  const filePath = path.join(floorDir(floor), 'MEMORY.md');
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

export function getSoulFile(role: string): string | null {
  const filePath = path.join(OFFICE_DIR, 'souls', `${role}.md`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

export function getUserPrefs(floor: FloorNumber): string | null {
  const filePath = path.join(floorDir(floor), 'USER.md');
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

// ─── Search ───────────────────────────────────────────────────────

export function searchMemory(
  projectId: string,
  opts?: { query?: string; floor?: FloorNumber; type?: MemoryType; limit?: number },
): OfficeMemoryEntry[] {
  const limit = opts?.limit || 50;
  let query = db.select().from(schema.officeMemory)
    .where(eq(schema.officeMemory.projectId, projectId))
    .orderBy(desc(schema.officeMemory.importance), desc(schema.officeMemory.createdAt))
    .limit(limit);

  // Additional filters applied via raw conditions
  const rows = query.all();

  let results = rows as unknown as OfficeMemoryEntry[];

  if (opts?.floor) {
    results = results.filter(r => r.floor === opts.floor);
  }
  if (opts?.type) {
    results = results.filter(r => r.type === opts.type);
  }
  if (opts?.query) {
    const q = opts.query.toLowerCase();
    results = results.filter(r =>
      r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
    );
  }

  return results.map(r => ({
    ...r,
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
    floor: r.floor as FloorNumber,
  }));
}

export function getRecentInsights(projectId: string, days: number = 7): OfficeMemoryEntry[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = db.select().from(schema.officeMemory)
    .where(eq(schema.officeMemory.projectId, projectId))
    .orderBy(desc(schema.officeMemory.createdAt))
    .limit(100)
    .all();

  return (rows as unknown as OfficeMemoryEntry[])
    .filter(r => r.date >= cutoff && r.type !== 'daily_log')
    .map(r => ({
      ...r,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
      floor: r.floor as FloorNumber,
    }));
}

// ─── Pruning ──────────────────────────────────────────────────────

export function pruneOldLogs(floor: FloorNumber, daysToKeep: number = 30) {
  const logsDir = path.join(floorDir(floor), 'logs');
  if (!fs.existsSync(logsDir)) return;

  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const dateStr = file.replace('.md', '');
    const fileDate = new Date(dateStr);
    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(logsDir, file));
    }
  }
}
