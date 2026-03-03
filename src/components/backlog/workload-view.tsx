'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RoleIcon } from '@/components/shared/role-icon';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { AGENT_ROLES } from '@/lib/constants';
import type { Task, TaskPriority, AgentRole } from '@/lib/types';

interface WorkloadViewProps {
  tasks: Task[];
}

export function WorkloadView({ tasks }: WorkloadViewProps) {
  const activeTasks = tasks.filter((t) => t.status !== 'DONE');

  // Group by agent
  const groups: { agent: string; role?: AgentRole; tasks: Task[] }[] = [];

  for (const role of AGENT_ROLES) {
    const agentTasks = activeTasks.filter(
      (t) => t.assignedAgent === role.role || t.assignedAgent === role.label.toLowerCase()
    );
    groups.push({ agent: role.label, role: role.role as AgentRole, tasks: agentTasks });
  }

  const unassigned = activeTasks.filter((t) => !t.assignedAgent);
  groups.push({ agent: 'Unassigned', tasks: unassigned });

  const maxTasks = Math.max(...groups.map((g) => g.tasks.length), 1);

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <Card key={group.agent} className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              {group.role && <RoleIcon role={group.role} className="h-4 w-4" />}
              <span className="text-sm font-medium">{group.agent}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {group.tasks.length}
              </Badge>
            </div>
            <Progress
              value={(group.tasks.length / maxTasks) * 100}
              className="h-1.5 mb-2"
            />
            <div className="flex flex-wrap gap-1">
              {group.tasks.slice(0, 5).map((task) => (
                <Badge key={task.id} variant="outline" className="text-[10px] max-w-[200px] truncate">
                  <PriorityBadge priority={task.priority as TaskPriority} />
                  <span className="ml-1 truncate">{task.title}</span>
                </Badge>
              ))}
              {group.tasks.length > 5 && (
                <Badge variant="outline" className="text-[10px]">
                  +{group.tasks.length - 5}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
