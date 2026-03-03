'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RoleIcon } from '@/components/shared/role-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { HeartbeatIndicator } from './heartbeat-indicator';
import { AGENT_ROLES } from '@/lib/constants';
import { useProjectStore } from '@/lib/store/project-store';
import { RotateCcw } from 'lucide-react';
import type { AgentSnapshot, AgentRole, AgentStatus } from '@/lib/types';
import type { HeartbeatStatus } from '@/lib/hooks/use-agents';

interface AgentCardProps {
  agent: AgentSnapshot;
  heartbeat: HeartbeatStatus;
  onClick: () => void;
}

export function AgentCard({ agent, heartbeat, onClick }: AgentCardProps) {
  const roleDef = AGENT_ROLES.find((r) => r.role === agent.role);
  const roleLabel = roleDef?.label || agent.role;
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [respawning, setRespawning] = useState(false);
  const [respawnResult, setRespawnResult] = useState<string | null>(null);
  const isOffline = agent.status === 'offline';

  const handleRespawn = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProjectId || respawning) return;
    setRespawning(true);
    setRespawnResult(null);
    try {
      const res = await fetch('/api/agents/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, agents: [agent.agentId] }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.status === 'launched') {
        setRespawnResult('Launched');
      } else if (result?.status === 'already_running') {
        setRespawnResult('Already running');
      } else {
        setRespawnResult(result?.error || 'Failed');
      }
    } catch {
      setRespawnResult('Failed');
    } finally {
      setRespawning(false);
      setTimeout(() => setRespawnResult(null), 4000);
    }
  };

  return (
    <Card
      className={`cursor-pointer border-border/50 transition-colors hover:border-border ${isOffline ? 'opacity-70' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <RoleIcon role={agent.role as AgentRole} className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium">{roleLabel}</p>
              <p className="text-[10px] text-muted-foreground">{agent.agentId}</p>
            </div>
          </div>
          <HeartbeatIndicator status={heartbeat} />
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={agent.status as AgentStatus} />
            {isOffline && (
              <Button
                variant="outline"
                size="sm"
                className="h-5 px-2 text-[10px] gap-1 text-[#3dba8a] border-[#3dba8a]/30 hover:bg-[#3dba8a]/10"
                onClick={handleRespawn}
                disabled={respawning}
              >
                <RotateCcw className={`h-3 w-3 ${respawning ? 'animate-spin' : ''}`} />
                {respawning ? 'Spawning...' : 'Respawn'}
              </Button>
            )}
          </div>

          {respawnResult && (
            <p className={`text-[10px] ${respawnResult === 'Launched' ? 'text-[#3dba8a]' : 'text-[#e05252]'}`}>
              {respawnResult}
            </p>
          )}

          {agent.currentTask && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{agent.currentTask}</p>
          )}

          {agent.model && (
            <Badge variant="outline" className="text-[10px]">
              {agent.model}
            </Badge>
          )}

          {typeof agent.progress === 'number' && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Progress</span>
                <span>{agent.progress}%</span>
              </div>
              <Progress value={agent.progress} className="h-1" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
