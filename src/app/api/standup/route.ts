import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';
import { getProjectTasks, getProjectAgents, getProjectEvents } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const date = searchParams.get('date');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 30);

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (date) {
    const report = db.select().from(schema.standupReports)
      .where(and(eq(schema.standupReports.projectId, projectId), eq(schema.standupReports.date, date)))
      .get();
    return NextResponse.json({ report: report ? { ...report, report: JSON.parse(report.report) } : null });
  }

  const reports = db.select().from(schema.standupReports)
    .where(eq(schema.standupReports.projectId, projectId))
    .orderBy(desc(schema.standupReports.date))
    .limit(limit)
    .all()
    .map((r) => ({ ...r, report: JSON.parse(r.report) }));

  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { projectId, date: requestDate } = body as Record<string, string | undefined>;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    if (!projectTablesExist(projectId as string)) {
      createProjectTables(projectId as string);
    }

  const date = requestDate || new Date().toISOString().slice(0, 10);

  // Check if already generated
  const existing = db.select().from(schema.standupReports)
    .where(and(eq(schema.standupReports.projectId, projectId), eq(schema.standupReports.date, date)))
    .get();

  if (existing) {
    return NextResponse.json({ report: { ...existing, report: JSON.parse(existing.report) }, cached: true });
  }

  // Gather data for report
  const dayStart = `${date}T00:00:00.000Z`;

  // All tasks
  const allTasks = getProjectTasks(projectId as string);

  // Recent events (today)
  const todayEvents = getProjectEvents(projectId as string, { limit: 1000 })
    .filter(e => e.timestamp >= dayStart);

  // Agents
  const agents = getProjectAgents(projectId as string);

  // Build per-agent report
  const agentReports: Record<string, {
    agentId: string; role: string; status: string;
    completed: string[]; inProgress: string[]; blocked: string[];
    eventCount: number;
  }> = {};

  for (const agent of agents) {
    agentReports[agent.agent_id] = {
      agentId: agent.agent_id,
      role: agent.role,
      status: agent.status,
      completed: [],
      inProgress: [],
      blocked: [],
      eventCount: 0,
    };
  }

  // Categorize tasks by assigned agent
  for (const task of allTasks) {
    const agent = task.assigned_agent;
    if (!agent) continue;
    if (!agentReports[agent]) {
      agentReports[agent] = {
        agentId: agent, role: 'unknown', status: 'unknown',
        completed: [], inProgress: [], blocked: [], eventCount: 0,
      };
    }
    if (task.status === 'DONE' && task.updated_at >= dayStart) {
      agentReports[agent].completed.push(task.title);
    } else if (['IN_PROGRESS', 'REVIEW', 'QUALITY_REVIEW', 'TESTING'].includes(task.status)) {
      agentReports[agent].inProgress.push(task.title);
    } else if (task.status === 'FAILED') {
      agentReports[agent].blocked.push(task.title);
    }
  }

  // Count events per agent
  for (const evt of todayEvents) {
    if (evt.agent_id && agentReports[evt.agent_id]) {
      agentReports[evt.agent_id].eventCount++;
    }
  }

  // Summary stats
  const byStatus: Record<string, number> = {};
  for (const t of allTasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }

  const overdue = allTasks.filter((t) =>
    t.priority === 'P0' && !['DONE', 'TESTED'].includes(t.status)
  );

  const report = {
    date,
    summary: {
      totalTasks: allTasks.length,
      byStatus,
      activeAgents: agents.filter((a) => a.status !== 'offline').length,
      totalAgents: agents.length,
      todayEvents: todayEvents.length,
      overdueCritical: overdue.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    },
    agents: Object.values(agentReports),
  };

  // Save
  const now = new Date().toISOString();
  const id = `standup-${date}-${Math.random().toString(36).slice(2, 8)}`;

  db.insert(schema.standupReports).values({
    id,
    projectId,
    date,
    report: JSON.stringify(report),
    createdAt: now,
  }).run();

  eventBus.broadcast('standup.generated', { id, date }, projectId);

    return NextResponse.json({ report: { id, projectId, date, report, createdAt: now } });
  } catch (err) {
    console.error('POST /api/standup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
