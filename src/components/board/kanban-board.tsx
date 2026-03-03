'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { BoardColumn } from './board-column';
import { TaskCard } from './task-card';
import { TaskDetailSheet } from './task-detail-sheet';
import { CreateTaskDialog } from './create-task-dialog';
import { useTasks } from '@/lib/hooks/use-tasks';
import { BOARD_COLUMNS } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { Task, TaskStatus } from '@/lib/types';

export function KanbanBoard() {
  const { tasks, moveTask, patchTask, createTask, deleteTask } = useTasks();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filteredTasks = tasks.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.assignedAgent?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = (event.active.data.current as { task: Task })?.task;
    if (task) setActiveTask(task);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const overId = over.id as string;

      // Check if dropped on a column
      const isColumn = BOARD_COLUMNS.some((c) => c.id === overId);
      if (isColumn) {
        moveTask(taskId, overId as TaskStatus);
      } else {
        // Dropped on another card — find the target task's column and order
        const targetTask = tasks.find((t) => t.id === overId);
        if (targetTask) {
          moveTask(taskId, targetTask.status, targetTask.columnOrder);
        }
      }
    },
    [moveTask, tasks]
  );

  const handleUpdate = useCallback(
    (id: string, updates: Partial<Task>) => {
      patchTask(id, updates);
      if (selectedTask?.id === id) {
        setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);
      }
    },
    [patchTask, selectedTask]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-[250px] pl-9"
          />
        </div>
        <CreateTaskDialog onCreate={createTask} />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((column) => {
            const columnTasks = filteredTasks
              .filter((t) => t.status === column.id)
              .sort((a, b) => (a.columnOrder || 0) - (b.columnOrder || 0));

            return (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={columnTasks}
                onTaskClick={setSelectedTask}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} onClick={() => {}} />}
        </DragOverlay>
      </DndContext>

      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdate}
        onDelete={deleteTask}
      />
    </div>
  );
}
