import { create } from 'zustand';

interface AnalyticsStore {
  stale: boolean;
  lastFetch: number;
  markStale: () => void;
  markFresh: () => void;
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  stale: false,
  lastFetch: 0,
  markStale: () => set({ stale: true }),
  markFresh: () => set({ stale: false, lastFetch: Date.now() }),
}));
