/**
 * Idle Detector — Determines when floors are idle so the next floor can activate.
 */

import { db, schema } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { OFFICE_CONFIG } from '@/lib/constants';
import type { FloorNumber, OfficeState } from '@/lib/types';

// In-memory tracking of when each project's floor first became idle
const idleSinceMap = new Map<string, number>();

function floorKey(projectId: string, floor: FloorNumber): string {
  return `${projectId}:${floor}`;
}

/**
 * Check if all agents on a given floor are completed/offline/idle.
 */
export function isFloorIdle(projectId: string, floor: FloorNumber): boolean {
  const floorAgentRoles = OFFICE_CONFIG.floorAgents[floor] || [];
  if (floorAgentRoles.length === 0) return true;

  const agents = db.select().from(schema.agentSnapshots)
    .where(eq(schema.agentSnapshots.projectId, projectId))
    .all();

  const floorAgents = agents.filter(a => floorAgentRoles.includes(a.role));

  // If no agents registered yet on this floor, it's idle
  if (floorAgents.length === 0) return true;

  const idleStatuses = ['completed', 'offline', 'idle'];
  return floorAgents.every(a => idleStatuses.includes(a.status));
}

/**
 * Check if there are any active tasks on a floor.
 */
export function hasActiveTasks(projectId: string, floor: FloorNumber): boolean {
  const floorAgentRoles = OFFICE_CONFIG.floorAgents[floor] || [];
  const tasks = db.select().from(schema.tasks)
    .where(eq(schema.tasks.projectId, projectId))
    .all();

  return tasks.some(t =>
    ['IN_PROGRESS', 'ASSIGNED'].includes(t.status) &&
    t.assignedAgent &&
    floorAgentRoles.includes(t.assignedAgent)
  );
}

/**
 * Should a floor activate? Floor N activates only when floor N-1 is complete.
 */
export function shouldActivateFloor(projectId: string, floor: FloorNumber): boolean {
  if (floor === 1) {
    // Floor 1 activates when there's no current research session for today
    const today = new Date().toISOString().split('T')[0];
    const session = db.select().from(schema.researchSessions)
      .where(and(
        eq(schema.researchSessions.projectId, projectId),
        eq(schema.researchSessions.date, today),
      ))
      .get();

    return !session || session.state === 'IDLE';
  }

  // Floors 2 and 3: previous floor must be complete
  const prevFloor = (floor - 1) as FloorNumber;
  return isFloorIdle(projectId, prevFloor) && !hasActiveTasks(projectId, prevFloor);
}

/**
 * Get the current state machine position for a project's office.
 */
export function getProjectOfficeState(projectId: string): {
  state: OfficeState;
  activeFloor: FloorNumber | null;
  floorStatuses: Record<FloorNumber, 'idle' | 'active' | 'complete'>;
} {
  const today = new Date().toISOString().split('T')[0];
  const session = db.select().from(schema.researchSessions)
    .where(and(
      eq(schema.researchSessions.projectId, projectId),
      eq(schema.researchSessions.date, today),
    ))
    .get();

  const state = (session?.state as OfficeState) || 'IDLE';

  // Determine active floor based on state
  let activeFloor: FloorNumber | null = null;
  const floor1States: OfficeState[] = ['CLONING', 'ANALYZING', 'RESEARCHING', 'REVIEWING', 'SYNTHESIZING', 'PLANNING'];
  const floor2States: OfficeState[] = ['DELEGATING', 'DEVELOPING', 'TESTING'];
  const floor3States: OfficeState[] = ['BUILDING', 'DEPLOYING'];

  if (floor1States.includes(state)) activeFloor = 1;
  else if (floor2States.includes(state)) activeFloor = 2;
  else if (floor3States.includes(state)) activeFloor = 3;

  const floorStatuses: Record<FloorNumber, 'idle' | 'active' | 'complete'> = {
    1: activeFloor === 1 ? 'active' : (floor2States.includes(state) || floor3States.includes(state) || state === 'COMPLETE') ? 'complete' : 'idle',
    2: activeFloor === 2 ? 'active' : (floor3States.includes(state) || state === 'COMPLETE') ? 'complete' : 'idle',
    3: activeFloor === 3 ? 'active' : state === 'COMPLETE' ? 'complete' : 'idle',
  };

  return { state, activeFloor, floorStatuses };
}
