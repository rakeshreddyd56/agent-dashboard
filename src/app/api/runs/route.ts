import { NextRequest, NextResponse } from 'next/server';
import { getAgentRuns, getRunAnalytics } from '@/lib/db/run-queries';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const agentId = req.nextUrl.searchParams.get('agentId') || undefined;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 200);
  const includeAnalytics = req.nextUrl.searchParams.get('analytics') === 'true';

  const runs = getAgentRuns(projectId, agentId, limit);

  const parsed = runs.map(r => ({
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    agentRole: r.agent_role,
    status: r.status,
    invocationSource: r.invocation_source,
    taskId: r.task_id,
    model: r.model,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    exitCode: r.exit_code,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costCents: r.cost_cents,
    toolCalls: r.tool_calls,
    stdoutExcerpt: r.stdout_excerpt,
    durationMs: r.started_at && r.finished_at
      ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
      : null,
    createdAt: r.created_at,
  }));

  const result: Record<string, unknown> = { runs: parsed };

  if (includeAnalytics) {
    result.analytics = getRunAnalytics(projectId, agentId);
  }

  return NextResponse.json(result);
}
