'use client';

import { useOfficeStore } from '@/lib/store/office-store';
import { cn } from '@/lib/utils';

type ViewFloor = 'all' | 1 | 2 | 3;

const FLOOR_OPTIONS: { value: ViewFloor; label: string; color: string }[] = [
  { value: 'all', label: 'All Floors', color: '#6366f1' },
  { value: 1, label: 'F1: Research', color: '#f59e0b' },
  { value: 2, label: 'F2: Dev', color: '#3b82f6' },
  { value: 3, label: 'F3: Ops', color: '#a855f7' },
];

export function FloorSelector() {
  const viewFloor = useOfficeStore((s) => s.viewFloor);
  const setViewFloor = useOfficeStore((s) => s.setViewFloor);

  return (
    <div className="inline-flex items-center rounded-lg border border-border/50 bg-card p-0.5 gap-0.5">
      {FLOOR_OPTIONS.map((opt) => {
        const isActive = viewFloor === opt.value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => setViewFloor(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              isActive
                ? 'text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
            )}
            style={isActive ? { backgroundColor: opt.color } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
