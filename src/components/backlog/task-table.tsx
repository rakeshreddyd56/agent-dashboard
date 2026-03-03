'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { TimeAgo } from '@/components/shared/time-ago';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BOARD_COLUMNS } from '@/lib/constants';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';
import { useState } from 'react';

interface TaskTableProps {
  tasks: Task[];
  onStatusChange: (id: string, status: TaskStatus) => void;
}

type SortKey = 'priority' | 'status' | 'title' | 'createdAt';
type SortDir = 'asc' | 'desc';

const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const statusOrder: Record<string, number> = { BACKLOG: 0, TODO: 1, ASSIGNED: 2, IN_PROGRESS: 3, REVIEW: 4, QUALITY_REVIEW: 5, TESTING: 6, FAILED: 7, TESTED: 8, DONE: 9 };

export function TaskTable({ tasks, onStatusChange }: TaskTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'priority':
        cmp = (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0);
        break;
      case 'status':
        cmp = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'createdAt':
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(colKey)}
    >
      {label} {sortKey === colKey && (sortDir === 'asc' ? '↑' : '↓')}
    </TableHead>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader label="Priority" colKey="priority" />
          <SortHeader label="Title" colKey="title" />
          <SortHeader label="Status" colKey="status" />
          <TableHead>Agent</TableHead>
          <TableHead>Tags</TableHead>
          <SortHeader label="Created" colKey="createdAt" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((task) => {
          const tags = Array.isArray(task.tags) ? task.tags : [];
          return (
            <TableRow key={task.id}>
              <TableCell>
                <PriorityBadge priority={task.priority as TaskPriority} />
              </TableCell>
              <TableCell className="max-w-[300px]">
                <span className="text-sm">{task.title}</span>
              </TableCell>
              <TableCell>
                <Select
                  value={task.status}
                  onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}
                >
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_COLUMNS.map((col) => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {task.assignedAgent ? (
                  <Badge variant="secondary" className="text-[10px]">@{task.assignedAgent}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <TimeAgo date={task.createdAt} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
