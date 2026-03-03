'use client';

import { cn } from '@/lib/utils';
import type { HeartbeatStatus } from '@/lib/hooks/use-agents';

/* Moltbook freshness semantics: healthy=fresh, warning=re-verify soon, stale=expired */
const statusStyles: Record<HeartbeatStatus, { dot: string; pulse: string; label: string }> = {
  healthy: { dot: 'bg-[#0d7a4a]', pulse: 'animate-pulse bg-[#3dba8a]', label: 'Fresh' },
  warning: { dot: 'bg-[#8d5a0f]', pulse: '', label: 'Drifting' },
  stale: { dot: 'bg-[#a4312f]', pulse: '', label: 'Expired' },
  unknown: { dot: 'bg-[#476256]', pulse: '', label: 'Unknown' },
};

export function HeartbeatIndicator({ status }: { status: HeartbeatStatus }) {
  const config = statusStyles[status];
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <div className={cn('h-2 w-2 rounded-full', config.dot)} />
        {config.pulse && (
          <div className={cn('absolute inset-0 h-2 w-2 rounded-full opacity-75', config.pulse)} />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground">{config.label}</span>
    </div>
  );
}
