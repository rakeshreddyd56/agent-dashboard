'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { Badge } from '@/components/ui/badge';
import { GripVertical } from 'lucide-react';
import { useAgentStore } from '@/lib/store/agent-store';
import type { Task, TaskPriority } from '@/lib/types';

function AgentActivityDot({ agentId, taskId }: { agentId: string; taskId: string }) {
  const agent = useAgentStore((s) => s.agents.find((a) => a.agentId === agentId));
  const isActive =
    agent &&
    ['working', 'planning', 'reviewing'].includes(agent.status) &&
    agent.currentTask?.includes(taskId);
  if (!isActive) return null;
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-[#0d7a4a] animate-pulse"
      title={`${agentId} is actively working`}
    />
  );
}

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const tags = Array.isArray(task.tags) ? task.tags : [];

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-pointer border-border/50 p-3 transition-colors hover:border-border"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <PriorityBadge priority={task.priority as TaskPriority} />
            {task.externalId && (
              <span className="text-[10px] text-muted-foreground">
                #{task.externalId}
              </span>
            )}
            {task.status === 'QUALITY_REVIEW' && (
              <Badge variant="outline" className="text-[10px] border-[#8d5a0f] text-[#f5b942]">
                QA Gate
              </Badge>
            )}
            {task.id.includes('-pipeline-') && (
              <Badge variant="outline" className="text-[10px] border-[#5ba3c9] text-[#5ba3c9]">
                Pipeline
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium leading-tight">{task.title}</p>
          <div className="flex flex-wrap items-center gap-1">
            {task.assignedAgent && (
              <AgentActivityDot agentId={task.assignedAgent} taskId={task.id} />
            )}
            {task.assignedAgent && (
              <Badge variant="secondary" className="text-[10px]">
                @{task.assignedAgent}
              </Badge>
            )}
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
