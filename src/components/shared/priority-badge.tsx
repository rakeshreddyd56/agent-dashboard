import { Badge } from '@/components/ui/badge';
import { PRIORITY_CONFIG } from '@/lib/constants';
import type { TaskPriority } from '@/lib/types';

const FALLBACK = { label: 'Unknown', color: '#476256', bgClass: 'bg-[#476256]/15 text-[#476256]' };

export function PriorityBadge({ priority }: { priority: TaskPriority | string }) {
  const config = PRIORITY_CONFIG[priority as TaskPriority] || FALLBACK;
  return (
    <Badge variant="outline" className={`text-[10px] font-bold ${config.bgClass}`}>
      {priority || '?'}
    </Badge>
  );
}
