'use client';

import type { CouncilVote, ResearchIdea } from '@/lib/types';

interface CouncilVotesChartProps {
  votes: CouncilVote[];
  ideas: ResearchIdea[];
}

export function CouncilVotesChart({ votes, ideas }: CouncilVotesChartProps) {
  // Aggregate votes per idea
  const ideaScores = ideas.map((idea, idx) => {
    const ideaVotes = votes.filter((v) => v.ideaIndex === idx);
    const avgScore = ideaVotes.length > 0
      ? ideaVotes.reduce((sum, v) => sum + v.score, 0) / ideaVotes.length
      : 0;
    return {
      title: idea.title,
      avgScore: Math.round(avgScore * 10) / 10,
      voteCount: ideaVotes.length,
      votes: ideaVotes,
    };
  }).sort((a, b) => b.avgScore - a.avgScore);

  const maxScore = 10;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {ideaScores.map((idea, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium truncate mr-2">{idea.title}</span>
            <span className="text-[#6366f1] font-bold whitespace-nowrap">
              {idea.avgScore}/10
            </span>
          </div>
          {/* Bar */}
          <div className="h-5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(idea.avgScore / maxScore) * 100}%`,
                background: `linear-gradient(90deg, #6366f1, ${idea.avgScore >= 7 ? '#3dba8a' : '#f59e0b'})`,
              }}
            />
          </div>
          {/* Individual votes */}
          <div className="flex gap-2 text-[10px] text-muted-foreground">
            {idea.votes.map((v, j) => (
              <span key={j}>{v.memberName}: {v.score}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
