import { EventEmitter } from 'events';

/**
 * Centralized Event Bus — All domain events flow through here.
 *
 * Subscribers:
 *   - SSE emitter (bridges to client-side via Server-Sent Events)
 *   - Audit logger (Phase 2 — logs every event to audit_log table)
 *   - Notification generator (Phase 3 — creates notifications for relevant events)
 *   - Pipeline runner (Phase 5 — auto-advances pipelines on task completion)
 *   - Webhooks (Phase 6 — fires outbound HTTP events)
 */

export type EventType =
  // Tasks
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.status_changed'
  | 'task.synced'
  // Agents
  | 'agent.updated'
  | 'agent.synced'
  | 'agent.status_changed'
  | 'agent.heartbeat_lost'
  // Events / logs
  | 'event.created'
  // File locks
  | 'lock.updated'
  // Sync
  | 'sync.complete'
  // Analytics
  | 'analytics.updated'
  // Mission
  | 'mission.updated'
  // Messages (Phase 3)
  | 'message.created'
  | 'message.read'
  // Notifications (Phase 3)
  | 'notification.created'
  | 'notification.read'
  // Quality Reviews (Phase 4)
  | 'review.created'
  | 'review.decided'
  // Pipelines (Phase 5)
  | 'pipeline.started'
  | 'pipeline.step_completed'
  | 'pipeline.completed'
  // Standup (Phase 4)
  | 'standup.generated'
  // Audit (Phase 2)
  | 'audit.logged'
  // Office (Phase 6)
  | 'office.state_changed'
  | 'office.research_complete'
  | 'office.communication'
  | 'office.memory_updated'
  // Hooks (Phase 7)
  | 'hook.received';

export interface ServerEvent {
  type: EventType;
  data: unknown;
  projectId: string;
  timestamp: number;
}

class ServerEventBus extends EventEmitter {
  broadcast(type: EventType, data: unknown, projectId: string): ServerEvent {
    const event: ServerEvent = {
      type,
      data,
      projectId,
      timestamp: Date.now(),
    };
    this.emit('server-event', event);
    return event;
  }
}

// Singleton that survives Next.js HMR
const GLOBAL_KEY = '__event_bus__';
const g = globalThis as unknown as Record<string, ServerEventBus>;

if (!g[GLOBAL_KEY]) {
  const bus = new ServerEventBus();
  bus.setMaxListeners(50);
  g[GLOBAL_KEY] = bus;
}

export const eventBus: ServerEventBus = g[GLOBAL_KEY];
