'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProjectStore } from '@/lib/store/project-store';
import { useEventStore } from '@/lib/store/event-store';
import { TimeAgo } from '@/components/shared/time-ago';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, Bug } from 'lucide-react';
import type { EventLevel } from '@/lib/types';

const levelConfig: Record<EventLevel, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  info: { icon: Info, color: 'text-[#5ba3c9]' },
  warning: { icon: AlertTriangle, color: 'text-[#f5b942]' },
  error: { icon: AlertCircle, color: 'text-[#e05252]' },
  success: { icon: CheckCircle2, color: 'text-[#3dba8a]' },
  debug: { icon: Bug, color: 'text-[#7fa393]' },
};

export function RecentActivity() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const storeEvents = useEventStore((s) => s.events);
  const setEvents = useEventStore((s) => s.setEvents);
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

  const events = storeEvents.slice(0, 20);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-4 pb-4">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading events...</p>
          ) : events.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No recent events</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const config = levelConfig[event.level as EventLevel] || levelConfig.info;
                const Icon = config.icon;
                return (
                  <div key={event.id} className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed">{event.message}</p>
                      <div className="flex items-center gap-2">
                        {event.agentId && (
                          <span className="text-[10px] text-muted-foreground">@{event.agentId}</span>
                        )}
                        <TimeAgo date={event.timestamp} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
