'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimeAgo } from '@/components/shared/time-ago';
import { useProjectStore } from '@/lib/store/project-store';
import { useEventStore } from '@/lib/store/event-store';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, Bug, Search } from 'lucide-react';
import type { DashboardEvent, EventLevel } from '@/lib/types';

const levelIcons: Record<EventLevel, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
  debug: Bug,
};

const levelColors: Record<EventLevel, string> = {
  info: 'text-[#5ba3c9]',
  warning: 'text-[#f5b942]',
  error: 'text-[#e05252]',
  success: 'text-[#3dba8a]',
  debug: 'text-[#7fa393]',
};

export function EventStream() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { events, setEvents } = useEventStore();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProjectId) return;
    fetch(`/api/events?projectId=${activeProjectId}&mode=json`)
      .then((r) => r.json())
      .then((data) => {
        if (data.events) setEvents(data.events);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProjectId, setEvents]);

  const agents = useMemo(
    () => [...new Set(events.filter((e) => e.agentId).map((e) => e.agentId!))],
    [events]
  );

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (levelFilter !== 'all' && e.level !== levelFilter) return false;
      if (agentFilter !== 'all' && e.agentId !== agentFilter) return false;
      if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [events, levelFilter, agentFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="pl-9"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="h-[600px]">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading events...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No events match your filters</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((event) => {
              const Icon = levelIcons[event.level as EventLevel] || Info;
              const color = levelColors[event.level as EventLevel] || 'text-[#7fa393]';
              return (
                <Card key={event.id} className="border-border/30">
                  <CardContent className="flex items-start gap-3 p-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{event.message}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {event.agentId && (
                          <Badge variant="secondary" className="text-[10px]">@{event.agentId}</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{event.level}</Badge>
                        <TimeAgo date={event.timestamp} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
