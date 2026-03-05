import { OFFICE_CONFIG } from '@/lib/constants';
import type { AgentSnapshot } from '@/lib/types';

type ViewFloor = 'all' | 1 | 2 | 3;

const floorAgentSets = new Map<number, Set<string>>();
for (const [floor, roles] of Object.entries(OFFICE_CONFIG.floorAgents)) {
  floorAgentSets.set(Number(floor), new Set(roles));
}

export function getFloorAgentRoles(floor: 1 | 2 | 3): Set<string> {
  return floorAgentSets.get(floor) ?? new Set();
}

export function getAgentFloor(roleOrId: string): 1 | 2 | 3 | null {
  for (const [floor, roles] of floorAgentSets) {
    if (roles.has(roleOrId)) return floor as 1 | 2 | 3;
  }
  return null;
}

export function filterAgentsByFloor<T extends { role?: string; agentId?: string }>(
  agents: T[],
  floor: ViewFloor,
): T[] {
  if (floor === 'all') return agents;
  const roles = getFloorAgentRoles(floor);
  return agents.filter((a) => roles.has(a.role ?? '') || roles.has(a.agentId ?? ''));
}

export function filterTasksByFloor<T extends { assignedAgent?: string }>(
  tasks: T[],
  floor: ViewFloor,
): T[] {
  if (floor === 'all') return tasks;
  const roles = getFloorAgentRoles(floor);
  return tasks.filter((t) => roles.has(t.assignedAgent ?? ''));
}

export function getFloorLabel(floor: ViewFloor): string {
  if (floor === 'all') return 'All Floors';
  return OFFICE_CONFIG.floors[floor] ?? `Floor ${floor}`;
}
