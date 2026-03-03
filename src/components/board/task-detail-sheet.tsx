'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PriorityBadge } from '@/components/shared/priority-badge';
import { TimeAgo } from '@/components/shared/time-ago';
import { BOARD_COLUMNS, PRIORITY_CONFIG } from '@/lib/constants';
import type { Task, TaskStatus, TaskPriority } from '@/lib/types';
import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

export function TaskDetailSheet({ task, open, onClose, onUpdate, onDelete }: TaskDetailSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
    }
  }, [task]);

  if (!task) return null;

  const tags = Array.isArray(task.tags) ? task.tags : [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[400px] overflow-y-auto sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PriorityBadge priority={task.priority as TaskPriority} />
            <span className="text-muted-foreground">#{task.externalId || task.id.slice(-6)}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== task.title && onUpdate(task.id, { title })}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (task.description || '') && onUpdate(task.id, { description })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={task.status}
                onValueChange={(v) => onUpdate(task.id, { status: v as TaskStatus })}
              >
                <SelectTrigger>
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
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select
                value={task.priority}
                onValueChange={(v) => onUpdate(task.id, { priority: v as TaskPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {key} - {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Assigned Agent</label>
            <Input
              value={task.assignedAgent || ''}
              placeholder="Unassigned"
              onChange={(e) => onUpdate(task.id, { assignedAgent: e.target.value || undefined })}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Tags</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              Source: {task.source} &middot; <TimeAgo date={task.createdAt} />
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete(task.id);
                onClose();
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
