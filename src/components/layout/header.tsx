'use client';

import { useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/lib/store/project-store';
import { useAgentStore } from '@/lib/store/agent-store';
import { useTaskStore } from '@/lib/store/task-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Circle, RefreshCw } from 'lucide-react';
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
  const setAgents = useAgentStore((s) => s.setAgents);
  const setTasks = useTaskStore((s) => s.setTasks);
  const [sseState, setSSEState] = useState(getSSEState());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    return onSSEStateChange(setSSEState);
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing || !activeProjectId) return;
    setSyncing(true);
    try {
      const [agentRes, taskRes] = await Promise.all([
        fetch(`/api/agents?projectId=${activeProjectId}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/tasks?projectId=${activeProjectId}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/events?projectId=${activeProjectId}&mode=json`).then((r) => r.ok ? r.json() : null),
      ]);
      if (agentRes?.agents) setAgents(agentRes.agents);
      if (taskRes?.tasks) setTasks(taskRes.tasks);
      window.dispatchEvent(new Event('dashboard-sync'));
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [syncing, activeProjectId, setAgents, setTasks]);

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
        <button
          onClick={handleSync}
          disabled={syncing || !activeProjectId}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          title="Sync dashboard data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Circle className={`h-2 w-2`} style={{ fill: style.color, color: style.color }} />
          <span>{style.label}</span>
        </div>
      </div>
    </header>
  );
}
