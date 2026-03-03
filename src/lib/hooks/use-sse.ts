'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { SSEMessage } from '@/lib/types';

export function useSSE(
  projectId: string | null,
  onMessage: (msg: SSEMessage) => void
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!projectId) return;

    const es = new EventSource(`/api/events?projectId=${projectId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as SSEMessage;
        onMessageRef.current(msg);
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectId]);

  const close = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { close };
}
