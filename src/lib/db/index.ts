import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || './data/dashboard.db';

interface DbInstance {
  drizzle: ReturnType<typeof drizzle>;
  raw: InstanceType<typeof Database>;
}

function getDbInstance(): DbInstance {
  const key = '__agent_dashboard_db_instance__';
  const g = globalThis as unknown as Record<string, DbInstance>;
  if (!g[key]) {
    g[key] = createDb();
  }
  return g[key];
}

function createDb() {
  const dbPath = path.resolve(DB_PATH);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      coordination_path TEXT NOT NULL,
      git_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
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

    CREATE TABLE IF NOT EXISTS agent_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
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
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      agent_id TEXT,
      agent_role TEXT,
      message TEXT NOT NULL,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS file_locks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_path TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      locked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      timestamp TEXT NOT NULL,
      active_agents INTEGER NOT NULL DEFAULT 0,
      tasks_in_progress INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      total_tasks INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_source ON tasks(project_id, source);
    CREATE INDEX IF NOT EXISTS idx_agents_project ON agent_snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_project_timestamp ON events(project_id, timestamp);
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
    CREATE INDEX IF NOT EXISTS idx_comments_project ON task_comments(project_id);
    CREATE INDEX IF NOT EXISTS idx_locks_project ON file_locks(project_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_project ON analytics_snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_project_timestamp ON analytics_snapshots(project_id, timestamp);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'agent',
      target_type TEXT,
      target_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_log(project_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      conversation_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_agent TEXT,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      metadata TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_agents ON messages(from_agent, to_agent);
    CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT,
      participants TEXT NOT NULL DEFAULT '[]',
      last_message_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient, read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);

    CREATE TABLE IF NOT EXISTS quality_reviews (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      reviewer TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_task ON quality_reviews(task_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_project ON quality_reviews(project_id);

    CREATE TABLE IF NOT EXISTS standup_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      date TEXT NOT NULL,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_standup_project ON standup_reports(project_id);
    CREATE INDEX IF NOT EXISTS idx_standup_date ON standup_reports(date);

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      task_title TEXT NOT NULL,
      task_description TEXT,
      assign_to_role TEXT,
      priority TEXT NOT NULL DEFAULT 'P2',
      estimated_effort TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_templates_project ON workflow_templates(project_id);

    CREATE TABLE IF NOT EXISTS workflow_pipelines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      steps TEXT NOT NULL DEFAULT '[]',
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pipelines_project ON workflow_pipelines(project_id);

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      pipeline_id TEXT NOT NULL REFERENCES workflow_pipelines(id),
      status TEXT NOT NULL DEFAULT 'pending',
      current_step INTEGER NOT NULL DEFAULT 0,
      steps_snapshot TEXT NOT NULL DEFAULT '[]',
      triggered_by TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_pipeline ON pipeline_runs(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_runs_project ON pipeline_runs(project_id);

    CREATE TABLE IF NOT EXISTS agent_system_prompts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      agent_role TEXT NOT NULL,
      prompt TEXT NOT NULL,
      mission_goal TEXT,
      generated_by TEXT NOT NULL DEFAULT 'rataa',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prompts_project ON agent_system_prompts(project_id);
    CREATE INDEX IF NOT EXISTS idx_prompts_role ON agent_system_prompts(agent_role);
  `);

  // Purge analytics snapshots older than 30 days
  sqlite.exec(`
    DELETE FROM analytics_snapshots
    WHERE timestamp < datetime('now', '-30 days');
  `);

  // Purge events older than 7 days
  sqlite.exec(`
    DELETE FROM events
    WHERE timestamp < datetime('now', '-7 days');
  `);

  // Add git_url column if not exists (migration for existing DBs)
  const cols = sqlite.pragma('table_info(projects)') as { name: string }[];
  if (!cols.some((c) => c.name === 'git_url')) {
    sqlite.exec('ALTER TABLE projects ADD COLUMN git_url TEXT');
  }

  const drizzleDb = drizzle(sqlite, { schema });

  // Initialize background services (lazy to avoid circular deps during build)
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    setTimeout(() => {
      import('@/lib/scheduler').then(({ initScheduler }) => initScheduler()).catch(() => {});
      import('@/lib/events/audit').then(({ initAuditListener }) => initAuditListener()).catch(() => {});
      import('@/lib/events/notification-generator').then(({ initNotificationGenerator }) => initNotificationGenerator()).catch(() => {});
      import('@/lib/events/pipeline-runner').then(({ initPipelineRunner }) => initPipelineRunner()).catch(() => {});
    }, 1000);
  }

  return { drizzle: drizzleDb, raw: sqlite };
}

const __dbInstance = getDbInstance();
export const db = __dbInstance.drizzle;
export const rawDb = __dbInstance.raw;
export { schema };
