'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AgentSnapshot } from '@/lib/types';

interface TmuxSession {
  name: string;
  windows: number;
  created: string | null;
}

interface UtilizationChartProps {
  agents: AgentSnapshot[];
  tmuxSessions?: TmuxSession[];
  loading?: boolean;
}

const COLORS: Record<string, string> = {
  working: '#4ade80',
  planning: '#60a5fa',
  reviewing: '#c084fc',
  idle: '#fbbf24',
  blocked: '#f87171',
  completed: '#2dd4bf',
  initializing: '#a1a1aa',
  offline: '#71717a',
  'tmux-active': '#34d399',
};

export function UtilizationChart({ agents, tmuxSessions = [], loading }: UtilizationChartProps) {
  const statusCounts: Record<string, number> = {};

  for (const a of agents) {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  }

  if (agents.length === 0 && tmuxSessions.length > 0) {
    statusCounts['tmux-active'] = tmuxSessions.length;
  }

  const data = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const hasData = data.length > 0;
  const totalAgents = agents.length + (agents.length === 0 ? tmuxSessions.length : 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Agent Utilization
          {totalAgents > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {totalAgents} agent{totalAgents !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : !hasData ? (
          <div className="flex h-[250px] flex-col items-center justify-center gap-1 text-muted-foreground">
            <p className="text-sm">No agents detected</p>
            <p className="text-xs">Launch agents from the Mission page or check tmux sessions</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, value }) => `${name}: ${value}`}
                labelLine={{ stroke: '#71717a' }}
                stroke="#27272a"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name] || '#a1a1aa'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: 12,
                  color: '#e4e4e7',
                }}
                itemStyle={{ color: '#e4e4e7' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }}
                formatter={(value) => <span style={{ color: '#d4d4d8' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
