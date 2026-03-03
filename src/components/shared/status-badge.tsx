import { Badge } from '@/components/ui/badge';
import { STATUS_CONFIG } from '@/lib/constants';
import type { AgentStatus } from '@/lib/types';

const FALLBACK = { label: 'Unknown', color: '#476256', bgClass: 'bg-[#476256]/15 text-[#476256]' };

export function StatusBadge({ status }: { status: AgentStatus | string }) {
  const config = STATUS_CONFIG[status as AgentStatus] || FALLBACK;
  return (
    <Badge variant="outline" className={`text-[10px] ${config.bgClass}`}>
      {config.label}
    </Badge>
  );
}
