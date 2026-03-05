'use client';

import type { OfficeState } from '@/lib/types';

interface OfficeStatusBadgeProps {
  state: OfficeState;
  compact?: boolean;
}

const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  IDLE: { bg: 'bg-muted', text: 'text-muted-foreground' },
  CLONING: { bg: 'bg-[#6366f1]/15', text: 'text-[#6366f1]' },
  ANALYZING: { bg: 'bg-[#6366f1]/15', text: 'text-[#6366f1]' },
  RESEARCHING: { bg: 'bg-[#6366f1]/15', text: 'text-[#6366f1]' },
  REVIEWING: { bg: 'bg-[#f59e0b]/15', text: 'text-[#f59e0b]' },
  SYNTHESIZING: { bg: 'bg-[#6366f1]/15', text: 'text-[#6366f1]' },
  PLANNING: { bg: 'bg-[#0891b2]/15', text: 'text-[#0891b2]' },
  DELEGATING: { bg: 'bg-[#0891b2]/15', text: 'text-[#0891b2]' },
  DEVELOPING: { bg: 'bg-[#0891b2]/15', text: 'text-[#0891b2]' },
  TESTING: { bg: 'bg-[#10b981]/15', text: 'text-[#10b981]' },
  BUILDING: { bg: 'bg-[#a855f7]/15', text: 'text-[#a855f7]' },
  DEPLOYING: { bg: 'bg-[#a855f7]/15', text: 'text-[#a855f7]' },
  COMPLETE: { bg: 'bg-[#0d7a4a]/15', text: 'text-[#3dba8a]' },
};

export function OfficeStatusBadge({ state, compact }: OfficeStatusBadgeProps) {
  const colors = STATE_COLORS[state] || STATE_COLORS.IDLE;

  return (
    <span className={`${colors.bg} ${colors.text} px-2 py-0.5 rounded-full text-xs font-medium ${compact ? 'text-[10px]' : ''}`}>
      {state}
    </span>
  );
}
