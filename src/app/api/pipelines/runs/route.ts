import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const pipelineId = searchParams.get('pipelineId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const conditions = [eq(schema.pipelineRuns.projectId, projectId)];
  if (pipelineId) conditions.push(eq(schema.pipelineRuns.pipelineId, pipelineId));

  const runs = db.select().from(schema.pipelineRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.pipelineRuns.createdAt))
    .limit(limit)
    .all()
    .map((r) => ({ ...r, stepsSnapshot: JSON.parse(r.stepsSnapshot) }));

  return NextResponse.json({ runs });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { projectId, pipelineId, triggeredBy, action } = body as Record<string, string | undefined>;

    if (!projectId || !pipelineId) {
      return NextResponse.json({ error: 'projectId and pipelineId required' }, { status: 400 });
    }

    // Handle cancel action
    if (action === 'cancel') {
      const runId = body.runId as string;
      if (!runId) {
        return NextResponse.json({ error: 'runId required for cancel' }, { status: 400 });
      }
      const now = new Date().toISOString();
      db.update(schema.pipelineRuns).set({
        status: 'cancelled',
        completedAt: now,
      }).where(eq(schema.pipelineRuns.id, runId)).run();

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // Start a new run
    const pipeline = db.select().from(schema.workflowPipelines)
      .where(and(
        eq(schema.workflowPipelines.id, pipelineId),
        eq(schema.workflowPipelines.projectId, projectId),
      ))
      .get();

    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const steps = JSON.parse(pipeline.steps);
    if (!steps.length) {
      return NextResponse.json({ error: 'Pipeline has no steps' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create task for first step
    const firstStep = steps[0];
    const firstTaskId = await createTaskFromTemplate(firstStep.templateId, projectId);

    if (firstTaskId) {
      firstStep.taskId = firstTaskId;
    }

    db.insert(schema.pipelineRuns).values({
      id,
      projectId,
      pipelineId,
      status: 'running',
      currentStep: 0,
      stepsSnapshot: JSON.stringify(steps),
      triggeredBy: triggeredBy || 'dashboard',
      startedAt: now,
      completedAt: null,
      createdAt: now,
    }).run();

    // Update pipeline usage stats
    db.update(schema.workflowPipelines).set({
      useCount: pipeline.useCount + 1,
      lastUsedAt: now,
    }).where(eq(schema.workflowPipelines.id, pipelineId)).run();

    eventBus.broadcast('pipeline.started', {
      id, pipelineId, name: pipeline.name, triggeredBy,
    }, projectId);

    return NextResponse.json({ success: true, id, firstTaskId });
  } catch (err) {
    console.error('POST /api/pipelines/runs error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function createTaskFromTemplate(templateId: string, projectId: string): Promise<string | null> {
  const template = db.select().from(schema.workflowTemplates)
    .where(eq(schema.workflowTemplates.id, templateId))
    .get();

  if (!template) return null;

  const now = new Date().toISOString();
  const taskId = `${projectId}-pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Find agent for the role
  let assignedAgent: string | null = null;
  if (template.assignToRole) {
    const agent = db.select().from(schema.agentSnapshots)
      .where(and(
        eq(schema.agentSnapshots.projectId, projectId),
        eq(schema.agentSnapshots.role, template.assignToRole),
      ))
      .get();
    if (agent) assignedAgent = agent.agentId;
  }

  db.insert(schema.tasks).values({
    id: taskId,
    projectId,
    externalId: null,
    title: template.taskTitle,
    description: template.taskDescription || null,
    status: assignedAgent ? 'ASSIGNED' : 'TODO',
    priority: template.priority,
    assignedAgent,
    tags: template.tags,
    effort: template.estimatedEffort || null,
    dependencies: '[]',
    source: 'coordination',
    columnOrder: 0,
    createdAt: now,
    updatedAt: now,
  }).run();

  eventBus.broadcast('task.created', {
    id: taskId, projectId, title: template.taskTitle,
    status: assignedAgent ? 'ASSIGNED' : 'TODO',
    priority: template.priority, assignedAgent,
  }, projectId);

  return taskId;
}
