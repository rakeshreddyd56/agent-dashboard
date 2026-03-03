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
  Cell,
} from 'recharts';
import { BOARD_COLUMNS } from '@/lib/constants';
import type { Task } from '@/lib/types';

interface TimeInStatusProps {
  tasks: Task[];
  loading?: boolean;
}

const TICK_STYLE = { fontSize: 10, fill: '#a1a1aa' };
const GRID_COLOR = '#3f3f46';
const AXIS_COLOR = '#71717a';

export function TimeInStatus({ tasks, loading }: TimeInStatusProps) {
  const data = BOARD_COLUMNS.map((col) => ({
    status: col.title,
    count: tasks.filter((t) => t.status === col.id).length,
    fill: col.color,
  }));

  const hasData = data.some((d) => d.count > 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Tasks by Status</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : !hasData ? (
          <div className="flex h-[250px] flex-col items-center justify-center gap-1 text-muted-foreground">
            <p className="text-sm">No tasks yet</p>
            <p className="text-xs">Task status breakdown will appear here</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis
                dataKey="status"
                tick={TICK_STYLE}
                stroke={AXIS_COLOR}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} stroke={AXIS_COLOR} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: 12,
                  color: '#e4e4e7',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#e4e4e7' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="count" name="Tasks" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
