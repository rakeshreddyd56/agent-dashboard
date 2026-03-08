/**
 * Spatial State Mapping — Maps agent DB status to office floor positions.
 *
 * Provides a single source of truth for where each agent is in the 3-floor
 * office visualization, what they're doing, and their visual state.
 */

import type { AgentStatus, FloorNumber } from '@/lib/types';

export type SpatialActivity = 'idle' | 'working' | 'reviewing' | 'blocked' | 'offline' | 'done';

export interface AgentSpatialState {
  role: string;
  floor: FloorNumber;
  activity: SpatialActivity;
  label: string;
  character: string;
  currentTask: string | null;
  /** Position hint within the floor (0.0–1.0 x/y grid) */
  position: { x: number; y: number };
}

export interface FloorSpatialState {
  floor: FloorNumber;
  label: string;
  activeCount: number;
  totalCount: number;
  agents: AgentSpatialState[];
}

// Agent definitions — role → floor, label, character, default position
const AGENT_DEFS: {
  role: string;
  floor: FloorNumber;
  label: string;
  character: string;
  defaultPos: { x: number; y: number };
}[] = [
  // Floor 1 — Research
  { role: 'rataa-research', floor: 1, label: 'Robin', character: 'Research Lead', defaultPos: { x: 0.5, y: 0.2 } },
  { role: 'researcher-1', floor: 1, label: 'Chopper', character: 'Chairman', defaultPos: { x: 0.2, y: 0.6 } },
  { role: 'researcher-2', floor: 1, label: 'Brook', character: 'Analyst', defaultPos: { x: 0.4, y: 0.6 } },
  { role: 'researcher-3', floor: 1, label: 'Jinbe', character: 'Analyst', defaultPos: { x: 0.6, y: 0.6 } },
  { role: 'researcher-4', floor: 1, label: 'Carrot', character: 'Analyst', defaultPos: { x: 0.8, y: 0.6 } },
  // Floor 2 — Development
  { role: 'rataa-frontend', floor: 2, label: 'Nami', character: 'Frontend Lead', defaultPos: { x: 0.2, y: 0.2 } },
  { role: 'rataa-backend', floor: 2, label: 'Franky', character: 'Backend Lead', defaultPos: { x: 0.8, y: 0.2 } },
  { role: 'architect', floor: 2, label: 'Usopp', character: 'Architect', defaultPos: { x: 0.5, y: 0.1 } },
  { role: 'frontend', floor: 2, label: 'Sanji', character: 'Frontend Dev', defaultPos: { x: 0.3, y: 0.5 } },
  { role: 'backend-1', floor: 2, label: 'Zoro', character: 'Backend Dev', defaultPos: { x: 0.7, y: 0.5 } },
  { role: 'backend-2', floor: 2, label: 'Law', character: 'Backend Dev', defaultPos: { x: 0.8, y: 0.5 } },
  { role: 'tester-1', floor: 2, label: 'Smoker', character: 'Tester', defaultPos: { x: 0.4, y: 0.8 } },
  { role: 'tester-2', floor: 2, label: 'Tashigi', character: 'Tester', defaultPos: { x: 0.6, y: 0.8 } },
  // Floor 3 — Ops
  { role: 'rataa-ops', floor: 3, label: 'Luffy', character: 'Ops Captain', defaultPos: { x: 0.5, y: 0.3 } },
  { role: 'supervisor', floor: 3, label: 'Rataa-1', character: 'Supervisor', defaultPos: { x: 0.3, y: 0.7 } },
  { role: 'supervisor-2', floor: 3, label: 'Rataa-2', character: 'Quality', defaultPos: { x: 0.7, y: 0.7 } },
];

// Map DB status → spatial activity
function statusToActivity(status: AgentStatus | string): SpatialActivity {
  switch (status) {
    case 'working': case 'planning': return 'working';
    case 'reviewing': return 'reviewing';
    case 'blocked': return 'blocked';
    case 'completed': return 'done';
    case 'idle': return 'idle';
    case 'initializing': return 'working';
    case 'offline': default: return 'offline';
  }
}

// Shift position based on activity (working agents move to their workspace)
function activityPosition(
  defaultPos: { x: number; y: number },
  activity: SpatialActivity,
): { x: number; y: number } {
  switch (activity) {
    case 'working': return defaultPos;
    case 'reviewing': return { x: Math.min(defaultPos.x + 0.05, 0.95), y: defaultPos.y };
    case 'blocked': return { x: defaultPos.x, y: Math.min(defaultPos.y + 0.1, 0.95) };
    case 'idle': return { x: defaultPos.x, y: Math.max(defaultPos.y - 0.05, 0.05) };
    case 'done': return { x: 0.95, y: 0.95 }; // Exit zone
    case 'offline': return { x: 0.05, y: 0.95 }; // Off-screen corner
    default: return defaultPos;
  }
}

/**
 * Build full spatial state from agent DB rows.
 * @param agents Array of { agent_id/role, status, current_task } from DB
 */
export function buildSpatialState(
  agents: { agent_id: string; role: string; status: string; current_task: string | null }[],
): FloorSpatialState[] {
  const agentMap = new Map(agents.map((a) => [a.agent_id || a.role, a]));

  const floorMap = new Map<FloorNumber, AgentSpatialState[]>();
  for (const def of AGENT_DEFS) {
    const dbAgent = agentMap.get(def.role);
    const activity = dbAgent ? statusToActivity(dbAgent.status) : 'offline';
    const position = activityPosition(def.defaultPos, activity);

    const spatial: AgentSpatialState = {
      role: def.role,
      floor: def.floor,
      activity,
      label: def.label,
      character: def.character,
      currentTask: dbAgent?.current_task || null,
      position,
    };

    const existing = floorMap.get(def.floor) || [];
    existing.push(spatial);
    floorMap.set(def.floor, existing);
  }

  const FLOOR_LABELS: Record<FloorNumber, string> = {
    1: 'Research & Ideation',
    2: 'Development',
    3: 'CI/CD & Deploy',
  };

  return ([1, 2, 3] as FloorNumber[]).map((floor) => {
    const floorAgents = floorMap.get(floor) || [];
    return {
      floor,
      label: FLOOR_LABELS[floor],
      activeCount: floorAgents.filter((a) => a.activity === 'working' || a.activity === 'reviewing').length,
      totalCount: floorAgents.length,
      agents: floorAgents,
    };
  });
}

/** Activity → CSS color class */
export function activityColor(activity: SpatialActivity): string {
  switch (activity) {
    case 'working': return 'bg-[#6366f1]/20 border-[#6366f1] text-[#6366f1]';
    case 'reviewing': return 'bg-[#f59e0b]/20 border-[#f59e0b] text-[#f59e0b]';
    case 'blocked': return 'bg-[#a4312f]/20 border-[#a4312f] text-[#e05252]';
    case 'done': return 'bg-[#0d7a4a]/20 border-[#0d7a4a] text-[#3dba8a]';
    case 'idle': return 'bg-muted/30 border-border text-muted-foreground';
    case 'offline': return 'bg-muted/10 border-transparent text-muted-foreground/50';
  }
}

/** Activity → emoji */
export function activityEmoji(activity: SpatialActivity): string {
  switch (activity) {
    case 'working': return '💻';
    case 'reviewing': return '🔍';
    case 'blocked': return '🚫';
    case 'done': return '✅';
    case 'idle': return '💤';
    case 'offline': return '⬛';
  }
}
