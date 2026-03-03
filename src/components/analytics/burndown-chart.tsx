'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { AnalyticsSnapshot } from '@/lib/types';

const TICK_STYLE = { fontSize: 11, fill: '#a1a1aa' };
const GRID_COLOR = '#3f3f46';

interface BurndownChartProps {
  snapshots: AnalyticsSnapshot[];
  totalTasks: number;
  loading?: boolean;
}

export function BurndownChart({ snapshots, totalTasks, loading }: BurndownChartProps) {
  const data: { date: string; remaining: number; ideal: number }[] = [];

  if (snapshots.length > 0) {
    const sorted = [...snapshots].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const days = new Set(sorted.map((s) => s.timestamp.slice(0, 10)));
    const total = totalTasks || sorted[0]?.totalTasks || 1;

    if (days.size <= 1) {
      // Same day — hourly
      const byHour = new Map<string, AnalyticsSnapshot>();
      for (const snap of sorted) {
        const hour = new Date(snap.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        byHour.set(hour, snap);
      }
      const entries = Array.from(byHour.entries());
      for (let i = 0; i < entries.length; i++) {
        const [time, snap] = entries[i];
        data.push({
          date: time,
          remaining: Math.max(0, snap.totalTasks - snap.tasksCompleted),
          ideal: Math.round(total * (1 - (i / Math.max(1, entries.length - 1)))),
        });
      }
    } else {
      // Multiple days
      const byDay = new Map<string, AnalyticsSnapshot>();
      for (const snap of sorted) byDay.set(snap.timestamp.slice(0, 10), snap);
      const dayEntries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-7);
      for (let i = 0; i < dayEntries.length; i++) {
        const [date, snap] = dayEntries[i];
        data.push({
          date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          remaining: Math.max(0, snap.totalTasks - snap.tasksCompleted),
          ideal: Math.round(total * (1 - (i / Math.max(1, dayEntries.length - 1)))),
        });
      }
    }
  }

  // Always add "Now" point
  data.push({ date: 'Now', remaining: totalTasks, ideal: 0 });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Burndown</CardTitle>
        <p className="text-[10px] text-muted-foreground">{totalTasks} tasks remaining</p>
      </CardHeader>
      <CardContent>
        {data.length <= 1 && !loading ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Not enough data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="date" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number | undefined) => [typeof value === 'number' && Number.isFinite(value) ? value : 0]}
              />
              <Area type="monotone" dataKey="ideal" stroke="#4ade80" fill="#4ade80" fillOpacity={0.1} strokeDasharray="5 5" name="Ideal" />
              <Area type="monotone" dataKey="remaining" stroke="#818cf8" fill="#818cf8" fillOpacity={0.2} name="Remaining" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
