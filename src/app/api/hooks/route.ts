import { NextRequest, NextResponse } from 'next/server';
import { getProjectAgents, upsertProjectAgent, insertProjectEvent } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';
import type { AgentRow, EventRow } from '@/lib/db/project-queries';

// Debounce: skip PostToolUse heartbeat refresh if last one was <5s ago
const lastHeartbeatRefresh = new Map<string, number>();
const HEARTBEAT_DEBOUNCE_MS = 5000;

/**
 * Resolve an agent from the DB given hook payload fields.
 * Strategy: 1) match sdk_session_id, 2) match agent_id, 3) extract role from tmux session name
 */
function resolveAgent(
  agents: AgentRow[],
  sessionId?: string,
  agentId?: string,
): AgentRow | undefined {
  if (sessionId) {
    const bySession = agents.find((a) => a.sdk_session_id === sessionId);
    if (bySession) return bySession;
  }
  if (agentId) {
    const byId = agents.find((a) => a.agent_id === agentId);
    if (byId) return byId;
    // Try matching role extracted from tmux pattern: {prefix}-{role}
    const parts = agentId.split('-');
    if (parts.length >= 2) {
      const role = parts.slice(1).join('-');
      const byRole = agents.find((a) => a.role === role || a.agent_id === role);
      if (byRole) return byRole;
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, string | undefined>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const {
      type,
      session_id: sessionId,
      agent_id: agentId,
      project_id: projectId,
      tool_name: toolName,
      timestamp,
    } = body;

    if (!type) {
      return NextResponse.json({ error: 'type required' }, { status: 400 });
    }

    const now = timestamp || new Date().toISOString();

    // If no projectId, we can still accept the hook but can't do DB ops
    if (!projectId || !projectTablesExist(projectId)) {
      // Broadcast generic hook event anyway
      eventBus.broadcast('hook.received', { type, agentId, sessionId, timestamp: now }, projectId || 'unknown');
      return NextResponse.json({ ok: true, matched: false });
    }

    const agents = getProjectAgents(projectId);
    const agent = resolveAgent(agents, sessionId, agentId);

    switch (type) {
      case 'SessionStart': {
        if (agent) {
          const updated: AgentRow = {
            ...agent,
            status: 'initializing',
            hook_enabled: 1,
            last_heartbeat: now,
          };
          if (sessionId) updated.sdk_session_id = sessionId;
          upsertProjectAgent(projectId, updated);
        }
        break;
      }

      case 'PostToolUse': {
        if (agent) {
          // Debounce heartbeat refresh
          const key = `${projectId}-${agent.agent_id}`;
          const lastRefresh = lastHeartbeatRefresh.get(key) || 0;
          const nowMs = Date.now();
          if (nowMs - lastRefresh < HEARTBEAT_DEBOUNCE_MS) {
            // Skip — too soon
            eventBus.broadcast('hook.received', { type, agentId: agent.agent_id, toolName }, projectId);
            return NextResponse.json({ ok: true, debounced: true });
          }
          lastHeartbeatRefresh.set(key, nowMs);

          const updated: AgentRow = {
            ...agent,
            last_heartbeat: now,
            status: agent.status === 'initializing' ? 'working' : agent.status,
          };
          upsertProjectAgent(projectId, updated);
        }
        break;
      }

      case 'Stop': {
        if (agent) {
          const updated: AgentRow = {
            ...agent,
            status: 'completed',
            last_heartbeat: now,
          };
          upsertProjectAgent(projectId, updated);

          const evt: EventRow = {
            id: `evt-hook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: now,
            level: 'info',
            agent_id: agent.agent_id,
            agent_role: agent.role,
            message: `Agent ${agent.agent_id} stopped (hook)`,
            details: JSON.stringify({ sessionId, reason: body.stop_reason }),
          };
          insertProjectEvent(projectId, evt);

          // Trigger post-completion sync
          triggerPostCompletionRelay(projectId);
        }
        break;
      }

      case 'SubagentStop': {
        const evt: EventRow = {
          id: `evt-subagent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          level: 'info',
          agent_id: agentId || null,
          agent_role: agent?.role || null,
          message: `Subagent stopped (parent: ${agentId || 'unknown'})`,
          details: JSON.stringify({ sessionId }),
        };
        insertProjectEvent(projectId, evt);
        break;
      }

      case 'TaskCompleted': {
        if (agent) {
          // Move agent's current task to REVIEW
          if (agent.current_task) {
            try {
              const { getProjectTasks, updateProjectTask } = await import('@/lib/db/project-queries');
              const tasks = getProjectTasks(projectId);
              const task = tasks.find(
                (t) => t.external_id === agent.current_task || t.id === agent.current_task
              );
              if (task && task.status === 'IN_PROGRESS') {
                updateProjectTask(projectId, task.id, {
                  status: 'REVIEW',
                  updated_at: now,
                });
                eventBus.broadcast('task.status_changed', {
                  taskId: task.id,
                  oldStatus: 'IN_PROGRESS',
                  newStatus: 'REVIEW',
                }, projectId);
              }
            } catch { /* non-fatal */ }
          }

          const updated: AgentRow = {
            ...agent,
            status: 'completed',
            last_heartbeat: now,
          };
          upsertProjectAgent(projectId, updated);

          triggerPostCompletionRelay(projectId);
        }
        break;
      }

      case 'Notification': {
        // Forward to notification system
        try {
          const { rawDb } = await import('@/lib/db');
          rawDb.prepare(`
            INSERT INTO notifications (id, project_id, recipient, type, title, message, source_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `notif-hook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            projectId,
            'user',
            'hook',
            `Notification from ${agentId || 'agent'}`,
            body.result || 'Agent notification',
            'hook',
            now,
          );
        } catch { /* non-fatal */ }
        break;
      }

      default:
        // Unknown hook type — log but don't error
        break;
    }

    // Broadcast hook event for SSE clients
    eventBus.broadcast('hook.received', {
      type,
      agentId: agent?.agent_id || agentId,
      sessionId,
      toolName,
      timestamp: now,
    }, projectId);

    return NextResponse.json({ ok: true, matched: !!agent });
  } catch (err) {
    console.error('POST /api/hooks error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Trigger sync + auto-relay after agent completion (non-blocking) */
async function triggerPostCompletionRelay(projectId: string) {
  try {
    const [{ db, schema }, { eq }, { syncProject }] = await Promise.all([
      import('@/lib/db'),
      import('drizzle-orm'),
      import('@/lib/coordination/sync-engine'),
    ]);
    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get();
    if (project) await syncProject(project as Parameters<typeof syncProject>[0]);
  } catch { /* non-fatal */ }

  try {
    const { runAutoRelay } = await import('@/lib/coordination/relay');
    await runAutoRelay(projectId);
  } catch { /* non-fatal */ }
}
