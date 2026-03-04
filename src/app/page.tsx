'use client';

import { useTaskStore } from '@/lib/store/task-store';
import { useAgentStore } from '@/lib/store/agent-store';
import { useProjectStore } from '@/lib/store/project-store';
import { StatCard } from '@/components/dashboard/stat-card';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { AgentSummary } from '@/components/dashboard/agent-summary';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { TaskFlowMini } from '@/components/dashboard/task-flow-mini';
import { NotificationPreview } from '@/components/dashboard/notification-preview';
import { PixelOffice } from '@/components/pixel-agents/pixel-office';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MissionPanel } from '@/components/dashboard/mission-panel';
import { Bot, ListChecks, TrendingUp, DollarSign } from 'lucide-react';

export default function DashboardPage() {
  const allTasks = useTaskStore((s) => s.tasks);
  const allAgents = useAgentStore((s) => s.agents);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectName = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name || 'Agent Dashboard');

  // Filter by active project
  const tasks = activeProjectId ? allTasks.filter((t) => t.projectId === activeProjectId) : allTasks;
  const agents = activeProjectId ? allAgents.filter((a) => a.projectId === activeProjectId) : allAgents;

  const activeAgents = agents.filter((a) =>
    ['working', 'planning', 'reviewing'].includes(a.status)
  ).length;
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const completed = tasks.filter((t) => t.status === 'DONE').length;
  const total = tasks.length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const cost = agents.reduce((sum, a) => sum + (a.estimatedCost || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{projectName} HQ</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Agents"
          value={activeAgents}
          subtitle={`${agents.length} total`}
          icon={Bot}
          color="#146b4e"
        />
        <StatCard
          title="In Progress"
          value={inProgress}
          subtitle={`${total} total tasks`}
          icon={ListChecks}
          color="#8d5a0f"
        />
        <StatCard
          title="Completion Rate"
          value={`${rate}%`}
          subtitle={`${completed} of ${total} done`}
          icon={TrendingUp}
          color="#0d7a4a"
        />
        <StatCard
          title="Est. Cost"
          value={`$${cost.toFixed(2)}`}
          subtitle="This session"
          icon={DollarSign}
          color="#d5601d"
        />
      </div>

      <TaskFlowMini tasks={tasks} />

      <MissionPanel />

      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#0d7a4a] animate-pulse" />
            {projectName} — Agents Live
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-3">
          <PixelOffice agents={agents} projectName={projectName} />
        </CardContent>
      </Card>

      <AgentSummary />

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <QuickActions />
        <NotificationPreview />
      </div>
    </div>
  );
}
