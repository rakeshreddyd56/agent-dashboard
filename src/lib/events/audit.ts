import { eventBus, type ServerEvent } from './event-bus';
import { db, schema } from '@/lib/db';

/**
 * Audit Logger — Subscribes to the event bus and logs every mutation.
 *
 * Every event becomes an audit_log row with:
 *   - actor: who did it (agent ID, 'dashboard', or 'system')
 *   - action: what happened (event type)
 *   - target: what was affected (task, agent, etc.)
 */

let initialized = false;

export function initAuditListener() {
  if (initialized) return;
  initialized = true;

  eventBus.on('server-event', (event: ServerEvent) => {
    // Skip audit.logged events to avoid infinite loop
    if (event.type === 'audit.logged') return;

    // Skip high-frequency events that would flood the log
    if (event.type === 'sync.complete' || event.type === 'analytics.updated') return;

    try {
      const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const data = event.data as Record<string, unknown> | null;

      db.insert(schema.auditLog).values({
        id,
        projectId: event.projectId,
        action: event.type,
        actor: extractActor(data),
        actorType: extractActorType(event.type),
        targetType: extractTargetType(event.type),
        targetId: extractTargetId(data),
        detail: data ? JSON.stringify(data) : null,
        createdAt: new Date(event.timestamp).toISOString(),
      }).run();
    } catch {
      // Non-critical — don't break the event flow
    }
  });
}

function extractActor(data: Record<string, unknown> | null): string {
  if (!data) return 'system';
  if (typeof data.agentId === 'string') return data.agentId;
  if (typeof data.fromAgent === 'string') return data.fromAgent;
  if (typeof data.reviewer === 'string') return data.reviewer;
  if (typeof data.triggeredBy === 'string') return data.triggeredBy;
  if (typeof data.assignedAgent === 'string') return data.assignedAgent;
  return 'system';
}

function extractActorType(eventType: string): string {
  if (eventType.startsWith('agent.') || eventType.startsWith('task.')) return 'agent';
  if (eventType.startsWith('message.')) return 'agent';
  if (eventType.startsWith('review.')) return 'agent';
  return 'system';
}

function extractTargetType(eventType: string): string | null {
  if (eventType.startsWith('task.')) return 'task';
  if (eventType.startsWith('agent.')) return 'agent';
  if (eventType.startsWith('message.')) return 'message';
  if (eventType.startsWith('review.')) return 'review';
  if (eventType.startsWith('pipeline.')) return 'pipeline';
  if (eventType.startsWith('mission.')) return 'mission';
  if (eventType.startsWith('lock.')) return 'lock';
  if (eventType.startsWith('notification.')) return 'notification';
  if (eventType.startsWith('standup.')) return 'standup';
  return null;
}

function extractTargetId(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  if (typeof data.id === 'string') return data.id;
  if (typeof data.taskId === 'string') return data.taskId;
  if (typeof data.agentId === 'string') return data.agentId;
  if (typeof data.messageId === 'string') return data.messageId;
  if (typeof data.pipelineId === 'string') return data.pipelineId;
  return null;
}
