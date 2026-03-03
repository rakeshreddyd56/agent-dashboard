'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskTable } from '@/components/backlog/task-table';
import { PriorityMatrix } from '@/components/backlog/priority-matrix';
import { WorkloadView } from '@/components/backlog/workload-view';
import { DependencyGraph } from '@/components/backlog/dependency-graph';
import { TimelineView } from '@/components/backlog/timeline-view';
import { useTasks } from '@/lib/hooks/use-tasks';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BOARD_COLUMNS } from '@/lib/constants';
import { List, Grid3X3, Users, GitBranch, GanttChart, Search, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import type { TaskStatus } from '@/lib/types';

export default function BacklogPage() {
  const { tasks, moveTask } = useTasks();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: tasks.length };
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusFilter !== 'ALL') {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.assignedAgent?.toLowerCase().includes(q) ||
          t.externalId?.toLowerCase().includes(q) ||
          (Array.isArray(t.tags) && t.tags.some((tag) => tag.toLowerCase().includes(q)))
      );
    }
    return result;
  }, [tasks, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backlog</h1>
        <Badge variant="secondary" className="text-xs">
          {tasks.length} tasks
        </Badge>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={statusFilter === 'ALL' ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setStatusFilter('ALL')}
        >
          All ({statusCounts.ALL || 0})
        </Button>
        {BOARD_COLUMNS.map((col) => {
          const count = statusCounts[col.id] || 0;
          if (count === 0) return null;
          return (
            <Button
              key={col.id}
              variant={statusFilter === col.id ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setStatusFilter(statusFilter === col.id ? 'ALL' : col.id as TaskStatus)}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
              {col.title} ({count})
            </Button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks, agents, tags..."
          className="h-8 pl-8 pr-8 text-sm"
        />
        {search && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch('')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <ErrorBoundary>
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-3.5 w-3.5" />
            List
          </TabsTrigger>
          <TabsTrigger value="priority" className="gap-1.5">
            <Grid3X3 className="h-3.5 w-3.5" />
            Priority
          </TabsTrigger>
          <TabsTrigger value="workload" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Workload
          </TabsTrigger>
          <TabsTrigger value="deps" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Dependencies
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <GanttChart className="h-3.5 w-3.5" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/50 p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== 'ALL' ? 'No tasks match your filters.' : 'No tasks yet.'}
              </p>
            </div>
          ) : (
            <TaskTable tasks={filtered} onStatusChange={moveTask} />
          )}
        </TabsContent>

        <TabsContent value="priority" className="mt-4">
          <PriorityMatrix tasks={filtered} />
        </TabsContent>

        <TabsContent value="workload" className="mt-4">
          <WorkloadView tasks={filtered} />
        </TabsContent>

        <TabsContent value="deps" className="mt-4">
          <DependencyGraph tasks={filtered} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineView tasks={filtered} />
        </TabsContent>
      </Tabs>
      </ErrorBoundary>
    </div>
  );
}
