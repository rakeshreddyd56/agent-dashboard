'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BOARD_COLUMNS } from '@/lib/constants';
import type { Task } from '@/lib/types';

interface DependencyGraphProps {
  tasks: Task[];
}

export function DependencyGraph({ tasks }: DependencyGraphProps) {
  const tasksWithDeps = tasks.filter((t) => {
    const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
    return deps.length > 0;
  });

  if (tasksWithDeps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No task dependencies defined. Add dependencies to tasks to see the dependency graph.
        </p>
      </div>
    );
  }

  const statusColor = (status: string) =>
    BOARD_COLUMNS.find((c) => c.id === status)?.color || '#6b7280';

  return (
    <div className="space-y-3">
      {tasksWithDeps.map((task) => {
        const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
        return (
          <Card key={task.id} className="border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: statusColor(task.status) }}
                />
                <span className="text-sm font-medium">{task.title}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">{task.status}</Badge>
              </div>
              <div className="ml-5 mt-2 space-y-1 border-l border-border/50 pl-3">
                {deps.map((depId) => {
                  const dep = tasks.find((t) => t.externalId === depId || t.id === depId);
                  return (
                    <div key={depId} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>depends on →</span>
                      {dep ? (
                        <span className="flex items-center gap-1">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: statusColor(dep.status) }}
                          />
                          {dep.title}
                        </span>
                      ) : (
                        <span className="italic">{depId} (not found)</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
