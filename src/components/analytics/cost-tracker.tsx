'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CostTrackerProps {
  data: { date: string; cost: number }[];
  subtitle?: string;
  loading?: boolean;
}

const TICK_STYLE = { fontSize: 11, fill: '#a1a1aa' };
const GRID_COLOR = '#3f3f46';
const AXIS_COLOR = '#71717a';

export function CostTracker({ data, subtitle, loading }: CostTrackerProps) {
  const hasData = data.length > 0 && data.some((d) => d.cost > 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Estimated Cost Over Time</CardTitle>
        {subtitle && <CardDescription className="text-xs">{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[250px] items-center justify-center text-xs text-muted-foreground">
            Loading...
          </div>
        ) : !hasData ? (
          <div className="flex h-[250px] flex-col items-center justify-center gap-1 text-muted-foreground">
            <p className="text-sm">No cost data available</p>
            <p className="text-xs">Cost tracking from ~/.claude/stats-cache.json will appear here</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="date" tick={TICK_STYLE} stroke={AXIS_COLOR} />
              <YAxis
                tick={TICK_STYLE}
                stroke={AXIS_COLOR}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  fontSize: 12,
                  color: '#e4e4e7',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(value) => [`$${Number(value || 0).toFixed(2)}`, 'Cost']}
                itemStyle={{ color: '#c084fc' }}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#c084fc"
                strokeWidth={2}
                dot={{ r: 4, fill: '#c084fc', stroke: '#18181b', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#c084fc', stroke: '#e4e4e7', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
