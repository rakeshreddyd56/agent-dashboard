import { rawDb } from '@/lib/db';

export interface CostEventRow {
  id: string;
  project_id: string;
  agent_id: string;
  agent_role: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  run_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  project_id: string;
  agent_role: string;
  budget_monthly_cents: number;
  spent_monthly_cents: number;
  current_month: string;
  soft_alert_sent: number;
  hard_stop_active: number;
  created_at: string;
  updated_at: string;
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "2026-03"
}

export function insertCostEvent(event: CostEventRow): void {
  rawDb.prepare(`
    INSERT INTO cost_events (id, project_id, agent_id, agent_role, provider, model, input_tokens, output_tokens, cost_cents, run_id, occurred_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.project_id, event.agent_id, event.agent_role,
    event.provider, event.model, event.input_tokens, event.output_tokens,
    event.cost_cents, event.run_id, event.occurred_at, event.created_at,
  );
}

export function getAgentBudget(projectId: string, agentRole: string, month?: string): BudgetRow | undefined {
  const m = month || getCurrentMonth();
  return rawDb.prepare(
    'SELECT * FROM agent_budgets WHERE project_id = ? AND agent_role = ? AND current_month = ?'
  ).get(projectId, agentRole, m) as BudgetRow | undefined;
}

export function getProjectBudgets(projectId: string, month?: string): BudgetRow[] {
  const m = month || getCurrentMonth();
  return rawDb.prepare(
    'SELECT * FROM agent_budgets WHERE project_id = ? AND current_month = ? ORDER BY agent_role'
  ).all(projectId, m) as BudgetRow[];
}

export function upsertAgentBudget(projectId: string, agentRole: string, budgetMonthlyCents: number): void {
  const now = new Date().toISOString();
  const month = getCurrentMonth();
  rawDb.prepare(`
    INSERT INTO agent_budgets (id, project_id, agent_role, budget_monthly_cents, spent_monthly_cents, current_month, soft_alert_sent, hard_stop_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, 0, 0, ?, ?)
    ON CONFLICT(project_id, agent_role, current_month) DO UPDATE SET
      budget_monthly_cents = excluded.budget_monthly_cents,
      updated_at = excluded.updated_at
  `).run(
    `budget-${projectId}-${agentRole}-${month}`,
    projectId, agentRole, budgetMonthlyCents, month, now, now,
  );
}

/** Increment spent and check thresholds. Returns budget status. */
export function incrementSpent(
  projectId: string, agentRole: string, costCents: number
): { newTotal: number; percentUsed: number; softAlert: boolean; hardStop: boolean } {
  const month = getCurrentMonth();
  const now = new Date().toISOString();

  // Ensure budget row exists (default $5/month = 500 cents)
  rawDb.prepare(`
    INSERT OR IGNORE INTO agent_budgets (id, project_id, agent_role, budget_monthly_cents, spent_monthly_cents, current_month, soft_alert_sent, hard_stop_active, created_at, updated_at)
    VALUES (?, ?, ?, 500, 0, ?, 0, 0, ?, ?)
  `).run(`budget-${projectId}-${agentRole}-${month}`, projectId, agentRole, month, now, now);

  // Atomic increment
  rawDb.prepare(`
    UPDATE agent_budgets SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ?
    WHERE project_id = ? AND agent_role = ? AND current_month = ?
  `).run(costCents, now, projectId, agentRole, month);

  const budget = getAgentBudget(projectId, agentRole, month)!;
  const percentUsed = budget.budget_monthly_cents > 0
    ? (budget.spent_monthly_cents / budget.budget_monthly_cents) * 100
    : 0;

  let softAlert = false;
  let hardStop = false;

  // 80% soft alert
  if (percentUsed >= 80 && !budget.soft_alert_sent) {
    rawDb.prepare(`
      UPDATE agent_budgets SET soft_alert_sent = 1, updated_at = ?
      WHERE project_id = ? AND agent_role = ? AND current_month = ?
    `).run(now, projectId, agentRole, month);
    softAlert = true;
  }

  // 100% hard stop
  if (percentUsed >= 100 && !budget.hard_stop_active) {
    rawDb.prepare(`
      UPDATE agent_budgets SET hard_stop_active = 1, updated_at = ?
      WHERE project_id = ? AND agent_role = ? AND current_month = ?
    `).run(now, projectId, agentRole, month);
    hardStop = true;
  }

  return { newTotal: budget.spent_monthly_cents, percentUsed, softAlert, hardStop };
}

/** Reset all budgets for a new month */
export function resetMonthlyBudgets(): number {
  const month = getCurrentMonth();
  const now = new Date().toISOString();

  // Get all budgets that aren't for the current month
  const stale = rawDb.prepare(
    'SELECT DISTINCT project_id, agent_role, budget_monthly_cents FROM agent_budgets WHERE current_month != ?'
  ).all(month) as { project_id: string; agent_role: string; budget_monthly_cents: number }[];

  let created = 0;
  for (const row of stale) {
    rawDb.prepare(`
      INSERT OR IGNORE INTO agent_budgets (id, project_id, agent_role, budget_monthly_cents, spent_monthly_cents, current_month, soft_alert_sent, hard_stop_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, 0, 0, ?, ?)
    `).run(
      `budget-${row.project_id}-${row.agent_role}-${month}`,
      row.project_id, row.agent_role, row.budget_monthly_cents, month, now, now,
    );
    created++;
  }
  return created;
}

/** Get cost summary for an agent */
export function getAgentCostSummary(projectId: string, agentRole: string, since?: string): {
  totalCents: number; eventCount: number; avgPerEvent: number;
} {
  const sinceDate = since || new Date(Date.now() - 30 * 86400000).toISOString();
  const result = rawDb.prepare(`
    SELECT COALESCE(SUM(cost_cents), 0) as total, COUNT(*) as cnt
    FROM cost_events WHERE project_id = ? AND agent_role = ? AND occurred_at >= ?
  `).get(projectId, agentRole, sinceDate) as { total: number; cnt: number };
  return {
    totalCents: result.total,
    eventCount: result.cnt,
    avgPerEvent: result.cnt > 0 ? result.total / result.cnt : 0,
  };
}

/** Get project-wide cost summary per agent */
export function getProjectCostSummary(projectId: string, since?: string): Record<string, { totalCents: number; eventCount: number }> {
  const sinceDate = since || new Date(Date.now() - 30 * 86400000).toISOString();
  const rows = rawDb.prepare(`
    SELECT agent_role, COALESCE(SUM(cost_cents), 0) as total, COUNT(*) as cnt
    FROM cost_events WHERE project_id = ? AND occurred_at >= ?
    GROUP BY agent_role
  `).all(projectId, sinceDate) as { agent_role: string; total: number; cnt: number }[];

  const result: Record<string, { totalCents: number; eventCount: number }> = {};
  for (const row of rows) {
    result[row.agent_role] = { totalCents: row.total, eventCount: row.cnt };
  }
  return result;
}
