'use client';

import type { FloorNumber, OfficeState } from '@/lib/types';
import { OFFICE_CONFIG } from '@/lib/constants';

interface FloorStatus {
  floor: FloorNumber;
  status: 'idle' | 'active' | 'complete';
  label: string;
}

interface FloorStackProps {
  floorStatuses: FloorStatus[];
  activeFloor: FloorNumber | null;
  officeState: OfficeState;
}

const FLOOR_COLORS = {
  idle: { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground' },
  active: { bg: 'bg-[#6366f1]/10', border: 'border-[#6366f1]', text: 'text-[#6366f1]' },
  complete: { bg: 'bg-[#0d7a4a]/10', border: 'border-[#0d7a4a]', text: 'text-[#3dba8a]' },
};

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

export function FloorStack({ floorStatuses, activeFloor, officeState }: FloorStackProps) {
  // Render floors top-down (3, 2, 1)
  const sortedFloors = [...floorStatuses].sort((a, b) => b.floor - a.floor);

  return (
    <div className="space-y-3">
      {sortedFloors.map((floor) => {
        const colors = FLOOR_COLORS[floor.status];
        const agents = FLOOR_AGENTS[floor.floor] || [];
        const isActive = floor.floor === activeFloor;

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

            {/* Agent Grid */}
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => (
                <div
                  key={agent.role}
                  className={`text-xs px-2 py-1 rounded border ${
                    isActive ? 'bg-background/50 border-border' : 'bg-muted/50 border-transparent'
                  }`}
                >
                  {agent.role.startsWith('rataa') ? '👔 ' : '🧑‍💻 '}
                  {agent.label}
                </div>
              ))}
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
