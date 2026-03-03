'use client';

import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import { useTaskStore } from '@/lib/store/task-store';
import { useAgentStore } from '@/lib/store/agent-store';
import { useEventStore } from '@/lib/store/event-store';
import { useAnalyticsStore } from '@/lib/store/analytics-store';
import { useMessageStore } from '@/lib/store/message-store';
import { useNotificationStore } from '@/lib/store/notification-store';

type SSEState = 'connecting' | 'connected' | 'disconnected';

let sseStateListeners: ((state: SSEState) => void)[] = [];
let currentSSEState: SSEState = 'disconnected';

export function getSSEState() { return currentSSEState; }
export function onSSEStateChange(fn: (state: SSEState) => void) {
  sseStateListeners.push(fn);
  return () => { sseStateListeners = sseStateListeners.filter((f) => f !== fn); };
}
function setSSEState(state: SSEState) {
  currentSSEState = state;
  for (const fn of sseStateListeners) fn(state);
}

function handleSSEMessage(e: MessageEvent) {
  try {
    const msg = JSON.parse(e.data);
    const activeProjectId = useProjectStore.getState().activeProjectId;
    switch (msg.type) {
      case 'agent:sync':
        if (msg.data?.agents) useAgentStore.getState().setAgents(msg.data.agents);
        break;
      case 'agent:update':
        if (msg.data?.agentId) useAgentStore.getState().upsertAgent(msg.data.agentId, msg.data);
        break;
      case 'task:sync': {
        if (msg.data?.tasks) {
          const currentTasks = useTaskStore.getState().tasks;
          const dashboardTasks = currentTasks.filter(
            (t) => t.source === 'dashboard' && t.projectId === activeProjectId
          );
          const syncedTasks = msg.data.tasks;
          const seenIds = new Set(syncedTasks.map((t: { id: string }) => t.id));
          const uniqueDashboard = dashboardTasks.filter((t) => !seenIds.has(t.id));
          useTaskStore.getState().setTasks([...syncedTasks, ...uniqueDashboard]);
        }
        break;
      }
      case 'task:update':
        if (msg.data?.id) {
          const exists = useTaskStore.getState().tasks.some((t) => t.id === msg.data.id);
          if (exists) {
            useTaskStore.getState().updateTask(msg.data.id, msg.data);
          } else if (msg.data.title) {
            useTaskStore.getState().addTask(msg.data);
          }
        }
        break;
      case 'task:delete':
        if (msg.data?.id) useTaskStore.getState().removeTask(msg.data.id);
        break;
      case 'event:new':
        if (msg.data?.events) {
          for (const evt of msg.data.events) useEventStore.getState().addEvent(evt);
        } else if (msg.data?.id) {
          useEventStore.getState().addEvent(msg.data);
        }
        break;
      case 'sync:complete':
      case 'analytics:update':
        useAnalyticsStore.getState().markStale();
        break;
      case 'mission:update':
        break;
      case 'message:new':
        if (msg.data) useMessageStore.getState().addMessage(msg.data);
        break;
      case 'notification:new':
        if (msg.data) useNotificationStore.getState().addNotification(msg.data);
        break;
      case 'notification:read':
        break;
    }
  } catch {
    // ignore parse errors
  }
}

export function SSEProvider() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const eventSourceRef = useRef<EventSource | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!activeProjectId) return;

    setSSEState('connecting');

    // Load initial data only once per project change
    if (!initRef.current || eventSourceRef.current === null) {
      initRef.current = true;
      Promise.all([
        fetch(`/api/tasks?projectId=${activeProjectId}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/agents?projectId=${activeProjectId}`).then((r) => r.ok ? r.json() : null),
      ]).then(([taskData, agentData]) => {
        if (taskData?.tasks) useTaskStore.getState().setTasks(taskData.tasks);
        if (agentData?.agents) useAgentStore.getState().setAgents(agentData.agents);
      }).catch(console.error);
    }

    // Connect SSE
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/events?projectId=${activeProjectId}`);
    eventSourceRef.current = es;

    es.onopen = () => setSSEState('connected');
    es.onmessage = handleSSEMessage;

    es.onerror = () => {
      setSSEState('disconnected');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setSSEState('disconnected');
    };
  }, [activeProjectId]);

  return null;
}
