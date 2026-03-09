import { NextRequest, NextResponse } from 'next/server';
import { getPendingApprovals, getProjectApprovals, createApproval, getApproval, decideApproval, getPendingCount } from '@/lib/db/approval-queries';
import { validateAuth } from '@/lib/auth';
import { eventBus } from '@/lib/events/event-bus';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 200);

  const approvals = status === 'pending'
    ? getPendingApprovals(projectId)
    : getProjectApprovals(projectId, limit);

  const parsed = approvals.map(a => ({
    id: a.id,
    projectId: a.project_id,
    type: a.type,
    requestedByAgent: a.requested_by_agent,
    requestedByRole: a.requested_by_role,
    status: a.status,
    payload: JSON.parse(a.payload || '{}'),
    decisionBy: a.decision_by,
    decisionNote: a.decision_note,
    decidedAt: a.decided_at,
    expiresAt: a.expires_at,
    createdAt: a.created_at,
  }));

  return NextResponse.json({
    approvals: parsed,
    pendingCount: getPendingCount(projectId),
  });
}

export async function POST(req: NextRequest) {
  const authError = validateAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { projectId, type, requestedByAgent, requestedByRole, payload } = body;

    if (!projectId || !type || !requestedByAgent || !requestedByRole) {
      return NextResponse.json({ error: 'projectId, type, requestedByAgent, requestedByRole required' }, { status: 400 });
    }

    const validTypes = ['deploy', 'launch_agent', 'budget_override', 'strategy_change', 'merge'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid approval type' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    createApproval({
      id,
      project_id: projectId,
      type,
      requested_by_agent: requestedByAgent,
      requested_by_role: requestedByRole,
      status: 'pending',
      payload: JSON.stringify(payload || {}),
      decision_by: null,
      decision_note: null,
      decided_at: null,
      expires_at: null,
      created_at: now,
    });

    eventBus.broadcast('approval.created', { id, type, requestedByAgent, requestedByRole }, projectId);

    // Create notification
    try {
      const { rawDb } = await import('@/lib/db');
      rawDb.prepare(`
        INSERT INTO notifications (id, project_id, recipient, type, title, message, source_type, source_id, created_at)
        VALUES (?, ?, 'user', 'approval', ?, ?, 'approval', ?, ?)
      `).run(
        `notif-appr-${Date.now()}`, projectId,
        `Approval needed: ${type}`,
        `${requestedByRole} (${requestedByAgent}) requests approval for: ${type}`,
        id, now,
      );
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    console.error('POST /api/approvals error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authError = validateAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { id, status, decisionBy, decisionNote } = body;

    if (!id || !status || !decisionBy) {
      return NextResponse.json({ error: 'id, status, and decisionBy required' }, { status: 400 });
    }

    const validStatuses = ['approved', 'rejected', 'revision_requested'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const existing = getApproval(id);
    if (!existing) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Approval already decided' }, { status: 409 });
    }

    decideApproval(id, status, decisionBy, decisionNote);

    eventBus.broadcast('approval.decided', {
      id, status, decisionBy, type: existing.type,
      requestedByAgent: existing.requested_by_agent,
    }, existing.project_id);

    return NextResponse.json({ ok: true, id, status });
  } catch (err) {
    console.error('PUT /api/approvals error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
