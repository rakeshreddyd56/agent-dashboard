'use client';

import { useCallback } from 'react';
import { useAgentStore } from '@/lib/store/agent-store';
import { useProjectStore } from '@/lib/store/project-store';
import { HEARTBEAT_THRESHOLDS } from '@/lib/constants';

export type HeartbeatStatus = 'healthy' | 'warning' | 'stale' | 'unknown';

export function useAgents() {
  const { agents, setAgents } = useAgentStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const fetchAgents = useCallback(async () => {
    if (!activeProjectId) return;
    const res = await fetch(`/api/agents?projectId=${activeProjectId}`);
    const data = await res.json();
    if (data.agents) setAgents(data.agents);
  }, [activeProjectId, setAgents]);

  const getHeartbeatStatus = useCallback((lastHeartbeat?: string): HeartbeatStatus => {
    if (!lastHeartbeat) return 'unknown';
    const diff = Date.now() - new Date(lastHeartbeat).getTime();
    if (diff < HEARTBEAT_THRESHOLDS.healthy) return 'healthy';
    if (diff < HEARTBEAT_THRESHOLDS.warning) return 'warning';
    return 'stale';
  }, []);

  const projectAgents = agents.filter((a) => a.projectId === activeProjectId);

  return {
    agents: projectAgents,
    fetchAgents,
    getHeartbeatStatus,
  };
}
