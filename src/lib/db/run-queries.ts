import { rawDb } from '@/lib/db';

export interface AgentRunRow {
  id: string;
  project_id: string;
  agent_id: string;
  agent_role: string;
  status: string;
  invocation_source: string;
  task_id: string | null;
  model: string | null;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  tool_calls: number;
  stdout_excerpt: string | null;
  created_at: string;
}

export function createRun(run: AgentRunRow): string {
  rawDb.prepare(`
    INSERT INTO agent_runs (id, project_id, agent_id, agent_role, status, invocation_source, task_id, model, started_at, finished_at, exit_code, input_tokens, output_tokens, cost_cents, tool_calls, stdout_excerpt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.project_id, run.agent_id, run.agent_role,
    run.status, run.invocation_source, run.task_id, run.model,
    run.started_at, run.finished_at, run.exit_code,
    run.input_tokens, run.output_tokens, run.cost_cents,
    run.tool_calls, run.stdout_excerpt, run.created_at,
  );
  return run.id;
}

export function updateRun(runId: string, updates: Partial<AgentRunRow>): void {
  const allowed = ['status', 'finished_at', 'exit_code', 'stdout_excerpt', 'model', 'task_id'];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  values.push(runId);
  rawDb.prepare(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function finalizeRun(runId: string, exitCode: number, stdoutExcerpt?: string): void {
  const now = new Date().toISOString();
  const status = exitCode === 0 ? 'completed' : 'failed';
  rawDb.prepare(`
    UPDATE agent_runs SET status = ?, finished_at = ?, exit_code = ?, stdout_excerpt = ?
    WHERE id = ?
  `).run(status, now, exitCode, stdoutExcerpt || null, runId);
}

export function incrementRunCounters(runId: string, inputTokens: number, outputTokens: number, costCents: number): void {
  rawDb.prepare(`
    UPDATE agent_runs SET
      input_tokens = input_tokens + ?,
      output_tokens = output_tokens + ?,
      cost_cents = cost_cents + ?,
      tool_calls = tool_calls + 1
    WHERE id = ?
  `).run(inputTokens, outputTokens, costCents, runId);
}

export function getActiveRunForAgent(projectId: string, agentId: string): AgentRunRow | undefined {
  return rawDb.prepare(`
    SELECT * FROM agent_runs WHERE project_id = ? AND agent_id = ? AND status = 'running'
    ORDER BY started_at DESC LIMIT 1
  `).get(projectId, agentId) as AgentRunRow | undefined;
}

export function getAgentRuns(projectId: string, agentId?: string, limit = 50): AgentRunRow[] {
  if (agentId) {
    return rawDb.prepare(`
      SELECT * FROM agent_runs WHERE project_id = ? AND agent_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(projectId, agentId, limit) as AgentRunRow[];
  }
  return rawDb.prepare(`
    SELECT * FROM agent_runs WHERE project_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(projectId, limit) as AgentRunRow[];
}

export function getRunAnalytics(projectId: string, agentId?: string): {
  avgDurationMs: number; successRate: number; avgCostCents: number; totalRuns: number;
} {
  const where = agentId
    ? 'project_id = ? AND agent_id = ? AND status IN ("completed", "failed")'
    : 'project_id = ? AND status IN ("completed", "failed")';
  const params = agentId ? [projectId, agentId] : [projectId];

  const rows = rawDb.prepare(`
    SELECT status, started_at, finished_at, cost_cents FROM agent_runs WHERE ${where}
    ORDER BY created_at DESC LIMIT 100
  `).all(...params) as { status: string; started_at: string | null; finished_at: string | null; cost_cents: number }[];

  if (rows.length === 0) {
    return { avgDurationMs: 0, successRate: 0, avgCostCents: 0, totalRuns: 0 };
  }

  let totalDuration = 0;
  let durationCount = 0;
  let successCount = 0;
  let totalCost = 0;

  for (const row of rows) {
    if (row.status === 'completed') successCount++;
    totalCost += row.cost_cents;
    if (row.started_at && row.finished_at) {
      totalDuration += new Date(row.finished_at).getTime() - new Date(row.started_at).getTime();
      durationCount++;
    }
  }

  return {
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    successRate: rows.length > 0 ? (successCount / rows.length) * 100 : 0,
    avgCostCents: rows.length > 0 ? totalCost / rows.length : 0,
    totalRuns: rows.length,
  };
}

/** Finalize any orphaned runs (running but agent is offline) */
export function finalizeOrphanedRuns(projectId: string, activeAgentIds: string[]): number {
  if (activeAgentIds.length === 0) {
    const result = rawDb.prepare(`
      UPDATE agent_runs SET status = 'failed', finished_at = ?, exit_code = -1
      WHERE project_id = ? AND status = 'running'
    `).run(new Date().toISOString(), projectId);
    return result.changes;
  }

  const placeholders = activeAgentIds.map(() => '?').join(',');
  const result = rawDb.prepare(`
    UPDATE agent_runs SET status = 'failed', finished_at = ?, exit_code = -1
    WHERE project_id = ? AND status = 'running' AND agent_id NOT IN (${placeholders})
  `).run(new Date().toISOString(), projectId, ...activeAgentIds);
  return result.changes;
}
