'use client';

import { useEffect, useCallback } from 'react';
import { useNotificationStore, type Notification } from '@/lib/store/notification-store';
import { useProjectStore } from '@/lib/store/project-store';
import { Bell, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

const TYPE_ICONS: Record<string, string> = {
  heartbeat_lost: '💔',
  status_change: '🔄',
  assignment: '📋',
  message: '💬',
  mention: '@',
  review_requested: '🔍',
  task_blocked: '🚫',
  pipeline_failed: '⚠️',
};

function formatTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export function NotificationDropdown() {
  const projectId = useProjectStore((s) => s.activeProjectId);
  const { notifications, unreadCount, setNotifications, markAllRead } = useNotificationStore();

  const fetchNotifications = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/notifications?projectId=${projectId}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications, data.unreadCount);
      }
    } catch { /* ignore */ }
  }, [projectId, setNotifications]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (!projectId) return;
    markAllRead();
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true, projectId }),
      });
    } catch { /* ignore */ }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] bg-[#a4312f] text-white border-0"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleMarkAllRead}>
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.slice(0, 20).map((n: Notification) => (
              <div
                key={n.id}
                className={`px-3 py-2 text-sm ${!n.readAt ? 'bg-accent/30' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none mt-0.5">
                    {TYPE_ICONS[n.type] || '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs">{n.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{n.message}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatTime(n.createdAt)}
                      {n.recipient !== 'all' && ` · ${n.recipient}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
