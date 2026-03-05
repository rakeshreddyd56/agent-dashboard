import { create } from 'zustand';
import type {
  OfficeState, FloorNumber, ResearchSession, OfficeMemoryEntry,
  FloorCommunication, CouncilMember,
} from '@/lib/types';

interface FloorStatus {
  floor: FloorNumber;
  status: 'idle' | 'active' | 'complete';
  label: string;
}

type ViewFloor = 'all' | 1 | 2 | 3;

interface OfficeStore {
  // State
  officeState: OfficeState;
  activeFloor: FloorNumber | null;
  viewFloor: ViewFloor;
  currentSession: ResearchSession | null;
  recentSessions: ResearchSession[];
  floorStatuses: FloorStatus[];
  councilMembers: CouncilMember[];
  communications: FloorCommunication[];
  memoryEntries: OfficeMemoryEntry[];
  isLoading: boolean;

  // Actions
  setOfficeState: (state: OfficeState) => void;
  setActiveFloor: (floor: FloorNumber | null) => void;
  setViewFloor: (floor: ViewFloor) => void;
  setCurrentSession: (session: ResearchSession | null) => void;
  setRecentSessions: (sessions: ResearchSession[]) => void;
  setFloorStatuses: (statuses: FloorStatus[]) => void;
  setCouncilMembers: (members: CouncilMember[]) => void;
  addCommunication: (comm: FloorCommunication) => void;
  setCommunications: (comms: FloorCommunication[]) => void;
  setMemoryEntries: (entries: OfficeMemoryEntry[]) => void;
  setLoading: (loading: boolean) => void;
  updateSession: (id: string, updates: Partial<ResearchSession>) => void;

  // Bulk update from API
  setOfficeData: (data: {
    state?: OfficeState;
    activeFloor?: FloorNumber | null;
    currentSession?: ResearchSession | null;
    recentSessions?: ResearchSession[];
    floorStatuses?: Record<FloorNumber, 'idle' | 'active' | 'complete'>;
    councilMembers?: CouncilMember[];
  }) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  officeState: 'IDLE',
  activeFloor: null,
  viewFloor: 'all' as ViewFloor,
  currentSession: null,
  recentSessions: [],
  floorStatuses: [
    { floor: 1, status: 'idle', label: 'Research & Ideation' },
    { floor: 2, status: 'idle', label: 'Development' },
    { floor: 3, status: 'idle', label: 'CI/CD & Deploy' },
  ],
  councilMembers: [],
  communications: [],
  memoryEntries: [],
  isLoading: false,

  setOfficeState: (officeState) => set({ officeState }),
  setActiveFloor: (activeFloor) => set({ activeFloor }),
  setViewFloor: (viewFloor) => set({ viewFloor }),
  setCurrentSession: (currentSession) => set({ currentSession }),
  setRecentSessions: (recentSessions) => set({ recentSessions }),
  setFloorStatuses: (floorStatuses) => set({ floorStatuses }),
  setCouncilMembers: (councilMembers) => set({ councilMembers }),
  addCommunication: (comm) => set((s) => ({ communications: [comm, ...s.communications] })),
  setCommunications: (communications) => set({ communications }),
  setMemoryEntries: (memoryEntries) => set({ memoryEntries }),
  setLoading: (isLoading) => set({ isLoading }),
  updateSession: (id, updates) => set((s) => ({
    currentSession: s.currentSession?.id === id ? { ...s.currentSession, ...updates } : s.currentSession,
    recentSessions: s.recentSessions.map(sess => sess.id === id ? { ...sess, ...updates } : sess),
  })),

  setOfficeData: (data) => set((s) => ({
    officeState: data.state ?? s.officeState,
    activeFloor: data.activeFloor !== undefined ? data.activeFloor : s.activeFloor,
    currentSession: data.currentSession !== undefined ? data.currentSession : s.currentSession,
    recentSessions: data.recentSessions ?? s.recentSessions,
    floorStatuses: data.floorStatuses ? [
      { floor: 1 as FloorNumber, status: data.floorStatuses[1], label: 'Research & Ideation' },
      { floor: 2 as FloorNumber, status: data.floorStatuses[2], label: 'Development' },
      { floor: 3 as FloorNumber, status: data.floorStatuses[3], label: 'CI/CD & Deploy' },
    ] : s.floorStatuses,
    councilMembers: data.councilMembers ?? s.councilMembers,
  })),
}));
