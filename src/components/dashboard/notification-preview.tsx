'use client';

import { useEffect, useCallback } from 'react';
import { useNotificationStore, type Notification } from '@/lib/store/notification-store';
import { useProjectStore } from '@/lib/store/project-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';

const TYPE_ICONS: Record<string, string> = {
  heartbeat_lost: '\u{1F494}',
  status_change: '\u{1F504}',
  assignment: '\u{1F4CB}',
  message: '\u{1F4AC}',
  mention: '@',
  review_requested: '\u{1F50D}',
  task_blocked: '\u{1F6AB}',
  pipeline_failed: '\u26A0\uFE0F',
};

function formatTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}

export function NotificationPreview() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const { notifications, unreadCount, setNotifications } = useNotificationStore();

  const fetchNotifications = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/notifications?projectId=${projectId}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications, data.unreadCount);
      }
    } catch { /* ignore */ }
  }, [projectId, setNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" />
          Notifications
          {unreadCount > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[10px] bg-[#a4312f] text-white border-0">
              {unreadCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No notifications</p>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 3).map((n: Notification) => (
              <div key={n.id} className="flex items-start gap-2">
                <span className="text-sm leading-none mt-0.5">
                  {TYPE_ICONS[n.type] || '\u{1F514}'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatTime(n.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
