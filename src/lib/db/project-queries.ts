import { rawDb } from './index';
import { sanitizePrefix } from './dynamic-tables';

// ─── Agent Queries ───────────────────────────────────────────────

export function getProjectAgents(projectId: string) {
  const p = sanitizePrefix(projectId);
  return rawDb.prepare(`SELECT * FROM "${p}_agents"`).all() as AgentRow[];
}

export function upsertProjectAgent(projectId: string, agent: AgentRow) {
  const p = sanitizePrefix(projectId);
  rawDb.prepare(`
    INSERT OR REPLACE INTO "${p}_agents"
    (id, agent_id, role, status, current_task, model, session_start, last_heartbeat, locked_files, progress, estimated_cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agent.id, agent.agent_id, agent.role, agent.status,
    agent.current_task, agent.model, agent.session_start,
    agent.last_heartbeat, agent.locked_files,
    agent.progress, agent.estimated_cost, agent.created_at
  );
}

export function bulkUpsertProjectAgents(projectId: string, agents: AgentRow[]) {
  const p = sanitizePrefix(projectId);
  const stmt = rawDb.prepare(`
    INSERT OR REPLACE INTO "${p}_agents"
    (id, agent_id, role, status, current_task, model, session_start, last_heartbeat, locked_files, progress, estimated_cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = rawDb.transaction((list: AgentRow[]) => {
    for (const a of list) {
      stmt.run(
        a.id, a.agent_id, a.role, a.status,
        a.current_task, a.model, a.session_start,
        a.last_heartbeat, a.locked_files,
        a.progress, a.estimated_cost, a.created_at
      );
    }
  });
  tx(agents);
}

// ─── Task Queries ────────────────────────────────────────────────

export function getProjectTasks(projectId: string) {
  const p = sanitizePrefix(projectId);
  return rawDb.prepare(`SELECT * FROM "${p}_tasks"`).all() as TaskRow[];
}

export function getProjectTasksByStatus(projectId: string, status: string) {
  const p = sanitizePrefix(projectId);
  return rawDb.prepare(`SELECT * FROM "${p}_tasks" WHERE status = ?`).all(status) as TaskRow[];
}

export function getProjectTask(projectId: string, taskId: string) {
  const p = sanitizePrefix(projectId);
  return rawDb.prepare(`SELECT * FROM "${p}_tasks" WHERE id = ?`).get(taskId) as TaskRow | undefined;
}

export function upsertProjectTask(projectId: string, task: TaskRow) {
  const p = sanitizePrefix(projectId);
  rawDb.prepare(`
    INSERT OR REPLACE INTO "${p}_tasks"
    (id, external_id, title, description, status, priority, assigned_agent, tags, effort, dependencies, source, column_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id, task.external_id, task.title, task.description,
    task.status, task.priority, task.assigned_agent, task.tags,
    task.effort, task.dependencies, task.source, task.column_order,
    task.created_at, task.updated_at
  );
}

export function updateProjectTask(projectId: string, taskId: string, updates: Partial<TaskRow>) {
  const p = sanitizePrefix(projectId);
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (setClauses.length === 0) return;
  values.push(taskId);

  rawDb.prepare(`UPDATE "${p}_tasks" SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Find the highest-priority TODO task for a given role (or unassigned).
 * Priority order: P0 > P1 > P2 > P3, then by column_order ASC.
 */
export function getNextPendingTask(projectId: string, role?: string): TaskRow | undefined {
  const p = sanitizePrefix(projectId);
  if (role) {
    return rawDb.prepare(`
      SELECT * FROM "${p}_tasks"
      WHERE status = 'TODO' AND (assigned_agent = ? OR assigned_agent IS NULL OR assigned_agent = '')
      ORDER BY
        CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END ASC,
        column_order ASC
      LIMIT 1
    `).get(role) as TaskRow | undefined;
  }
  return rawDb.prepare(`
    SELECT * FROM "${p}_tasks"
    WHERE status = 'TODO'
    ORDER BY
      CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END ASC,
      column_order ASC
    LIMIT 1
  `).get() as TaskRow | undefined;
}

export function deleteProjectTask(projectId: string, taskId: string) {
  const p = sanitizePrefix(projectId);
  // Delete dependent comments first
  rawDb.prepare(`DELETE FROM "${p}_task_comments" WHERE task_id = ?`).run(taskId);
  rawDb.prepare(`DELETE FROM "${p}_tasks" WHERE id = ?`).run(taskId);
}

export function bulkReplaceProjectTasks(projectId: string, tasks: TaskRow[], source: string) {
  const p = sanitizePrefix(projectId);
  const tx = rawDb.transaction((list: TaskRow[]) => {
    // Get IDs of tasks with this source to delete their comments
    const existing = rawDb.prepare(
      `SELECT id FROM "${p}_tasks" WHERE source = ?`
    ).all(source) as { id: string }[];
    const ids = existing.map((r) => r.id);

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      rawDb.prepare(`DELETE FROM "${p}_task_comments" WHERE task_id IN (${placeholders})`).run(...ids);
      rawDb.prepare(`DELETE FROM "${p}_tasks" WHERE id IN (${placeholders})`).run(...ids);
    }

    const stmt = rawDb.prepare(`
      INSERT OR REPLACE INTO "${p}_tasks"
      (id, external_id, title, description, status, priority, assigned_agent, tags, effort, dependencies, source, column_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of list) {
      stmt.run(
        t.id, t.external_id, t.title, t.description,
        t.status, t.priority, t.assigned_agent, t.tags,
        t.effort, t.dependencies, t.source, t.column_order,
        t.created_at, t.updated_at
      );
    }
  });
  tx(tasks);
}

// ─── Event Queries ───────────────────────────────────────────────

export function getProjectEvents(projectId: string, opts?: { limit?: number; offset?: number }) {
  const p = sanitizePrefix(projectId);
  const limit = opts?.limit || 200;
  const offset = opts?.offset || 0;
  return rawDb.prepare(
    `SELECT * FROM "${p}_events" ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as EventRow[];
}

export function insertProjectEvent(projectId: string, event: EventRow) {
  const p = sanitizePrefix(projectId);
  rawDb.prepare(`
    INSERT OR IGNORE INTO "${p}_events"
    (id, timestamp, level, agent_id, agent_role, message, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.timestamp, event.level,
    event.agent_id, event.agent_role, event.message, event.details
  );
}

export function bulkInsertProjectEvents(projectId: string, events: EventRow[]) {
  const p = sanitizePrefix(projectId);
  const stmt = rawDb.prepare(`
    INSERT OR IGNORE INTO "${p}_events"
    (id, timestamp, level, agent_id, agent_role, message, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = rawDb.transaction((list: EventRow[]) => {
    for (const e of list) {
      stmt.run(e.id, e.timestamp, e.level, e.agent_id, e.agent_role, e.message, e.details);
    }
  });
  tx(events);
}

export function purgeProjectEvents(projectId: string, olderThanDays: number) {
  const p = sanitizePrefix(projectId);
  rawDb.prepare(
    `DELETE FROM "${p}_events" WHERE timestamp < datetime('now', '-' || ? || ' days')`
  ).run(olderThanDays);
}

// ─── Analytics Queries ───────────────────────────────────────────

export function getProjectAnalytics(projectId: string, opts?: { limit?: number; since?: string }) {
  const p = sanitizePrefix(projectId);
  if (opts?.since) {
    return rawDb.prepare(
      `SELECT * FROM "${p}_analytics" WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT ?`
    ).all(opts.since, opts?.limit || 500) as AnalyticsRow[];
  }
  return rawDb.prepare(
    `SELECT * FROM "${p}_analytics" ORDER BY timestamp DESC LIMIT ?`
  ).all(opts?.limit || 500) as AnalyticsRow[];
}

export function insertProjectAnalytics(projectId: string, snap: AnalyticsRow) {
  const p = sanitizePrefix(projectId);
  rawDb.prepare(`
    INSERT INTO "${p}_analytics"
    (id, timestamp, active_agents, tasks_in_progress, tasks_completed, total_tasks, estimated_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    snap.id, snap.timestamp, snap.active_agents,
    snap.tasks_in_progress, snap.tasks_completed,
    snap.total_tasks, snap.estimated_cost
  );
}

// ─── Lock Queries ────────────────────────────────────────────────

export function getProjectLocks(projectId: string) {
  const p = sanitizePrefix(projectId);
  return rawDb.prepare(`SELECT * FROM "${p}_file_locks"`).all() as LockRow[];
}

export function replaceProjectLocks(projectId: string, locks: LockRow[]) {
  const p = sanitizePrefix(projectId);
  const tx = rawDb.transaction((list: LockRow[]) => {
    rawDb.prepare(`DELETE FROM "${p}_file_locks"`).run();
    const stmt = rawDb.prepare(`
      INSERT INTO "${p}_file_locks" (id, file_path, agent_id, agent_role, locked_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const l of list) {
      stmt.run(l.id, l.file_path, l.agent_id, l.agent_role, l.locked_at);
    }
  });
  tx(locks);
}

// ─── Task Comment Queries ────────────────────────────────────────

export function getProjectTaskComments(projectId: string, taskId: string) {
  const p = sanitizePrefix(projectId);
  return rawDb.prepare(
    `SELECT * FROM "${p}_task_comments" WHERE task_id = ? ORDER BY created_at ASC`
  ).all(taskId) as CommentRow[];
}

export function insertProjectTaskComment(projectId: string, comment: CommentRow) {
  const p = sanitizePrefix(projectId);
  rawDb.prepare(`
    INSERT INTO "${p}_task_comments" (id, task_id, agent_id, content, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(comment.id, comment.task_id, comment.agent_id, comment.content, comment.type, comment.created_at);
}

// ─── Row Types ───────────────────────────────────────────────────

export interface AgentRow {
  id: string;
  agent_id: string;
  role: string;
  status: string;
  current_task: string | null;
  model: string | null;
  session_start: string | null;
  last_heartbeat: string | null;
  locked_files: string;
  progress: number | null;
  estimated_cost: number | null;
  created_at: string;
}

export interface TaskRow {
  id: string;
  external_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_agent: string | null;
  tags: string;
  effort: string | null;
  dependencies: string;
  source: string;
  column_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  timestamp: string;
  level: string;
  agent_id: string | null;
  agent_role: string | null;
  message: string;
  details: string | null;
}

export interface AnalyticsRow {
  id: string;
  timestamp: string;
  active_agents: number;
  tasks_in_progress: number;
  tasks_completed: number;
  total_tasks: number;
  estimated_cost: number;
}

export interface LockRow {
  id: string;
  file_path: string;
  agent_id: string;
  agent_role: string;
  locked_at: string;
}

export interface CommentRow {
  id: string;
  task_id: string;
  agent_id: string;
  content: string;
  type: string;
  created_at: string;
}
