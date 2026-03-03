'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './task-card';
import { Badge } from '@/components/ui/badge';
import type { Task, BoardColumn as BoardColumnType } from '@/lib/types';

interface BoardColumnProps {
  column: BoardColumnType;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function BoardColumn({ column, tasks, onTaskClick }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      className={`flex min-h-[400px] w-[280px] shrink-0 flex-col rounded-lg border transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-card/50'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border/50 p-3">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />
        <span className="text-sm font-medium">{column.title}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {tasks.length}
        </Badge>
      </div>

      <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto p-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
