'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Rocket, ExternalLink, FileText, ScrollText } from 'lucide-react';
import { useProjectStore } from '@/lib/store/project-store';
import { useTaskStore } from '@/lib/store/task-store';
import { useAgentStore } from '@/lib/store/agent-store';
import { useState } from 'react';

export function QuickActions() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setTasks = useTaskStore((s) => s.setTasks);
  const setAgents = useAgentStore((s) => s.setAgents);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!activeProjectId || syncing) return;
    setSyncing(true);
    try {
      const [taskRes, agentRes] = await Promise.all([
        fetch(`/api/tasks?projectId=${activeProjectId}`).then((r) => r.ok ? r.json() : null),
        fetch(`/api/agents?projectId=${activeProjectId}`).then((r) => r.ok ? r.json() : null),
      ]);
      if (taskRes?.tasks) setTasks(taskRes.tasks);
      if (agentRes?.agents) setAgents(agentRes.agents);
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <Link href="/mission">
            <Button variant="outline" className="h-auto w-full flex-col gap-1 py-3" size="sm">
              <Rocket className="h-4 w-4" />
              <span className="text-[10px]">Mission</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 py-3"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="text-[10px]">{syncing ? 'Syncing...' : 'Sync Now'}</span>
          </Button>
          <Link href="/board">
            <Button variant="outline" className="h-auto w-full flex-col gap-1 py-3" size="sm">
              <Plus className="h-4 w-4" />
              <span className="text-[10px]">New Task</span>
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" className="h-auto w-full flex-col gap-1 py-3" size="sm">
              <ExternalLink className="h-4 w-4" />
              <span className="text-[10px]">Settings</span>
            </Button>
          </Link>
          <Link href="/standup">
            <Button variant="outline" className="h-auto w-full flex-col gap-1 py-3" size="sm">
              <FileText className="h-4 w-4" />
              <span className="text-[10px]">Standup</span>
            </Button>
          </Link>
          <Link href="/activity">
            <Button variant="outline" className="h-auto w-full flex-col gap-1 py-3" size="sm">
              <ScrollText className="h-4 w-4" />
              <span className="text-[10px]">Audit Log</span>
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
