import { create } from 'zustand';
import type { AgentSnapshot } from '@/lib/types';

interface AgentStore {
  agents: AgentSnapshot[];
  setAgents: (agents: AgentSnapshot[]) => void;
  updateAgent: (agentId: string, updates: Partial<AgentSnapshot>) => void;
  upsertAgent: (agentId: string, data: Partial<AgentSnapshot>) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  setAgents: (agents) => set({ agents }),
  updateAgent: (agentId, updates) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.agentId === agentId ? { ...a, ...updates } : a
      ),
    })),
  upsertAgent: (agentId, data) =>
    set((state) => {
      const exists = state.agents.some((a) => a.agentId === agentId);
      if (exists) {
        return {
          agents: state.agents.map((a) =>
            a.agentId === agentId ? { ...a, ...data } : a
          ),
        };
      }
      // Insert new agent from SSE data
      const newAgent: AgentSnapshot = {
        id: data.id || `${data.projectId || 'unknown'}-${agentId}`,
        projectId: data.projectId || '',
        agentId,
        role: (data.role as AgentSnapshot['role']) || 'coder',
        status: (data.status as AgentSnapshot['status']) || 'working',
        currentTask: data.currentTask,
        model: data.model,
        sessionStart: data.sessionStart || new Date().toISOString(),
        lastHeartbeat: data.lastHeartbeat || new Date().toISOString(),
        lockedFiles: data.lockedFiles || [],
        progress: data.progress || 0,
        estimatedCost: data.estimatedCost || 0,
        createdAt: data.createdAt || new Date().toISOString(),
      };
      return { agents: [...state.agents, newAgent] };
    }),
}));
