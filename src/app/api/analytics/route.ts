import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { readStatsCache } from '@/lib/coordination/stats-cache-reader';
import { execFileSync } from 'child_process';
import { getProjectAnalytics, getProjectTasks, getProjectAgents } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';

function getTmuxSessions(): { name: string; windows: number; created: string | null }[] {
  try {
    const output = execFileSync('tmux', ['ls'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!output) return [];

    return output.split('\n').filter(Boolean).map((line) => {
      const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s*(?:\(created\s+(.+)\))?/);
      if (match) {
        return { name: match[1], windows: parseInt(match[2], 10), created: match[3] || null };
      }
      return { name: line.split(':')[0], windows: 0, created: null };
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limitParam = Number(searchParams.get('limit') || '500');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 500;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    if (!projectTablesExist(projectId)) {
      createProjectTables(projectId);
    }

    // 1. DB snapshots (task velocity, agent activity over time)
    const rawSnapshots = getProjectAnalytics(projectId, { limit }).reverse(); // oldest first for charts
    const snapshots = rawSnapshots.map((s) => ({
      id: s.id,
      projectId,
      timestamp: s.timestamp,
      activeAgents: s.active_agents ?? 0,
      tasksInProgress: s.tasks_in_progress ?? 0,
      tasksCompleted: s.tasks_completed ?? 0,
      totalTasks: s.total_tasks ?? 0,
      estimatedCost: s.estimated_cost ?? 0,
    }));

    // 2. Current task breakdown by status
    const tasks = getProjectTasks(projectId);
    const tasksByStatus: Record<string, number> = {};
    for (const t of tasks) {
      tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
    }

    // 2b. Tasks breakdown per agent (for floor metrics)
    const tasksByAgent: Record<string, { total: number; done: number; inProgress: number }> = {};
    for (const t of tasks) {
      const agent = t.assigned_agent;
      if (!agent) continue;
      if (!tasksByAgent[agent]) tasksByAgent[agent] = { total: 0, done: 0, inProgress: 0 };
      tasksByAgent[agent].total++;
      if (t.status === 'DONE') tasksByAgent[agent].done++;
      if (['IN_PROGRESS', 'REVIEW', 'TESTING', 'ASSIGNED'].includes(t.status)) tasksByAgent[agent].inProgress++;
    }

    // 3. Current agent statuses
    const agents = getProjectAgents(projectId);
    const agentsByStatus: Record<string, number> = {};
    for (const a of agents) {
      agentsByStatus[a.status] = (agentsByStatus[a.status] || 0) + 1;
    }

  // 4. Real cost data from Claude stats-cache
  const statsCache = readStatsCache();

  // 5. Tmux sessions (filter to project-related if possible)
  const allTmuxSessions = getTmuxSessions();

  // Try to match tmux sessions to the project by looking at project name
  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  const projectPrefix = project?.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || '';
  const tmuxSessions = projectPrefix
    ? allTmuxSessions.filter((s) => s.name.toLowerCase().includes(projectPrefix) || s.name.toLowerCase().startsWith(projectPrefix.split('-')[0]))
    : allTmuxSessions;

    return NextResponse.json({
      snapshots,
      tasksByStatus,
      tasksByAgent,
      agentsByStatus,
      totalTasks: tasks.length,
      totalAgents: agents.length,
      costData: {
        days: statsCache.days,
        totalCost: statsCache.totalCost,
        modelUsage: statsCache.modelUsage,
      },
      tmuxSessions,
    });
  } catch (err) {
    console.error('GET /api/analytics error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
