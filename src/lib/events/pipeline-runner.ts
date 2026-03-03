import { eventBus, type ServerEvent } from './event-bus';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

/**
 * Pipeline Runner — Subscribes to task.status_changed events.
 * When a task linked to a running pipeline step reaches DONE,
 * it advances the pipeline to the next step (creating the next task).
 */

let initialized = false;

export function initPipelineRunner() {
  if (initialized) return;
  initialized = true;

  eventBus.on('server-event', (event: ServerEvent) => {
    if (event.type !== 'task.status_changed') return;
    const data = event.data as Record<string, unknown>;
    if (data.status !== 'DONE') return;

    try {
      advancePipelinesForTask(data.id as string, event.projectId);
    } catch {
      // Non-critical
    }
  });
}

interface PipelineStep {
  templateId: string;
  onFailure?: 'stop' | 'skip' | 'retry';
  taskId?: string; // Filled at runtime when task is created
}

function advancePipelinesForTask(taskId: string, projectId: string) {
  // Find any running pipeline runs that reference this task in their current step
  const runs = db.select().from(schema.pipelineRuns)
    .where(and(
      eq(schema.pipelineRuns.projectId, projectId),
      eq(schema.pipelineRuns.status, 'running'),
    ))
    .all();

  for (const run of runs) {
    const steps: PipelineStep[] = JSON.parse(run.stepsSnapshot);
    const currentStep = steps[run.currentStep];
    if (!currentStep || currentStep.taskId !== taskId) continue;

    // This task matches the current step — advance
    const nextStepIndex = run.currentStep + 1;

    if (nextStepIndex >= steps.length) {
      // Pipeline complete
      const now = new Date().toISOString();
      db.update(schema.pipelineRuns).set({
        status: 'completed',
        currentStep: nextStepIndex,
        completedAt: now,
      }).where(eq(schema.pipelineRuns.id, run.id)).run();

      eventBus.broadcast('pipeline.completed', {
        id: run.id, pipelineId: run.pipelineId,
      }, projectId);
    } else {
      // Create task for next step
      const nextStep = steps[nextStepIndex];
      const newTaskId = createTaskFromTemplate(nextStep.templateId, projectId, run.id);

      if (newTaskId) {
        nextStep.taskId = newTaskId;
        const now = new Date().toISOString();
        db.update(schema.pipelineRuns).set({
          currentStep: nextStepIndex,
          stepsSnapshot: JSON.stringify(steps),
        }).where(eq(schema.pipelineRuns.id, run.id)).run();

        eventBus.broadcast('pipeline.step_completed', {
          id: run.id, pipelineId: run.pipelineId,
          completedStep: run.currentStep, nextStep: nextStepIndex, taskId: newTaskId,
        }, projectId);
      }
    }
  }
}

function createTaskFromTemplate(templateId: string, projectId: string, runId: string): string | null {
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
    pipelineRunId: runId,
  }, projectId);

  return taskId;
}
