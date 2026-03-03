'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardEvent, AgentSnapshot } from '@/lib/types';

interface ActivityHeatmapProps {
  events: DashboardEvent[];
  agents: AgentSnapshot[];
  loading?: boolean;
}

const HOUR_LABELS = ['0', '', '', '3', '', '', '6', '', '', '9', '', '', '12', '', '', '15', '', '', '18', '', '', '21', '', ''];

export function ActivityHeatmap({ events, agents, loading }: ActivityHeatmapProps) {
  const { grid, maxCount, agentIds } = useMemo(() => {
    const agentSet = new Set<string>();
    for (const a of agents) agentSet.add(a.agentId);
    for (const e of events) { if (e.agentId) agentSet.add(e.agentId); }

    const agentIds = Array.from(agentSet).sort();
    const grid: Record<string, number[]> = {};
    let maxCount = 1;

    for (const id of agentIds) {
      grid[id] = new Array(24).fill(0);
    }

    for (const evt of events) {
      if (!evt.agentId || !grid[evt.agentId]) continue;
      const hour = new Date(evt.timestamp).getHours();
      grid[evt.agentId][hour]++;
      if (grid[evt.agentId][hour] > maxCount) maxCount = grid[evt.agentId][hour];
    }

    return { grid, maxCount, agentIds };
  }, [events, agents]);

  if (agentIds.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No agent activity data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Activity Heatmap</CardTitle>
        <p className="text-[10px] text-muted-foreground">Events per agent per hour</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Hour labels */}
          <div className="flex ml-20">
            {HOUR_LABELS.map((h, i) => (
              <div key={i} className="w-5 text-center text-[9px] text-muted-foreground">
                {h}
              </div>
            ))}
          </div>
          {/* Rows */}
          {agentIds.map((agentId) => (
            <div key={agentId} className="flex items-center">
              <div className="w-20 truncate text-[10px] text-muted-foreground pr-2 text-right">
                {agentId}
              </div>
              <div className="flex">
                {grid[agentId].map((count, hour) => {
                  const intensity = count > 0 ? Math.max(0.15, count / maxCount) : 0;
                  return (
                    <div
                      key={hour}
                      className="w-5 h-4 border border-border/20 rounded-[2px] transition-colors"
                      style={{
                        backgroundColor: intensity > 0 ? `rgba(74, 222, 128, ${intensity})` : 'transparent',
                      }}
                      title={`${agentId} at ${hour}:00 — ${count} events`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
