import { eventBus, type ServerEvent } from './event-bus';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

/**
 * Notification Generator — Subscribes to event bus and auto-creates
 * notifications for important events (heartbeat lost, task assignments,
 * messages, reviews, mentions).
 */

let initialized = false;

export function initNotificationGenerator() {
  if (initialized) return;
  initialized = true;

  eventBus.on('server-event', (event: ServerEvent) => {
    try {
      handleEvent(event);
    } catch {
      // Non-critical — don't break the event flow
    }
  });
}

function handleEvent(event: ServerEvent) {
  const data = event.data as Record<string, unknown> | null;
  if (!data) return;

  switch (event.type) {
    case 'agent.heartbeat_lost': {
      const agentId = data.agentId as string;
      if (!agentId) return;
      createNotification({
        projectId: event.projectId,
        recipient: 'all',
        type: 'heartbeat_lost',
        title: 'Agent Offline',
        message: `Agent "${agentId}" has gone offline (no heartbeat).`,
        sourceType: 'agent',
        sourceId: agentId,
      });
      break;
    }

    case 'task.status_changed': {
      const assignee = data.assignedAgent as string;
      const title = data.title as string || 'Untitled';
      const newStatus = data.status as string;
      const taskId = data.id as string;
      if (assignee) {
        createNotification({
          projectId: event.projectId,
          recipient: assignee,
          type: 'status_change',
          title: 'Task Status Changed',
          message: `Task "${title}" moved to ${newStatus}.`,
          sourceType: 'task',
          sourceId: taskId,
        });
      }
      break;
    }

    case 'message.created': {
      const toAgent = data.toAgent as string;
      const fromAgent = data.fromAgent as string;
      const content = data.content as string || '';
      if (toAgent && toAgent !== fromAgent) {
        createNotification({
          projectId: event.projectId,
          recipient: toAgent,
          type: 'message',
          title: `Message from ${fromAgent}`,
          message: content.length > 100 ? content.slice(0, 100) + '...' : content,
          sourceType: 'message',
          sourceId: data.id as string,
        });
      }
      break;
    }

    case 'review.created': {
      const taskId = data.taskId as string;
      // Notify the assigned agent that a review is needed
      if (taskId) {
        const task = db.select().from(schema.tasks)
          .where(eq(schema.tasks.id, taskId))
          .get();
        if (task?.assignedAgent) {
          createNotification({
            projectId: event.projectId,
            recipient: task.assignedAgent,
            type: 'review_requested',
            title: 'Review Requested',
            message: `Task "${task.title}" has a pending quality review.`,
            sourceType: 'review',
            sourceId: data.id as string,
          });
        }
      }
      break;
    }

    case 'task.created': {
      const assignee = data.assignedAgent as string;
      const title = data.title as string;
      const taskId = data.id as string;
      if (assignee) {
        createNotification({
          projectId: event.projectId,
          recipient: assignee,
          type: 'assignment',
          title: 'Task Assigned',
          message: `You've been assigned: "${title}".`,
          sourceType: 'task',
          sourceId: taskId,
        });
      }
      break;
    }
  }

  // Check for @mentions in task comments
  if (event.type === 'task.updated' && data.lastComment) {
    const comment = data.lastComment as Record<string, unknown>;
    const content = comment.content as string || '';
    const mentionRegex = /@(\S+)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentioned = match[1];
      if (mentioned !== comment.agentId) {
        createNotification({
          projectId: event.projectId,
          recipient: mentioned,
          type: 'mention',
          title: `Mentioned by ${comment.agentId}`,
          message: content.length > 100 ? content.slice(0, 100) + '...' : content,
          sourceType: 'task',
          sourceId: data.id as string,
        });
      }
    }
  }
}

function createNotification(params: {
  projectId: string;
  recipient: string;
  type: string;
  title: string;
  message: string;
  sourceType?: string;
  sourceId?: string;
}) {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  db.insert(schema.notifications).values({
    id,
    projectId: params.projectId,
    recipient: params.recipient,
    type: params.type,
    title: params.title,
    message: params.message,
    sourceType: params.sourceType || null,
    sourceId: params.sourceId || null,
    readAt: null,
    createdAt: now,
  }).run();

  eventBus.broadcast('notification.created', {
    id,
    recipient: params.recipient,
    type: params.type,
    title: params.title,
    message: params.message,
  }, params.projectId);
}
