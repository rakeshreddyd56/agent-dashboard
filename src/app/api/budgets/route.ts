import { NextRequest, NextResponse } from 'next/server';
import { getProjectBudgets, upsertAgentBudget, getProjectCostSummary } from '@/lib/db/budget-queries';
import { validateAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const month = req.nextUrl.searchParams.get('month') || undefined;
  const budgets = getProjectBudgets(projectId, month);
  const costSummary = getProjectCostSummary(projectId);

  const parsed = budgets.map(b => ({
    id: b.id,
    projectId: b.project_id,
    agentRole: b.agent_role,
    budgetMonthlyCents: b.budget_monthly_cents,
    spentMonthlyCents: b.spent_monthly_cents,
    currentMonth: b.current_month,
    softAlertSent: !!b.soft_alert_sent,
    hardStopActive: !!b.hard_stop_active,
    percentUsed: b.budget_monthly_cents > 0 ? (b.spent_monthly_cents / b.budget_monthly_cents) * 100 : 0,
    costSummary: costSummary[b.agent_role] || { totalCents: 0, eventCount: 0 },
  }));

  return NextResponse.json({ budgets: parsed });
}

export async function PUT(req: NextRequest) {
  const authError = validateAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { projectId, agentRole, budgetMonthlyCents } = body;

    if (!projectId || !agentRole || budgetMonthlyCents === undefined) {
      return NextResponse.json({ error: 'projectId, agentRole, and budgetMonthlyCents required' }, { status: 400 });
    }

    if (typeof budgetMonthlyCents !== 'number' || budgetMonthlyCents < 0) {
      return NextResponse.json({ error: 'budgetMonthlyCents must be a non-negative number' }, { status: 400 });
    }

    upsertAgentBudget(projectId, agentRole, budgetMonthlyCents);

    const { eventBus } = await import('@/lib/events/event-bus');
    eventBus.broadcast('budget.updated', { agentRole, budgetMonthlyCents }, projectId);

    return NextResponse.json({ ok: true, agentRole, budgetMonthlyCents });
  } catch (err) {
    console.error('PUT /api/budgets error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
