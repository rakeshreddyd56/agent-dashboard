import { rawDb } from '@/lib/db';

export interface ApprovalRow {
  id: string;
  project_id: string;
  type: string;
  requested_by_agent: string;
  requested_by_role: string;
  status: string;
  payload: string;
  decision_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export function createApproval(row: ApprovalRow): string {
  rawDb.prepare(`
    INSERT INTO approvals (id, project_id, type, requested_by_agent, requested_by_role, status, payload, decision_by, decision_note, decided_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.project_id, row.type, row.requested_by_agent,
    row.requested_by_role, row.status, row.payload,
    row.decision_by, row.decision_note, row.decided_at,
    row.expires_at, row.created_at,
  );
  return row.id;
}

export function getApproval(id: string): ApprovalRow | undefined {
  return rawDb.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined;
}

export function getPendingApprovals(projectId: string): ApprovalRow[] {
  return rawDb.prepare(
    "SELECT * FROM approvals WHERE project_id = ? AND status = 'pending' ORDER BY created_at DESC"
  ).all(projectId) as ApprovalRow[];
}

export function getProjectApprovals(projectId: string, limit = 50): ApprovalRow[] {
  return rawDb.prepare(
    'SELECT * FROM approvals WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(projectId, limit) as ApprovalRow[];
}

export function decideApproval(id: string, status: string, decisionBy: string, note?: string): void {
  const now = new Date().toISOString();
  rawDb.prepare(`
    UPDATE approvals SET status = ?, decision_by = ?, decision_note = ?, decided_at = ?
    WHERE id = ?
  `).run(status, decisionBy, note || null, now, id);
}

export function getPendingCount(projectId: string): number {
  const result = rawDb.prepare(
    "SELECT COUNT(*) as cnt FROM approvals WHERE project_id = ? AND status = 'pending'"
  ).get(projectId) as { cnt: number };
  return result.cnt;
}

export function getApprovalForAgent(projectId: string, agentId: string, type: string): ApprovalRow | undefined {
  return rawDb.prepare(
    "SELECT * FROM approvals WHERE project_id = ? AND requested_by_agent = ? AND type = ? AND status = 'pending' LIMIT 1"
  ).get(projectId, agentId, type) as ApprovalRow | undefined;
}

/** Expire stale approvals older than 24 hours */
export function expireStaleApprovals(): number {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const result = rawDb.prepare(`
    UPDATE approvals SET status = 'rejected', decision_by = 'system', decision_note = 'Auto-expired', decided_at = ?
    WHERE status = 'pending' AND created_at < ?
  `).run(new Date().toISOString(), cutoff);
  return result.changes;
}
