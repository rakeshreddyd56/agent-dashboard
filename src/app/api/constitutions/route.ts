import { NextRequest, NextResponse } from 'next/server';
import { getProjectConstitutions, upsertConstitution, seedProjectConstitutions } from '@/lib/db/constitution-queries';
import { CONSTITUTION_DEFAULTS, getReportingChain, getDirectReports } from '@/lib/constitution-defaults';
import { validateAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const includeHierarchy = req.nextUrl.searchParams.get('hierarchy') === 'true';

  // Seed defaults if none exist
  const existing = getProjectConstitutions(projectId);
  if (existing.length === 0) {
    seedProjectConstitutions(projectId);
  }

  const constitutions = getProjectConstitutions(projectId);

  const parsed = constitutions.map(c => ({
    id: c.id,
    projectId: c.project_id,
    agentRole: c.agent_role,
    title: c.title,
    capabilities: JSON.parse(c.capabilities),
    permissions: JSON.parse(c.permissions),
    reportsTo: c.reports_to,
    responsibilityScope: JSON.parse(c.responsibility_scope),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    ...(includeHierarchy ? {
      reportingChain: getReportingChain(c.agent_role),
      directReports: getDirectReports(c.agent_role),
    } : {}),
  }));

  return NextResponse.json({ constitutions: parsed });
}

export async function PUT(req: NextRequest) {
  const authError = validateAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { projectId, agentRole, title, capabilities, permissions, reportsTo, responsibilityScope } = body;

    if (!projectId || !agentRole) {
      return NextResponse.json({ error: 'projectId and agentRole required' }, { status: 400 });
    }

    const defaults = CONSTITUTION_DEFAULTS[agentRole];
    const now = new Date().toISOString();

    upsertConstitution(projectId, {
      id: `const-${projectId}-${agentRole}`,
      agent_role: agentRole,
      title: title || defaults?.title || agentRole,
      capabilities: JSON.stringify(capabilities || defaults?.capabilities || []),
      permissions: JSON.stringify(permissions || defaults?.permissions || {}),
      reports_to: reportsTo !== undefined ? reportsTo : (defaults?.reportsTo || null),
      responsibility_scope: JSON.stringify(responsibilityScope || defaults?.responsibilityScope || []),
      created_at: now,
      updated_at: now,
    });

    const { eventBus } = await import('@/lib/events/event-bus');
    eventBus.broadcast('constitution.updated', { agentRole, projectId }, projectId);

    return NextResponse.json({ ok: true, agentRole });
  } catch (err) {
    console.error('PUT /api/constitutions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
