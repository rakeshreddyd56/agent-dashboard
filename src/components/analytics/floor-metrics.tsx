'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { FlaskRound, Code, Rocket } from 'lucide-react';
import type { AgentSnapshot } from '@/lib/types';

interface FloorMetricsProps {
  agents: AgentSnapshot[];
  tasksByAgent: Record<string, { total: number; done: number; inProgress: number }>;
  loading?: boolean;
}

const FLOOR_CONFIG = [
  {
    floor: 1,
    label: 'Research',
    icon: FlaskRound,
    color: '#f59e0b',
    roles: ['rataa-research', 'researcher-1', 'researcher-2', 'researcher-3', 'researcher-4'],
  },
  {
    floor: 2,
    label: 'Development',
    icon: Code,
    color: '#6366f1',
    roles: ['rataa-frontend', 'rataa-backend', 'architect', 'frontend', 'backend-1', 'backend-2', 'tester-1', 'tester-2'],
  },
  {
    floor: 3,
    label: 'Ops',
    icon: Rocket,
    color: '#a855f7',
    roles: ['rataa-ops', 'supervisor', 'supervisor-2'],
  },
];

const STATUS_COLORS: Record<string, string> = {
  working: '#4ade80',
  planning: '#60a5fa',
  reviewing: '#c084fc',
  idle: '#fbbf24',
  blocked: '#f87171',
  completed: '#2dd4bf',
  initializing: '#a1a1aa',
  offline: '#71717a',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '8px',
  fontSize: 12,
  color: '#e4e4e7',
};

export function FloorMetrics({ agents, tasksByAgent, loading }: FloorMetricsProps) {
  const floorData = FLOOR_CONFIG.map((fc) => {
    const floorAgents = agents.filter((a) => fc.roles.includes(a.role || a.agentId));
    const active = floorAgents.filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length;
    const total = floorAgents.length;

    // Aggregate tasks for this floor
    let tasksDone = 0;
    let tasksInProgress = 0;
    let tasksTotal = 0;
    for (const role of fc.roles) {
      const t = tasksByAgent[role];
      if (t) {
        tasksDone += t.done;
        tasksInProgress += t.inProgress;
        tasksTotal += t.total;
      }
    }

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    for (const a of floorAgents) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    }

    return {
      ...fc,
      agents: floorAgents,
      active,
      total,
      tasksDone,
      tasksInProgress,
      tasksTotal,
      statusCounts,
    };
  });

  // Chart data for bar chart
  const chartData = floorData.map((f) => ({
    name: f.label,
    active: f.active,
    idle: f.total - f.active,
    tasksDone: f.tasksDone,
    tasksInProgress: f.tasksInProgress,
  }));

  return (
    <Card className="border-border/50 lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Floor Metrics
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            3-floor breakdown
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Floor summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {floorData.map((f) => (
                <div
                  key={f.floor}
                  className="rounded-lg border border-border/50 p-3"
                  style={{ borderLeftColor: f.color, borderLeftWidth: 3 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${f.color}20` }}
                    >
                      <f.icon className="h-3.5 w-3.5" style={{ color: f.color }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">F{f.floor} — {f.label}</p>
                    </div>
                  </div>

                  {/* Agent status dots */}
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {f.agents.length > 0 ? (
                      f.agents.map((a) => (
                        <div
                          key={a.agentId}
                          title={`${a.agentId}: ${a.status}`}
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[a.status] || '#71717a' }}
                        />
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No agents</span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{f.active}</p>
                      <p className="text-[9px] text-muted-foreground">Active</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#2dd4bf' }}>{f.tasksDone}</p>
                      <p className="text-[9px] text-muted-foreground">Done</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#60a5fa' }}>{f.tasksInProgress}</p>
                      <p className="text-[9px] text-muted-foreground">WIP</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bar chart comparing floors */}
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#e4e4e7' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => <span style={{ color: '#d4d4d8' }}>{v}</span>} />
                <Bar dataKey="active" name="Active Agents" fill="#4ade80" radius={[2, 2, 0, 0]} />
                <Bar dataKey="tasksDone" name="Tasks Done" fill="#2dd4bf" radius={[2, 2, 0, 0]} />
                <Bar dataKey="tasksInProgress" name="Tasks WIP" fill="#60a5fa" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
