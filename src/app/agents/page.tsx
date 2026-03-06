'use client';

import { useState, useCallback, useMemo } from 'react';
import { AgentGrid } from '@/components/agents/agent-grid';
import { PixelOffice } from '@/components/pixel-agents/pixel-office';
import { CommunicationGraph } from '@/components/agents/communication-graph';
import { AgentTimeline } from '@/components/agents/agent-timeline';
import { useAgentStore } from '@/lib/store/agent-store';
import { useProjectStore } from '@/lib/store/project-store';
import { useEventStore } from '@/lib/store/event-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { SkeletonAgentGrid } from '@/components/shared/skeletons';
import { FloorSelector } from '@/components/shared/floor-selector';
import { useOfficeStore } from '@/lib/store/office-store';
import { filterAgentsByFloor } from '@/lib/utils/floor-filter';
import { useSmartPoll } from '@/lib/hooks/use-smart-poll';
import { OFFICE_CONFIG, AGENT_CHARACTERS } from '@/lib/constants';
import { Rocket, RotateCcw, Eye, RefreshCw } from 'lucide-react';
import type { AgentSnapshot, AgentRole, AgentStatus } from '@/lib/types';

/** Create placeholder agents for a floor when none exist in the DB */
function getFloorPlaceholders(floor: 'all' | 1 | 2 | 3, projectId: string, existingIds: Set<string>): AgentSnapshot[] {
  if (floor === 'all') return [];
  const floorRoles = OFFICE_CONFIG.floorAgents[floor] || [];
  const placeholders: AgentSnapshot[] = [];
  for (const roleId of floorRoles) {
    if (existingIds.has(roleId)) continue;
    const charInfo = AGENT_CHARACTERS[roleId];
    placeholders.push({
      id: `${projectId}-${roleId}`,
      projectId,
      agentId: roleId,
      role: roleId as AgentRole,
      status: 'offline' as AgentStatus,
      currentTask: undefined,
      model: charInfo?.model,
      sessionStart: undefined,
      lastHeartbeat: undefined,
      lockedFiles: [],
      progress: undefined,
      estimatedCost: undefined,
      createdAt: new Date().toISOString(),
    });
  }
  return placeholders;
}

