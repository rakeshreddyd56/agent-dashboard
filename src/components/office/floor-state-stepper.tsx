'use client';

import type { OfficeState } from '@/lib/types';

const STATES: { state: OfficeState; label: string; floor: number }[] = [
  { state: 'IDLE', label: 'Idle', floor: 0 },
  { state: 'CLONING', label: 'Clone', floor: 1 },
  { state: 'ANALYZING', label: 'Analyze', floor: 1 },
  { state: 'RESEARCHING', label: 'Research', floor: 1 },
  { state: 'REVIEWING', label: 'Review', floor: 1 },
  { state: 'SYNTHESIZING', label: 'Synthesize', floor: 1 },
  { state: 'PLANNING', label: 'Plan', floor: 1 },
  { state: 'DELEGATING', label: 'Delegate', floor: 2 },
  { state: 'DEVELOPING', label: 'Develop', floor: 2 },
  { state: 'TESTING', label: 'Test', floor: 2 },
  { state: 'BUILDING', label: 'Build', floor: 3 },
  { state: 'DEPLOYING', label: 'Deploy', floor: 3 },
  { state: 'COMPLETE', label: 'Done', floor: 0 },
];

const FLOOR_COLORS: Record<number, string> = {
  0: '#7fa393',
  1: '#6366f1',
  2: '#0891b2',
  3: '#a855f7',
};

interface FloorStateStepperProps {
  state: OfficeState;
}

export function FloorStateStepper({ state }: FloorStateStepperProps) {
  const currentIndex = STATES.findIndex((s) => s.state === state);

  return (
    <div className="bg-card border border-border rounded-lg p-4 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {STATES.map((step, i) => {
          const isActive = i === currentIndex;
          const isPast = i < currentIndex;
          const color = FLOOR_COLORS[step.floor];

          return (
            <div key={step.state} className="flex items-center">
              {/* Step */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    isActive
                      ? 'ring-2 ring-offset-2 ring-offset-background scale-110'
                      : ''
                  }`}
                  style={{
                    backgroundColor: isPast || isActive ? color : 'transparent',
                    color: isPast || isActive ? 'white' : '#666',
                    borderWidth: isPast || isActive ? 0 : 2,
                    borderColor: '#444',
                    boxShadow: isActive ? `0 0 0 2px var(--background), 0 0 0 4px ${color}` : undefined,
                  }}
                >
                  {isPast ? '✓' : i + 1}
                </div>
                <span
                  className={`text-[9px] mt-1 whitespace-nowrap ${
                    isActive ? 'font-bold' : isPast ? 'font-medium' : ''
                  }`}
                  style={{ color: isActive ? color : isPast ? color : '#888' }}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {i < STATES.length - 1 && (
                <div
                  className="w-4 h-0.5 mx-0.5"
                  style={{ backgroundColor: isPast ? color : '#333' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
