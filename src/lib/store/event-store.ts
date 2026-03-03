import { create } from 'zustand';
import type { DashboardEvent } from '@/lib/types';

interface EventStore {
  events: DashboardEvent[];
  setEvents: (events: DashboardEvent[]) => void;
  addEvent: (event: DashboardEvent) => void;
  clearEvents: () => void;
}

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 1000),
    })),
  clearEvents: () => set({ events: [] }),
}));
