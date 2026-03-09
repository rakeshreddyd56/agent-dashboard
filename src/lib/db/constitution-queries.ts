import { rawDb } from '@/lib/db';
import { CONSTITUTION_DEFAULTS } from '@/lib/constitution-defaults';
import type { AgentPermissions } from '@/lib/types';

export interface ConstitutionRow {
  id: string;
  project_id: string;
  agent_role: string;
  title: string;
  capabilities: string;
  permissions: string;
  reports_to: string | null;
  responsibility_scope: string;
  created_at: string;
  updated_at: string;
}

export function getProjectConstitutions(projectId: string): ConstitutionRow[] {
  return rawDb.prepare(
    'SELECT * FROM agent_constitutions WHERE project_id = ? ORDER BY agent_role'
  ).all(projectId) as ConstitutionRow[];
}

export function getConstitution(projectId: string, agentRole: string): ConstitutionRow | undefined {
  return rawDb.prepare(
    'SELECT * FROM agent_constitutions WHERE project_id = ? AND agent_role = ?'
  ).get(projectId, agentRole) as ConstitutionRow | undefined;
}

export function upsertConstitution(projectId: string, row: Omit<ConstitutionRow, 'project_id'>): void {
  const now = new Date().toISOString();
  rawDb.prepare(`
    INSERT INTO agent_constitutions (id, project_id, agent_role, title, capabilities, permissions, reports_to, responsibility_scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, agent_role) DO UPDATE SET
      title = excluded.title,
      capabilities = excluded.capabilities,
      permissions = excluded.permissions,
      reports_to = excluded.reports_to,
      responsibility_scope = excluded.responsibility_scope,
      updated_at = excluded.updated_at
  `).run(
    row.id, projectId, row.agent_role, row.title,
    row.capabilities, row.permissions, row.reports_to,
    row.responsibility_scope, row.created_at || now, now,
  );
}

/** Get parsed permissions for an agent, falling back to defaults */
export function getAgentPermissions(projectId: string, agentRole: string): AgentPermissions {
  const row = getConstitution(projectId, agentRole);
  if (row) {
    try { return JSON.parse(row.permissions); } catch { /* fall through */ }
  }
  const def = CONSTITUTION_DEFAULTS[agentRole];
  if (def) return def.permissions;
  return {
    can_deploy: false,
    can_merge: false,
    can_launch_subagents: false,
    can_approve: false,
    can_override_budget: false,
  };
}

/** Seed default constitutions for a project */
export function seedProjectConstitutions(projectId: string): void {
  const existing = getProjectConstitutions(projectId);
  const existingRoles = new Set(existing.map(c => c.agent_role));

  for (const [role, def] of Object.entries(CONSTITUTION_DEFAULTS)) {
    if (existingRoles.has(role)) continue;
    const now = new Date().toISOString();
    upsertConstitution(projectId, {
      id: `const-${projectId}-${role}`,
      agent_role: role,
      title: def.title,
      capabilities: JSON.stringify(def.capabilities),
      permissions: JSON.stringify(def.permissions),
      reports_to: def.reportsTo,
      responsibility_scope: JSON.stringify(def.responsibilityScope),
      created_at: now,
      updated_at: now,
    });
  }
}
