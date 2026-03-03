'use client';

import { KanbanBoard } from '@/components/board/kanban-board';

export default function BoardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Board</h1>
      <KanbanBoard />
    </div>
  );
}