export default function AgentsPage() {
  const allAgents = useAgentStore((s) => s.agents);
  const setAgents = useAgentStore((s) => s.setAgents);
  const events = useEventStore((s) => s.events);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectName = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name || 'Agent Dashboard');
  const viewFloor = useOfficeStore((s) => s.viewFloor);
  const projectAgents = activeProjectId ? allAgents.filter((a) => a.projectId === activeProjectId) : allAgents;
  const floorAgents = filterAgentsByFloor(projectAgents, viewFloor);

  // If viewing a specific floor and no agents exist for it, show placeholders
  const agents = useMemo(() => {
    if (viewFloor === 'all' || floorAgents.length > 0) return floorAgents;
    if (!activeProjectId) return floorAgents;
    const existingIds = new Set(projectAgents.map((a) => a.agentId));
    const placeholders = getFloorPlaceholders(viewFloor, activeProjectId, existingIds);
    return placeholders.length > 0 ? placeholders : floorAgents;
  }, [viewFloor, floorAgents, activeProjectId, projectAgents]);

  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const offlineCount = agents.filter((a) => a.status === 'offline' || a.status === 'completed').length;
  const activeCount = agents.filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length;
  const supervisorCount = agents.filter((a) => (a.role === 'supervisor' || a.role === 'supervisor-2') && a.status === 'working').length;

  // Auto-refresh: poll agents every 5 seconds
  const fetchAgents = useCallback(async () => {
    if (!activeProjectId) return;
    const res = await fetch(`/api/agents?projectId=${activeProjectId}`);
    const data = await res.json();
    if (data.agents) setAgents(data.agents);
  }, [activeProjectId, setAgents]);

  // Auto-poll every 5s (also works as SSE fallback)
  useSmartPoll(fetchAgents, 5000, { pauseWhenSseConnected: false });

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAgents();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [fetchAgents]);

  const handleLaunchAll = async () => {
    if (!activeProjectId || launching) return;
    const respawnRoles = agents
      .filter((a) => (a.status === 'offline' || a.status === 'completed') && a.role !== 'supervisor' && a.role !== 'supervisor-2')
      .map((a) => a.agentId);
    if (respawnRoles.length === 0) return;

    setLaunching(true);
    setLaunchMsg(null);
    try {
      // Fetch available TODO tasks from the board
      const taskRes = await fetch(
        `/api/agent-actions?action=list-tasks&projectId=${activeProjectId}&status=TODO`
      );
      const taskData = await taskRes.json();
      const availableTasks: { id: string; title: string }[] = (taskData.tasks || [])
        .map((t: { id: string; title: string }) => ({ id: t.id, title: t.title }));

      // Launch each agent with next available task
      const results: { role: string; status: string }[] = [];
      for (let i = 0; i < respawnRoles.length; i++) {
        const role = respawnRoles[i];
        const task = availableTasks[i]; // one task per agent, or undefined

        const res = await fetch('/api/agents/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: activeProjectId,
            agents: [role],
            ...(task ? { task: { id: task.id, title: task.title } } : {}),
          }),
        });
        const data = await res.json();
        if (data.results) {
          results.push(...data.results);
        }
      }

      const launched = results.filter((r) => r.status === 'launched').length;
      const errors = results.filter((r) => r.status === 'error').length;
      const parts: string[] = [];
      if (launched > 0) parts.push(`${launched} launched`);
      if (errors > 0) parts.push(`${errors} failed`);
      setLaunchMsg(parts.join(', ') || 'No agents processed');
    } catch {
      setLaunchMsg('Launch failed');
    } finally {
      setLaunching(false);
      setTimeout(() => setLaunchMsg(null), 5000);
    }
  };

  const handleLaunchSupervisors = async () => {
    if (!activeProjectId || launching) return;
    setLaunching(true);
    setLaunchMsg(null);
    try {
      const res = await fetch('/api/agents/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, agents: ['supervisor', 'supervisor-2'] }),
      });
      const data = await res.json();
      const launched = (data.results || []).filter((r: { status: string }) => r.status === 'launched').length;
      const running = (data.results || []).filter((r: { status: string }) => r.status === 'already_running').length;
      if (launched > 0) setLaunchMsg(`${launched} Rataa${launched > 1 ? 's' : ''} launched`);
      else if (running > 0) setLaunchMsg('Rataas already running');
      else setLaunchMsg('Launch failed');
    } catch {
      setLaunchMsg('Launch failed');
    } finally {
      setLaunching(false);
      setTimeout(() => setLaunchMsg(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{projectName} Agents</h1>
        <div className="flex items-center gap-3">
          <FloorSelector />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleRefresh}
            title="Refresh agents (auto-refreshes every 5s)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">{activeCount} active</Badge>
            <Badge variant="outline" className="text-[10px]">{offlineCount} idle</Badge>
          </div>
          {supervisorCount < 2 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-[#9333ea] border-[#9333ea]/30 hover:bg-[#9333ea]/10"
              onClick={handleLaunchSupervisors}
              disabled={launching}
            >
              <Eye className="h-3.5 w-3.5" />
              {supervisorCount === 0 ? 'Launch Rataas' : 'Launch Rataa-2'}
            </Button>
          )}
          {offlineCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-[#3dba8a] border-[#3dba8a]/30 hover:bg-[#3dba8a]/10"
              onClick={handleLaunchAll}
              disabled={launching}
            >
              {launching ? (
                <RotateCcw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}
              {launching ? 'Launching...' : 'Respawn All Agents'}
            </Button>
          )}
          {launchMsg && (
            <span className={`text-xs ${launchMsg.includes('launched') || launchMsg.includes('Rataa') ? 'text-[#3dba8a]' : 'text-[#e05252]'}`}>
              {launchMsg}
            </span>
          )}
        </div>
      </div>

      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {activeCount > 0 ? (
              <span className="inline-block h-2 w-2 rounded-full bg-[#0d7a4a] animate-pulse" />
            ) : (
              <span className="inline-block h-2 w-2 rounded-full bg-[#476256]" />
            )}
            {projectName} — Agents {activeCount > 0 ? 'Live' : 'Standby'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-4 overflow-x-auto">
          <div className="max-w-full">
            <PixelOffice agents={agents} projectName={projectName} floorId={viewFloor} />
          </div>
        </CardContent>
      </Card>

      <ErrorBoundary>
        {agents.length === 0 && !activeProjectId ? (
          <SkeletonAgentGrid />
        ) : (
          <AgentGrid />
        )}
      </ErrorBoundary>

      <ErrorBoundary>
        <div className="grid gap-6 lg:grid-cols-2">
          <CommunicationGraph projectId={activeProjectId || ''} />
          <AgentTimeline agents={agents} events={events} />
        </div>
      </ErrorBoundary>
    </div>
  );
}
