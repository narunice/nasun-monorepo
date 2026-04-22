import { create } from 'zustand';

export type NotificationType = 'mission' | 'governance';

export interface UjuNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string; // internal paths only (must start with '/')
}

const MAX_NOTIFICATIONS = 50;

interface NotificationStore {
  notifications: UjuNotification[];
  add: (notif: UjuNotification) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  add: (notif) =>
    set((s) => {
      if (s.notifications.some((n) => n.id === notif.id)) return s;
      // Reject non-internal URLs — also blocks protocol-relative //evil.com paths (OWASP A03)
      if (notif.actionUrl !== undefined && !/^\/(?![/\\])/.test(notif.actionUrl)) return s;
      return { notifications: [notif, ...s.notifications].slice(0, MAX_NOTIFICATIONS) };
    }),

  markAllRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  dismiss: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  clearAll: () => set({ notifications: [] }),
}));
