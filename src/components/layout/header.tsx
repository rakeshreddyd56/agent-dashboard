'use client';

import { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Circle } from 'lucide-react';
import { getSSEState, onSSEStateChange } from './sse-provider';
import { NotificationDropdown } from '@/components/notifications/notification-dropdown';
import { MessagePanel } from '@/components/messages/message-panel';

const STATE_STYLES = {
  connected: { color: '#0d7a4a', label: 'Connected' },
  connecting: { color: '#8d5a0f', label: 'Connecting...' },
  disconnected: { color: '#a4312f', label: 'Disconnected' },
} as const;

export function Header() {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const [sseState, setSSEState] = useState(getSSEState());

  useEffect(() => {
    return onSSEStateChange(setSSEState);
  }, []);

  const style = STATE_STYLES[sseState];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <Select value={activeProjectId || ''} onValueChange={setActiveProject}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  {p.isDemo && <Badge variant="outline" className="text-[10px] px-1 py-0">Demo</Badge>}
                  {p.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <MessagePanel />
        <NotificationDropdown />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Circle className={`h-2 w-2`} style={{ fill: style.color, color: style.color }} />
          <span>{style.label}</span>
        </div>
      </div>
    </header>
  );
}
