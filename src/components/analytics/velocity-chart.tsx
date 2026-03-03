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

interface VelocityDataPoint {
  date: string;
  backlog: number;
  active: number;
  completed: number;
  total: number;
}

interface VelocityChartProps {
  data: VelocityDataPoint[];
  loading?: boolean;
}

const TICK_STYLE = { fontSize: 11, fill: '#a1a1aa' };
const GRID_COLOR = '#3f3f46';
const AXIS_COLOR = '#71717a';

export function VelocityChart({ data, loading }: VelocityChartProps) {
  const hasData = data.length > 0 && data.some((d) => d.total > 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Task Velocity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : !hasData ? (
          <div className="flex h-[250px] flex-col items-center justify-center gap-1 text-muted-foreground">
            <p className="text-sm">No tasks yet</p>
            <p className="text-xs">Task breakdown will appear here as tasks are created</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="date" tick={TICK_STYLE} stroke={AXIS_COLOR} />
              <YAxis tick={TICK_STYLE} stroke={AXIS_COLOR} allowDecimals={false} />
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
                formatter={(value: number | undefined) => [typeof value === 'number' && Number.isFinite(value) ? value : 0]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
              <Bar dataKey="completed" stackId="tasks" fill="#4ade80" name="Done" radius={[0, 0, 0, 0]} />
              <Bar dataKey="active" stackId="tasks" fill="#fbbf24" name="Active" radius={[0, 0, 0, 0]} />
              <Bar dataKey="backlog" stackId="tasks" fill="#818cf8" name="Backlog" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
