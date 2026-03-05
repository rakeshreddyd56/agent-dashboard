'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgentStore } from '@/lib/store/agent-store';
import { useProjectStore } from '@/lib/store/project-store';
import { AGENT_ROLES } from '@/lib/constants';
import { RoleIcon } from '@/components/shared/role-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { useOfficeStore } from '@/lib/store/office-store';
import { getFloorAgentRoles } from '@/lib/utils/floor-filter';
import type { AgentStatus, AgentRole } from '@/lib/types';

export function AgentSummary() {
  const allAgents = useAgentStore((s) => s.agents);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const viewFloor = useOfficeStore((s) => s.viewFloor);
  const agents = activeProjectId ? allAgents.filter((a) => a.projectId === activeProjectId) : allAgents;

  const visibleRoles = viewFloor === 'all'
    ? AGENT_ROLES
    : AGENT_ROLES.filter((r) => getFloorAgentRoles(viewFloor).has(r.role));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Crew Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {visibleRoles.map((roleDef) => {
            const agent = agents.find((a) => a.role === roleDef.role);
            const status = (agent?.status || 'offline') as AgentStatus;
            return (
              <div
                key={roleDef.role}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 p-2.5"
              >
                <RoleIcon role={roleDef.role as AgentRole} className="h-5 w-5" />
                <span className="text-[10px] font-medium">{roleDef.label}</span>
                <StatusBadge status={status} />
                {agent?.currentTask && (
                  <p className="line-clamp-1 text-center text-[9px] text-muted-foreground">
                    {agent.currentTask}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
