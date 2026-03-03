'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSSEState, onSSEStateChange } from '@/components/layout/sse-provider';

/**
 * Smart polling hook — visibility-aware, SSE-connection-aware, with backoff.
 *
 * Adapted from mission-control's useSmartPoll pattern.
 *
 * - Pauses when tab is hidden (document.visibilitychange)
 * - Optionally pauses when SSE is connected (no double-fetching)
 * - Exponential backoff on fetch failures (capped at maxBackoffMultiplier)
 * - Always fires once on mount for initial data bootstrap
 * - Returns manual trigger function for immediate fetch
 */

interface SmartPollOptions {
  /** Pause polling when SSE stream is connected (default: false) */
  pauseWhenSseConnected?: boolean;
  /** Enable exponential backoff on errors (default: true) */
  backoff?: boolean;
  /** Max backoff multiplier, e.g. 3 = up to 3x base interval (default: 3) */
  maxBackoffMultiplier?: number;
  /** Enable/disable polling (default: true) */
  enabled?: boolean;
}

export function useSmartPoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: SmartPollOptions = {}
): () => void {
  const {
    pauseWhenSseConnected = false,
    backoff = true,
    maxBackoffMultiplier = 3,
    enabled = true,
  } = options;

  const callbackRef = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffMultiplier = useRef(1);
  const isVisibleRef = useRef(true);
  const initialFiredRef = useRef(false);
  const [sseState, setSseState] = useState(getSSEState());

  // Keep callback ref current
  useEffect(() => { callbackRef.current = callback; }, [callback]);

  // Subscribe to SSE state changes
  useEffect(() => onSSEStateChange(setSseState), []);

  const shouldPoll = useCallback(() => {
    if (!enabled) return false;
    if (!isVisibleRef.current) return false;
    if (pauseWhenSseConnected && sseState === 'connected') return false;
    return true;
  }, [enabled, pauseWhenSseConnected, sseState]);

  const executePoll = useCallback(async () => {
    try {
      await callbackRef.current();
      // Reset backoff on success
      backoffMultiplier.current = 1;
    } catch {
      // Increase backoff on failure
      if (backoff) {
        backoffMultiplier.current = Math.min(
          backoffMultiplier.current + 0.5,
          maxBackoffMultiplier
        );
      }
    }
  }, [backoff, maxBackoffMultiplier]);

  // Manual trigger
  const trigger = useCallback(() => {
    executePoll();
  }, [executePoll]);

  useEffect(() => {
    // Always fire once on mount, even if paused
    if (!initialFiredRef.current && enabled) {
      initialFiredRef.current = true;
      executePoll();
    }

    // Visibility change handler
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        // Reset backoff when tab becomes visible
        backoffMultiplier.current = 1;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Set up polling interval
    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const actualInterval = intervalMs * backoffMultiplier.current;
      intervalRef.current = setInterval(() => {
        if (shouldPoll()) {
          executePoll();
        }
      }, actualInterval);
    };

    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, intervalMs, shouldPoll, executePoll]);

  return trigger;
}
