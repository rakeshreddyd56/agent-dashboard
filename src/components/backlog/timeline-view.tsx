'use client';

import { Badge } from '@/components/ui/badge';
import { BOARD_COLUMNS, AGENT_ROLES } from '@/lib/constants';
import type { Task } from '@/lib/types';

interface TimelineViewProps {
  tasks: Task[];
}

export function TimelineView({ tasks }: TimelineViewProps) {
  // Group tasks by agent, show as horizontal bars
  const agents = [...new Set(tasks.map((t) => t.assignedAgent || 'Unassigned'))];

  const statusColor = (status: string) =>
    BOARD_COLUMNS.find((c) => c.id === status)?.color || '#6b7280';

  return (
    <div className="space-y-4">
      {agents.map((agent) => {
        const agentTasks = tasks.filter((t) => (t.assignedAgent || 'Unassigned') === agent);
        const roleDef = AGENT_ROLES.find((r) => r.role === agent);
        return (
          <div key={agent}>
            <p className="mb-1.5 text-sm font-medium">{roleDef?.label || agent}</p>
            <div className="flex flex-wrap gap-1.5">
              {agentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1"
                  style={{ borderLeftColor: statusColor(task.status), borderLeftWidth: 3 }}
                >
                  <span className="text-xs truncate max-w-[200px]">{task.title}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {task.status}
                  </Badge>
                </div>
              ))}
              {agentTasks.length === 0 && (
                <span className="text-xs text-muted-foreground">No tasks</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
