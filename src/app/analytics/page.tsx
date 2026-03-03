'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { VelocityChart } from '@/components/analytics/velocity-chart';
import { UtilizationChart } from '@/components/analytics/utilization-chart';
import { CostTracker } from '@/components/analytics/cost-tracker';
import { TimeInStatus } from '@/components/analytics/time-in-status';
import { BurndownChart } from '@/components/analytics/burndown-chart';
import { ActivityHeatmap } from '@/components/analytics/activity-heatmap';
import { PipelineStatusPanel } from '@/components/analytics/pipeline-status-panel';
import { QualityGateStats } from '@/components/analytics/quality-gate-stats';
import { useEventStore } from '@/lib/store/event-store';
import { useTaskStore } from '@/lib/store/task-store';
import { useAgentStore } from '@/lib/store/agent-store';
import { useProjectStore } from '@/lib/store/project-store';
import { useAnalyticsStore } from '@/lib/store/analytics-store';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { SkeletonAnalyticsGrid } from '@/components/shared/skeletons';
import type { AnalyticsSnapshot } from '@/lib/types';

interface CostDay {
  date: string;
  cost: number;
  messageCount: number;
  toolCallCount: number;
}

interface TmuxSession {
  name: string;
  windows: number;
  created: string | null;
}

interface AnalyticsResponse {
  snapshots: AnalyticsSnapshot[];
  tasksByStatus: Record<string, number>;
  agentsByStatus: Record<string, number>;
  totalTasks: number;
  totalAgents: number;
  costData: {
    days: CostDay[];
    totalCost: number;
    modelUsage: Record<string, { inputTokens: number; outputTokens: number; costUSD: number }>;
  };
  tmuxSessions: TmuxSession[];
}

const ACTIVE_STATUSES = new Set(['IN_PROGRESS', 'REVIEW', 'TESTING', 'ASSIGNED']);
const REFRESH_INTERVAL_MS = 30_000;

export default function AnalyticsPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const agents = useAgentStore((s) => s.agents);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { stale, markFresh } = useAnalyticsStore();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAnalytics = useCallback(() => {
    if (!activeProjectId) return;
    setLoading(true);
    fetch(`/api/analytics?projectId=${activeProjectId}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        markFresh();
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeProjectId, markFresh]);

  // Initial fetch
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Auto-refresh every 30s when page is visible
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) fetchAnalytics();
    };
    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAnalytics]);

  // Re-fetch when SSE marks data stale
  useEffect(() => {
    if (stale) fetchAnalytics();
  }, [stale, fetchAnalytics]);

  // Velocity: derive from live store data + snapshots
  const velocityData = useMemo(() => {
    const projectTasks = tasks.filter((t) => t.projectId === activeProjectId);
    const snapshots = data?.snapshots || [];

    // Build snapshot-based history
    const snapshotPoints: { date: string; backlog: number; active: number; completed: number; total: number }[] = [];

    if (snapshots.length > 0) {
      const days = new Set(snapshots.map((s) => s.timestamp.slice(0, 10)));

      if (days.size <= 1) {
        // Same day — group by hour
        const byHour = new Map<string, AnalyticsSnapshot>();
        for (const snap of snapshots) {
          const hour = new Date(snap.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          byHour.set(hour, snap);
        }
        const entries = Array.from(byHour.entries());
        const step = Math.max(1, Math.floor(entries.length / 12));
        for (let i = 0; i < entries.length; i++) {
          if (i % step === 0 || i === entries.length - 1) {
            const [time, snap] = entries[i];
            const active = snap.tasksInProgress;
            const completed = snap.tasksCompleted;
            const total = snap.totalTasks;
            snapshotPoints.push({
              date: time,
              backlog: Math.max(0, total - active - completed),
              active,
              completed,
              total,
            });
          }
        }
      } else {
        // Multiple days — group by day
        const byDay = new Map<string, AnalyticsSnapshot>();
        for (const snap of snapshots) {
          byDay.set(snap.timestamp.slice(0, 10), snap);
        }
        const sorted = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-7);
        for (const [date, snap] of sorted) {
          const active = snap.tasksInProgress;
          const completed = snap.tasksCompleted;
          const total = snap.totalTasks;
          snapshotPoints.push({
            date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            backlog: Math.max(0, total - active - completed),
            active,
            completed,
            total,
          });
        }
      }
    }

    // Always add live "Now" point from store
    const completed = projectTasks.filter((t) => t.status === 'DONE').length;
    const active = projectTasks.filter((t) => ACTIVE_STATUSES.has(t.status)).length;
    const total = projectTasks.length;
    const backlog = Math.max(0, total - active - completed);

    const nowPoint = { date: 'Now', backlog, active, completed, total };

    // If snapshot points exist and the last one is basically the same as Now, replace it
    if (snapshotPoints.length > 0) {
      const last = snapshotPoints[snapshotPoints.length - 1];
      if (last.total === nowPoint.total && last.completed === nowPoint.completed && last.active === nowPoint.active) {
        // Same data, skip adding Now
        return snapshotPoints;
      }
      return [...snapshotPoints, nowPoint];
    }

    return [nowPoint];
  }, [data?.snapshots, tasks, activeProjectId]);

  // Cost: use real stats-cache data, fall back to snapshot estimatedCost
  const costData = useMemo(() => {
    const statsDays = data?.costData?.days || [];

    if (statsDays.length > 0) {
      return statsDays.slice(-14).map((d) => ({
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cost: d.cost,
      }));
    }

    const snapshots = data?.snapshots || [];
    if (snapshots.length === 0) return [];

    const byDay = new Map<string, number>();
    for (const snap of snapshots) {
      const day = snap.timestamp.slice(0, 10);
      byDay.set(day, snap.estimatedCost);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, cost]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cost: Math.round(cost * 100) / 100,
      }));
  }, [data]);

  const totalCostLabel = data?.costData?.totalCost
    ? `$${data.costData.totalCost.toFixed(2)} total`
    : undefined;

  const tmuxSessions = data?.tmuxSessions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Button variant="ghost" size="sm" onClick={fetchAnalytics} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {!data && loading ? (
        <SkeletonAnalyticsGrid />
      ) : (
        <ErrorBoundary>
          <div className="grid gap-6 lg:grid-cols-2">
            <VelocityChart data={velocityData} loading={loading} />
            <BurndownChart snapshots={data?.snapshots || []} totalTasks={tasks.filter((t) => t.projectId === activeProjectId).length} loading={loading} />
            <UtilizationChart agents={agents} tmuxSessions={tmuxSessions} loading={loading} />
            <ActivityHeatmap events={useEventStore.getState().events} agents={agents} loading={loading} />
            <TimeInStatus tasks={tasks.filter((t) => t.projectId === activeProjectId)} loading={loading} />
            <QualityGateStats projectId={activeProjectId || ''} loading={loading} />
            <CostTracker data={costData} subtitle={totalCostLabel} loading={loading} />
            <PipelineStatusPanel projectId={activeProjectId || ''} loading={loading} />
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
