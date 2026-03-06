import { rawDb } from './index';

/**
 * Converts a project ID into a safe SQL table prefix.
 * Only a-z, 0-9, underscore. Max 30 chars.
 */
export function sanitizePrefix(projectId: string): string {
  return projectId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
}

/**
 * Creates per-project tables if they don't exist.
 */
export function createProjectTables(projectId: string): void {
  const p = sanitizePrefix(projectId);
  const db = rawDb;

  db.exec(`
    CREATE TABLE IF NOT EXISTS "${p}_agents" (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offline',
      current_task TEXT,
      model TEXT,
      session_start TEXT,
      last_heartbeat TEXT,
      locked_files TEXT NOT NULL DEFAULT '[]',
      progress INTEGER,
      estimated_cost REAL,
      created_at TEXT NOT NULL,
      launch_mode TEXT DEFAULT 'tmux',
      sdk_session_id TEXT,
      hook_enabled INTEGER DEFAULT 0,
      worktree_path TEXT,
      worktree_branch TEXT
    );
    CREATE INDEX IF NOT EXISTS "idx_${p}_agents_status" ON "${p}_agents"(status);

    CREATE TABLE IF NOT EXISTS "${p}_tasks" (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'BACKLOG',
      priority TEXT NOT NULL DEFAULT 'P2',
      assigned_agent TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      effort TEXT,
      dependencies TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'dashboard',
      column_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_${p}_tasks_status" ON "${p}_tasks"(status);
    CREATE INDEX IF NOT EXISTS "idx_${p}_tasks_source" ON "${p}_tasks"(source);

    CREATE TABLE IF NOT EXISTS "${p}_events" (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      agent_id TEXT,
      agent_role TEXT,
      message TEXT NOT NULL,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS "idx_${p}_events_ts" ON "${p}_events"(timestamp);

    CREATE TABLE IF NOT EXISTS "${p}_file_locks" (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      locked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${p}_task_comments" (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_${p}_comments_task" ON "${p}_task_comments"(task_id);

    CREATE TABLE IF NOT EXISTS "${p}_analytics" (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      active_agents INTEGER NOT NULL DEFAULT 0,
      tasks_in_progress INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      total_tasks INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS "idx_${p}_analytics_ts" ON "${p}_analytics"(timestamp);
  `);

  // Migrate existing tables to add new columns (idempotent)
  migrateProjectAgentColumns(projectId);
}

/**
 * Migrate existing project agent tables to add new columns (idempotent).
 * Called from createProjectTables — safe to run multiple times.
 */
export function migrateProjectAgentColumns(projectId: string): void {
  const p = sanitizePrefix(projectId);
  const db = rawDb;

  const cols = db.pragma(`table_info("${p}_agents")`) as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));

  const migrations: [string, string][] = [
    ['launch_mode', `ALTER TABLE "${p}_agents" ADD COLUMN launch_mode TEXT DEFAULT 'tmux'`],
    ['sdk_session_id', `ALTER TABLE "${p}_agents" ADD COLUMN sdk_session_id TEXT`],
    ['hook_enabled', `ALTER TABLE "${p}_agents" ADD COLUMN hook_enabled INTEGER DEFAULT 0`],
    ['worktree_path', `ALTER TABLE "${p}_agents" ADD COLUMN worktree_path TEXT`],
    ['worktree_branch', `ALTER TABLE "${p}_agents" ADD COLUMN worktree_branch TEXT`],
  ];

  for (const [col, sql] of migrations) {
    if (!colNames.has(col)) {
      db.exec(sql);
    }
  }
}

/**
 * Drops all per-project tables.
 */
export function dropProjectTables(projectId: string): void {
  const p = sanitizePrefix(projectId);
  const db = rawDb;

  const tables = [
    `${p}_task_comments`,
    `${p}_file_locks`,
    `${p}_events`,
    `${p}_analytics`,
    `${p}_tasks`,
    `${p}_agents`,
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS "${table}"`);
  }
}

/**
 * Check if per-project tables exist.
 */
export function projectTablesExist(projectId: string): boolean {
  const p = sanitizePrefix(projectId);
  const db = rawDb;
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(`${p}_agents`) as { name: string } | undefined;
  return !!row;
}

/**
 * Migrate existing data from shared tables to per-project tables.
 * One-time operation — copies rows then deletes from shared tables.
 */
export function migrateProjectData(projectId: string): void {
  const p = sanitizePrefix(projectId);
  const db = rawDb;

  // Ensure per-project tables exist
  createProjectTables(projectId);

  db.transaction(() => {
    // Migrate agent_snapshots
    db.exec(`
      INSERT OR IGNORE INTO "${p}_agents" (id, agent_id, role, status, current_task, model, session_start, last_heartbeat, locked_files, progress, estimated_cost, created_at)
      SELECT id, agent_id, role, status, current_task, model, session_start, last_heartbeat, locked_files, progress, estimated_cost, created_at
      FROM agent_snapshots WHERE project_id = '${projectId}'
    `);
    db.prepare('DELETE FROM agent_snapshots WHERE project_id = ?').run(projectId);

    // Migrate tasks (handle FK deps: comments and reviews first)
    db.exec(`
      INSERT OR IGNORE INTO "${p}_task_comments" (id, task_id, agent_id, content, type, created_at)
      SELECT id, task_id, agent_id, content, type, created_at
      FROM task_comments WHERE project_id = '${projectId}'
    `);
    db.prepare('DELETE FROM task_comments WHERE project_id = ?').run(projectId);

    // Quality reviews reference tasks — delete from shared
    db.prepare(`DELETE FROM quality_reviews WHERE project_id = ?`).run(projectId);

    db.exec(`
      INSERT OR IGNORE INTO "${p}_tasks" (id, external_id, title, description, status, priority, assigned_agent, tags, effort, dependencies, source, column_order, created_at, updated_at)
      SELECT id, external_id, title, description, status, priority, assigned_agent, tags, effort, dependencies, source, column_order, created_at, updated_at
      FROM tasks WHERE project_id = '${projectId}'
    `);
    db.prepare('DELETE FROM tasks WHERE project_id = ?').run(projectId);

    // Migrate events
    db.exec(`
      INSERT OR IGNORE INTO "${p}_events" (id, timestamp, level, agent_id, agent_role, message, details)
      SELECT id, timestamp, level, agent_id, agent_role, message, details
      FROM events WHERE project_id = '${projectId}'
    `);
    db.prepare('DELETE FROM events WHERE project_id = ?').run(projectId);

    // Migrate file_locks
    db.exec(`
      INSERT OR IGNORE INTO "${p}_file_locks" (id, file_path, agent_id, agent_role, locked_at)
      SELECT id, file_path, agent_id, agent_role, locked_at
      FROM file_locks WHERE project_id = '${projectId}'
    `);
    db.prepare('DELETE FROM file_locks WHERE project_id = ?').run(projectId);

    // Migrate analytics_snapshots
    db.exec(`
      INSERT OR IGNORE INTO "${p}_analytics" (id, timestamp, active_agents, tasks_in_progress, tasks_completed, total_tasks, estimated_cost)
      SELECT id, timestamp, active_agents, tasks_in_progress, tasks_completed, total_tasks, estimated_cost
      FROM analytics_snapshots WHERE project_id = '${projectId}'
    `);
    db.prepare('DELETE FROM analytics_snapshots WHERE project_id = ?').run(projectId);
  })();
}
