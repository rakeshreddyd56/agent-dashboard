'use client';

import type { FloorNumber, OfficeState } from '@/lib/types';
import type { FloorSpatialState, AgentSpatialState } from '@/lib/coordination/spatial-state';
import { activityColor, activityEmoji } from '@/lib/coordination/spatial-state';

interface FloorStatus {
  floor: FloorNumber;
  status: 'idle' | 'active' | 'complete';
  label: string;
}

interface FloorStackProps {
  floorStatuses: FloorStatus[];
  activeFloor: FloorNumber | null;
  officeState: OfficeState;
  /** Live spatial data from agent DB — if provided, overrides static labels */
  spatialFloors?: FloorSpatialState[];
}

const FLOOR_COLORS = {
  idle: { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground' },
  active: { bg: 'bg-[#6366f1]/10', border: 'border-[#6366f1]', text: 'text-[#6366f1]' },
  complete: { bg: 'bg-[#0d7a4a]/10', border: 'border-[#0d7a4a]', text: 'text-[#3dba8a]' },
};

// Fallback static agents — used when no spatial data is available
const FLOOR_AGENTS: Record<number, { role: string; label: string }[]> = {
  3: [
    { role: 'rataa-ops', label: 'Luffy-Ops' },
  ],
  2: [
    { role: 'rataa-frontend', label: 'Nami-Frontend' },
    { role: 'rataa-backend', label: 'Franky-Backend' },
    { role: 'architect', label: 'Usopp-Architect' },
    { role: 'frontend', label: 'Sanji-Frontend' },
    { role: 'backend-1', label: 'Zoro-Backend' },
    { role: 'backend-2', label: 'Law-Backend' },
    { role: 'tester-1', label: 'Smoker-Tester' },
    { role: 'tester-2', label: 'Tashigi-Tester' },
  ],
  1: [
    { role: 'rataa-research', label: 'Robin-Research' },
    { role: 'researcher-1', label: 'Chopper (GPT-4o)' },
    { role: 'researcher-2', label: 'Brook (Claude)' },
    { role: 'researcher-3', label: 'Jinbe (Gemini)' },
    { role: 'researcher-4', label: 'Carrot (Llama)' },
  ],
};

function AgentChip({ agent }: { agent: AgentSpatialState }) {
  const colorClass = activityColor(agent.activity);
  const emoji = activityEmoji(agent.activity);
  const isLead = agent.role.startsWith('rataa') || agent.role.startsWith('supervisor');

  return (
    <div
      className={`text-xs px-2 py-1.5 rounded border transition-all duration-300 ${colorClass}`}
      title={agent.currentTask ? `Working on: ${agent.currentTask}` : `${agent.character} — ${agent.activity}`}
    >
      <span className="mr-1">{emoji}</span>
      {isLead ? '👔 ' : ''}
      {agent.label}
      {agent.currentTask && (
        <span className="ml-1 text-[10px] opacity-70 truncate max-w-[120px] inline-block align-bottom">
          [{agent.currentTask}]
        </span>
      )}
    </div>
  );
}

export function FloorStack({ floorStatuses, activeFloor, officeState, spatialFloors }: FloorStackProps) {
  // Render floors top-down (3, 2, 1)
  const sortedFloors = [...floorStatuses].sort((a, b) => b.floor - a.floor);

  return (
    <div className="space-y-3">
      {sortedFloors.map((floor) => {
        const colors = FLOOR_COLORS[floor.status];
        const isActive = floor.floor === activeFloor;

        // Use spatial data if available, otherwise fall back to static list
        const spatialFloor = spatialFloors?.find((sf) => sf.floor === floor.floor);
        const staticAgents = FLOOR_AGENTS[floor.floor] || [];

        return (
          <div
            key={floor.floor}
            className={`${colors.bg} border-2 ${colors.border} rounded-lg p-4 transition-all duration-300 ${isActive ? 'shadow-lg scale-[1.01]' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${colors.text}`}>
                  Floor {floor.floor}
                </span>
                <span className="text-sm text-muted-foreground">
                  {floor.label}
                </span>
                {spatialFloor && spatialFloor.activeCount > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#6366f1]/10 text-[#6366f1]">
                    {spatialFloor.activeCount}/{spatialFloor.totalCount} active
                  </span>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                floor.status === 'active' ? 'bg-[#6366f1]/20 text-[#6366f1]' :
                floor.status === 'complete' ? 'bg-[#0d7a4a]/20 text-[#3dba8a]' :
                'bg-muted text-muted-foreground'
              }`}>
                {floor.status.toUpperCase()}
                {isActive && (
                  <span className="ml-1 inline-block w-2 h-2 bg-[#6366f1] rounded-full animate-pulse" />
                )}
              </span>
            </div>

            {/* Agent Grid — live or static */}
            <div className="flex flex-wrap gap-2">
              {spatialFloor
                ? spatialFloor.agents.map((agent) => (
                    <AgentChip key={agent.role} agent={agent} />
                  ))
                : staticAgents.map((agent) => (
                    <div
                      key={agent.role}
                      className={`text-xs px-2 py-1 rounded border ${
                        isActive ? 'bg-background/50 border-border' : 'bg-muted/50 border-transparent'
                      }`}
                    >
                      {agent.role.startsWith('rataa') ? '👔 ' : '🧑‍💻 '}
                      {agent.label}
                    </div>
                  ))
              }
            </div>
          </div>
        );
      })}

      {/* Connection arrows */}
      <div className="flex justify-center text-muted-foreground text-xs py-1">
        Floor 1 → Floor 2 → Floor 3
      </div>
    </div>
  );
}
