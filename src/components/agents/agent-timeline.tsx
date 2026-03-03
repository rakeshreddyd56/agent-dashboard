'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_CONFIG } from '@/lib/constants';
import type { DashboardEvent, AgentSnapshot } from '@/lib/types';

interface AgentTimelineProps {
  agents: AgentSnapshot[];
  events: DashboardEvent[];
}

interface StatusSegment {
  status: string;
  startPct: number;
  widthPct: number;
}

export function AgentTimeline({ agents, events }: AgentTimelineProps) {
  const { agentSegments, timeRange } = useMemo(() => {
    if (events.length === 0 || agents.length === 0) {
      return { agentSegments: new Map<string, StatusSegment[]>(), timeRange: '' };
    }

    const now = Date.now();
    const earliest = Math.min(...events.map((e) => new Date(e.timestamp).getTime()));
    const span = now - earliest || 1;

    const agentSegments = new Map<string, StatusSegment[]>();

    for (const agent of agents) {
      // Find events for this agent mentioning status changes
      const agentEvents = events
        .filter((e) => e.agentId === agent.agentId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const segments: StatusSegment[] = [];

      if (agentEvents.length === 0) {
        // Single segment for current status
        segments.push({
          status: agent.status,
          startPct: 0,
          widthPct: 100,
        });
      } else {
        // Build timeline from events
        let lastTime = earliest;
        let lastStatus = 'offline';

        // Check if there's a session start
        if (agent.sessionStart) {
          lastTime = new Date(agent.sessionStart).getTime();
        }

        for (const evt of agentEvents) {
          const evtTime = new Date(evt.timestamp).getTime();
          const startPct = ((lastTime - earliest) / span) * 100;
          const widthPct = ((evtTime - lastTime) / span) * 100;
          if (widthPct > 0.5) {
            segments.push({ status: lastStatus, startPct, widthPct });
          }
          // Infer status from event level/message
          if (evt.message.includes('offline') || evt.message.includes('heartbeat')) {
            lastStatus = 'offline';
          } else if (evt.level === 'success') {
            lastStatus = 'completed';
          } else if (evt.level === 'warning') {
            lastStatus = 'blocked';
          } else {
            lastStatus = 'working';
          }
          lastTime = evtTime;
        }

        // Final segment to now
        const startPct = ((lastTime - earliest) / span) * 100;
        const widthPct = ((now - lastTime) / span) * 100;
        if (widthPct > 0.5) {
          segments.push({ status: agent.status, startPct, widthPct });
        }
      }

      agentSegments.set(agent.agentId, segments);
    }

    const hours = Math.round(span / 3600_000);
    const timeRange = hours < 1 ? `${Math.round(span / 60_000)}m` : `${hours}h`;

    return { agentSegments, timeRange };
  }, [agents, events]);

  if (agents.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Agent Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No agent data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Agent Timeline</CardTitle>
        <p className="text-[10px] text-muted-foreground">Status history over {timeRange}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 overflow-x-auto">
          {agents.map((agent) => {
            const segments = agentSegments.get(agent.agentId) || [];
            return (
              <div key={agent.agentId} className="flex items-center gap-2">
                <div className="w-20 truncate text-[10px] text-muted-foreground text-right shrink-0">
                  {agent.agentId}
                </div>
                <div className="flex-1 h-4 bg-muted/20 rounded overflow-hidden relative">
                  {segments.map((seg, idx) => {
                    const config = STATUS_CONFIG[seg.status as keyof typeof STATUS_CONFIG];
                    const color = config?.color || '#476256';
                    return (
                      <div
                        key={idx}
                        className="absolute top-0 h-full"
                        style={{
                          left: `${seg.startPct}%`,
                          width: `${seg.widthPct}%`,
                          backgroundColor: color,
                          opacity: 0.7,
                        }}
                        title={`${seg.status} (${Math.round(seg.widthPct)}%)`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Legend */}
          <div className="flex gap-3 mt-2 flex-wrap">
            {(['working', 'planning', 'idle', 'blocked', 'offline'] as const).map((status) => {
              const config = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-[9px] text-muted-foreground">{config.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
