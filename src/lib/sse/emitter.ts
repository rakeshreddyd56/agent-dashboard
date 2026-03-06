import type { SSEEventType } from '@/lib/types';
import type { EventType, ServerEvent } from '@/lib/events/event-bus';

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
  projectId: string;
  connectedAt: number;
};

const MAX_CLIENTS = 50;
const HEARTBEAT_INTERVAL = 30_000;

/**
 * Maps event bus EventType → SSEEventType for backward compatibility.
 * The SSEProvider on the client expects the colon-separated format.
 */
const EVENT_TYPE_MAP: Record<string, SSEEventType> = {
  'task.created': 'task:update',
  'task.updated': 'task:update',
  'task.status_changed': 'task:update',
  'task.synced': 'task:sync',
  'task.deleted': 'task:delete',
  'agent.updated': 'agent:update',
  'agent.synced': 'agent:sync',
  'agent.status_changed': 'agent:update',
  'agent.heartbeat_lost': 'event:new',
  'event.created': 'event:new',
  'lock.updated': 'lock:update',
  'sync.complete': 'sync:complete',
  'analytics.updated': 'analytics:update',
  'mission.updated': 'mission:update',
  // Phase 3+
  'message.created': 'message:new',
  'notification.created': 'notification:new',
  'notification.read': 'notification:read',
  'review.created': 'review:update',
  'review.decided': 'review:update',
  'pipeline.started': 'pipeline:update',
  'pipeline.step_completed': 'pipeline:update',
  'pipeline.completed': 'pipeline:update',
  'standup.generated': 'standup:new',
  // Phase 6: Office
  'office.state_changed': 'office:update',
  'office.research_complete': 'office:research',
  'office.communication': 'office:communication',
  'office.memory_updated': 'office:memory',
  // Hooks
  'hook.received': 'agent:update',
};

class SSEEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventBusConnected = false;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const payload = `: heartbeat\n\n`;
      const encoded = new TextEncoder().encode(payload);
      for (const [clientId, client] of this.clients) {
        try {
          client.controller.enqueue(encoded);
        } catch {
          this.clients.delete(clientId);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  /** Subscribe to the event bus — called once lazily */
  connectEventBus() {
    if (this.eventBusConnected) return;
    this.eventBusConnected = true;

    // Dynamic import to avoid circular dependency at module init time
    import('@/lib/events/event-bus').then(({ eventBus }) => {
      eventBus.on('server-event', (event: ServerEvent) => {
        const sseType = EVENT_TYPE_MAP[event.type];
        if (sseType) {
          this.sendToClients(sseType, event.data, event.projectId);
        }
      });
    }).catch(() => {
      // Event bus not available yet — will retry on next addClient
      this.eventBusConnected = false;
    });
  }

  addClient(id: string, controller: ReadableStreamDefaultController, projectId: string) {
    // Ensure we're connected to event bus
    this.connectEventBus();

    // Evict oldest clients if at capacity
    if (this.clients.size >= MAX_CLIENTS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [cid, client] of this.clients) {
        if (client.connectedAt < oldestTime) {
          oldestTime = client.connectedAt;
          oldestId = cid;
        }
      }
      if (oldestId) {
        try {
          this.clients.get(oldestId)?.controller.close();
        } catch { /* already closed */ }
        this.clients.delete(oldestId);
      }
    }

    this.clients.set(id, { id, controller, projectId, connectedAt: Date.now() });
  }

  removeClient(id: string) {
    this.clients.delete(id);
  }

  /**
   * Direct emit — DEPRECATED, use eventBus.broadcast() instead.
   * Kept for backward compat during migration period.
   */
  emit(type: SSEEventType, data: unknown, projectId: string) {
    this.sendToClients(type, data, projectId);
  }

  private sendToClients(type: SSEEventType | string, data: unknown, projectId: string) {
    const message = JSON.stringify({
      type,
      data,
      projectId,
      timestamp: new Date().toISOString(),
    });

    const payload = `data: ${message}\n\n`;

    for (const [clientId, client] of this.clients) {
      if (client.projectId === projectId || client.projectId === '*') {
        try {
          client.controller.enqueue(new TextEncoder().encode(payload));
        } catch {
          this.clients.delete(clientId);
        }
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton pattern for Next.js dev mode HMR
const key = '__sse_emitter__';
const g = globalThis as unknown as Record<string, SSEEmitter>;
if (!g[key]) {
  g[key] = new SSEEmitter();
}

export const sseEmitter: SSEEmitter = g[key];
