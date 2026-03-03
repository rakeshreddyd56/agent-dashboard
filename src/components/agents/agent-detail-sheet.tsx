'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RoleIcon } from '@/components/shared/role-icon';
import { StatusBadge } from '@/components/shared/status-badge';
import { HeartbeatIndicator } from './heartbeat-indicator';
import { TimeAgo } from '@/components/shared/time-ago';
import { AGENT_ROLES } from '@/lib/constants';
import type { AgentSnapshot, AgentRole, AgentStatus } from '@/lib/types';
import type { HeartbeatStatus } from '@/lib/hooks/use-agents';

interface AgentDetailSheetProps {
  agent: AgentSnapshot | null;
  heartbeat: HeartbeatStatus;
  open: boolean;
  onClose: () => void;
}

export function AgentDetailSheet({ agent, heartbeat, open, onClose }: AgentDetailSheetProps) {
  if (!agent) return null;

  const roleDef = AGENT_ROLES.find((r) => r.role === agent.role);
  const lockedFiles = Array.isArray(agent.lockedFiles) ? agent.lockedFiles : [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[400px] overflow-y-auto sm:w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <RoleIcon role={agent.role as AgentRole} className="h-5 w-5" />
            {roleDef?.label || agent.role}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Agent ID</label>
              <p className="text-sm font-mono">{agent.agentId}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <div className="mt-0.5">
                <StatusBadge status={agent.status as AgentStatus} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Model</label>
              <p className="text-sm">{agent.model || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Heartbeat</label>
              <div className="mt-0.5">
                <HeartbeatIndicator status={heartbeat} />
              </div>
            </div>
          </div>

          {agent.currentTask && (
            <div>
              <label className="text-xs text-muted-foreground">Current Task</label>
              <p className="text-sm mt-0.5">{agent.currentTask}</p>
            </div>
          )}

          {agent.sessionStart && (
            <div>
              <label className="text-xs text-muted-foreground">Session Start</label>
              <div className="mt-0.5">
                <TimeAgo date={agent.sessionStart} />
              </div>
            </div>
          )}

          {typeof agent.estimatedCost === 'number' && (
            <div>
              <label className="text-xs text-muted-foreground">Estimated Cost</label>
              <p className="text-sm font-medium">${agent.estimatedCost.toFixed(2)}</p>
            </div>
          )}

          <Separator />

          <div>
            <label className="text-xs text-muted-foreground">
              Locked Files ({lockedFiles.length})
            </label>
            {lockedFiles.length > 0 ? (
              <div className="mt-1 space-y-1">
                {lockedFiles.map((f, i) => (
                  <Badge key={i} variant="outline" className="block w-fit font-mono text-[10px]">
                    {f}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No locked files</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
