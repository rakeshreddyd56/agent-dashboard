'use client';

import { useState } from 'react';
import { AgentCard } from './agent-card';
import { AgentDetailSheet } from './agent-detail-sheet';
import { useAgents } from '@/lib/hooks/use-agents';
import type { AgentSnapshot } from '@/lib/types';

export function AgentGrid() {
  const { agents, getHeartbeatStatus } = useAgents();
  const [selectedAgent, setSelectedAgent] = useState<AgentSnapshot | null>(null);

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No agents registered for this project. Start a multi-agent workflow to see agents appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            heartbeat={getHeartbeatStatus(agent.lastHeartbeat)}
            onClick={() => setSelectedAgent(agent)}
          />
        ))}
      </div>

      <AgentDetailSheet
        agent={selectedAgent}
        heartbeat={getHeartbeatStatus(selectedAgent?.lastHeartbeat)}
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </>
  );
}
