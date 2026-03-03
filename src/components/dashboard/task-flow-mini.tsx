'use client';

import type { Task } from '@/lib/types';
import { BOARD_COLUMNS } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';

interface TaskFlowMiniProps {
  tasks: Task[];
}

export function TaskFlowMini({ tasks }: TaskFlowMiniProps) {
  const total = tasks.length;
  if (total === 0) return null;

  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }

  // Sort by count descending for legend
  const sorted = BOARD_COLUMNS
    .map((col) => ({ ...col, count: counts[col.id] || 0 }))
    .filter((c) => c.count > 0);

  const top3 = sorted.sort((a, b) => b.count - a.count).slice(0, 4);

  return (
    <Card className="border-border/50">
      <CardContent className="py-3 px-4">
        {/* Stacked bar */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
          {BOARD_COLUMNS.map((col) => {
            const count = counts[col.id] || 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <div
                key={col.id}
                style={{ width: `${pct}%`, backgroundColor: col.color }}
                className="h-full transition-all duration-500"
                title={`${col.title}: ${count}`}
              />
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex gap-3 mt-2 flex-wrap">
          {top3.map((col) => (
            <div key={col.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="text-[10px] text-muted-foreground">
                {col.title} ({col.count})
              </span>
            </div>
          ))}
          {total > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {total} total
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
