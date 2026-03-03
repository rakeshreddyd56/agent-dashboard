'use client';

import { useCallback } from 'react';
import { useTaskStore } from '@/lib/store/task-store';
import { useProjectStore } from '@/lib/store/project-store';
import type { Task, TaskStatus, TaskPriority } from '@/lib/types';

export function useTasks() {
  const { tasks, setTasks, updateTask, addTask, removeTask } = useTaskStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const fetchTasks = useCallback(async () => {
    if (!activeProjectId) return;
    const res = await fetch(`/api/tasks?projectId=${activeProjectId}`);
    const data = await res.json();
    if (data.tasks) setTasks(data.tasks);
  }, [activeProjectId, setTasks]);

  const createTask = useCallback(
    async (task: {
      title: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assignedAgent?: string;
      tags?: string[];
      effort?: string;
    }) => {
      if (!activeProjectId) return;
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, projectId: activeProjectId }),
      });
      const data = await res.json();
      addTask(data);
      return data;
    },
    [activeProjectId, addTask]
  );

  const moveTask = useCallback(
    async (taskId: string, newStatus: TaskStatus, newOrder?: number) => {
      // If no order specified, place at end of column
      let order = newOrder;
      if (order === undefined) {
        const currentTasks = useTaskStore.getState().tasks;
        const columnTasks = currentTasks.filter(
          (t) => t.status === newStatus && t.projectId === activeProjectId && t.id !== taskId
        );
        const maxOrder = columnTasks.reduce((max, t) => Math.max(max, t.columnOrder || 0), -1);
        order = maxOrder + 1;
      }
      updateTask(taskId, { status: newStatus, columnOrder: order });
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus, columnOrder: order }),
      });
    },
    [updateTask, activeProjectId]
  );

  const patchTask = useCallback(
    async (taskId: string, updates: Partial<Task>) => {
      updateTask(taskId, updates);
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, ...updates }),
      });
    },
    [updateTask]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      removeTask(taskId);
      await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' });
    },
    [removeTask]
  );

  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId);

  return {
    tasks: projectTasks,
    fetchTasks,
    createTask,
    moveTask,
    patchTask,
    deleteTask,
  };
}
