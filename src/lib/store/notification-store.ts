import { create } from 'zustand';

export interface Notification {
  id: string;
  projectId: string;
  recipient: string;
  type: string;
  title: string;
  message: string;
  sourceType?: string;
  sourceId?: string;
  readAt?: string;
  createdAt: string;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[], unreadCount: number) => void;
  addNotification: (notification: Notification) => void;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),

  addNotification: (notification) => set((state) => ({
    notifications: [notification, ...state.notifications].slice(0, 100),
    unreadCount: state.unreadCount + 1,
  })),

  markRead: (ids) => set((state) => {
    const idSet = new Set(ids);
    const notifications = state.notifications.map((n) =>
      idSet.has(n.id) ? { ...n, readAt: new Date().toISOString() } : n
    );
    const unreadCount = notifications.filter((n) => !n.readAt).length;
    return { notifications, unreadCount };
  }),

  markAllRead: () => set((state) => ({
    notifications: state.notifications.map((n) => ({
      ...n,
      readAt: n.readAt || new Date().toISOString(),
    })),
    unreadCount: 0,
  })),
}));
