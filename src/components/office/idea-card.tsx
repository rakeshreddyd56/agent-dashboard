'use client';

import type { ResearchIdea } from '@/lib/types';

interface IdeaCardProps {
  idea: ResearchIdea;
  index: number;
}

export function IdeaCard({ idea, index }: IdeaCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-bold text-[#6366f1]">#{index + 1}</span>
          <h4 className="text-sm font-bold mt-0.5">{idea.title}</h4>
        </div>
        {idea.averageScore !== undefined && (
          <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#6366f1]/10 text-[#6366f1]">
            {Math.round(idea.averageScore * 10) / 10}/10
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{idea.description}</p>

      {idea.viralPotential && (
        <div>
          <span className="text-[10px] font-semibold text-[#f59e0b]">VIRAL POTENTIAL</span>
          <p className="text-xs text-muted-foreground">{idea.viralPotential}</p>
        </div>
      )}

      {idea.mvpScope && (
        <div>
          <span className="text-[10px] font-semibold text-[#0d7a4a]">MVP SCOPE</span>
          <p className="text-xs text-muted-foreground">{idea.mvpScope}</p>
        </div>
      )}

      {idea.uiScreens && idea.uiScreens.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold text-[#0891b2]">UI SCREENS</span>
          <ul className="text-xs text-muted-foreground space-y-1 mt-1">
            {idea.uiScreens.map((screen, i) => (
              <li key={i} className="pl-2 border-l-2 border-[#0891b2]/30">{screen}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground">
        Proposed by: <span className="font-medium">{idea.proposedBy}</span>
      </div>
    </div>
  );
}
