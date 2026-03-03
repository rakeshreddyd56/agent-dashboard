'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import type { Task, TaskPriority } from '@/lib/types';

interface PriorityMatrixProps {
  tasks: Task[];
}

export function PriorityMatrix({ tasks }: PriorityMatrixProps) {
  // Eisenhower-style: P0=urgent+important, P1=important, P2=urgent, P3=neither
  const quadrants = [
    { label: 'Critical (P0)', priorities: ['P0'] as TaskPriority[], color: 'border-[#a4312f]/30 bg-[#a4312f]/5' },
    { label: 'High (P1)', priorities: ['P1'] as TaskPriority[], color: 'border-[#8d5a0f]/30 bg-[#8d5a0f]/5' },
    { label: 'Medium (P2)', priorities: ['P2'] as TaskPriority[], color: 'border-[#24556f]/30 bg-[#24556f]/5' },
    { label: 'Low (P3)', priorities: ['P3'] as TaskPriority[], color: 'border-[#7fa393]/30 bg-[#7fa393]/5' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {quadrants.map((q) => {
        const quadrantTasks = tasks.filter((t) =>
          q.priorities.includes(t.priority as TaskPriority) && t.status !== 'DONE'
        );
        return (
          <Card key={q.label} className={`border ${q.color}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                {q.label}
                <Badge variant="secondary" className="text-[10px]">{quadrantTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {quadrantTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tasks</p>
                ) : (
                  quadrantTasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="flex items-center gap-2 text-xs">
                      <PriorityBadge priority={task.priority as TaskPriority} />
                      <span className="truncate">{task.title}</span>
                    </div>
                  ))
                )}
                {quadrantTasks.length > 8 && (
                  <p className="text-[10px] text-muted-foreground">+{quadrantTasks.length - 8} more</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
