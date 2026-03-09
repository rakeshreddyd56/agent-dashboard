import { NextRequest, NextResponse } from 'next/server';
import { getProjectAgents, upsertProjectAgent, insertProjectEvent } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';
import { eventBus } from '@/lib/events/event-bus';
import { validateAuth } from '@/lib/auth';
import type { AgentRow, EventRow } from '@/lib/db/project-queries';

// Model cost rates (per million tokens, in cents)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 1500, output: 7500 },
  'claude-sonnet-4-6': { input: 300, output: 1500 },
  'claude-haiku-4-5-20251001': { input: 80, output: 400 },
  'claude-sonnet-4-5-20250514': { input: 300, output: 1500 },
  'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
  'claude-3-5-haiku-20241022': { input: 80, output: 400 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Find matching model (prefix match for flexibility)
  const key = Object.keys(MODEL_COSTS).find(k => model.startsWith(k) || model.includes(k));
  const rates = key ? MODEL_COSTS[key] : { input: 300, output: 1500 }; // default to sonnet rates
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

// Debounce: skip PostToolUse heartbeat refresh if last one was <5s ago
const lastHeartbeatRefresh = new Map<string, number>();
const HEARTBEAT_DEBOUNCE_MS = 5000;
const HEARTBEAT_CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanupHeartbeatMap() {
  const now = Date.now();
  if (now - lastCleanup < HEARTBEAT_CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const staleThreshold = now - 300_000; // 5 minutes
  for (const [key, ts] of lastHeartbeatRefresh) {
    if (ts < staleThreshold) lastHeartbeatRefresh.delete(key);
  }
}

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
  // Auth check — when DASHBOARD_API_SECRET is set, hooks must authenticate
  const authError = validateAuth(req);
  if (authError) return authError;

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

    cleanupHeartbeatMap();

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

          // Create run record
          try {
            const { createRun } = await import('@/lib/db/run-queries');
            const { secureId } = await import('@/lib/auth');
            const runId = secureId('run');
            createRun({
              id: runId,
              project_id: projectId,
              agent_id: agent.agent_id,
              agent_role: agent.role,
              status: 'running',
              invocation_source: body.invocation_source || 'manual',
              task_id: agent.current_task || null,
              model: agent.model || null,
              started_at: now,
              finished_at: null,
              exit_code: null,
              input_tokens: 0,
              output_tokens: 0,
              cost_cents: 0,
              tool_calls: 0,
              stdout_excerpt: null,
              created_at: now,
            });
            eventBus.broadcast('run.created', { runId, agentId: agent.agent_id, agentRole: agent.role }, projectId);
          } catch { /* non-fatal */ }
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

          // Cost tracking + budget enforcement
          const inputTokens = parseInt(body.input_tokens as string) || 0;
          const outputTokens = parseInt(body.output_tokens as string) || 0;
          const model = (body.model as string) || agent.model || 'unknown';

          if (inputTokens > 0 || outputTokens > 0) {
            try {
              const costCents = calculateCost(model, inputTokens, outputTokens);
              const { insertCostEvent, incrementSpent } = await import('@/lib/db/budget-queries');
              const { secureId } = await import('@/lib/auth');
              const { getActiveRunForAgent, incrementRunCounters } = await import('@/lib/db/run-queries');

              // Record cost event
              insertCostEvent({
                id: secureId('cost'),
                project_id: projectId,
                agent_id: agent.agent_id,
                agent_role: agent.role,
                provider: model.startsWith('claude') ? 'anthropic' : 'unknown',
                model,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost_cents: costCents,
                run_id: null,
                occurred_at: now,
                created_at: now,
              });

              eventBus.broadcast('cost.recorded', {
                agentId: agent.agent_id, agentRole: agent.role, costCents, model,
              }, projectId);

              // Increment budget spent + check thresholds
              const budgetStatus = incrementSpent(projectId, agent.role, costCents);

              if (budgetStatus.softAlert) {
                eventBus.broadcast('budget.soft_alert', {
                  agentRole: agent.role, percentUsed: budgetStatus.percentUsed,
                }, projectId);
              }
              if (budgetStatus.hardStop) {
                eventBus.broadcast('budget.hard_stop', {
                  agentRole: agent.role, percentUsed: budgetStatus.percentUsed,
                }, projectId);
              }

              // Increment run counters if there's an active run
              const activeRun = getActiveRunForAgent(projectId, agent.agent_id);
              if (activeRun) {
                incrementRunCounters(activeRun.id, inputTokens, outputTokens, costCents);
              }
            } catch { /* non-fatal — cost tracking should never break hooks */ }
          }
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

          // Finalize active run
          try {
            const { getActiveRunForAgent, finalizeRun } = await import('@/lib/db/run-queries');
            const activeRun = getActiveRunForAgent(projectId, agent.agent_id);
            if (activeRun) {
              const exitCode = parseInt(body.exit_code as string) || 0;
              finalizeRun(activeRun.id, exitCode, (body.stdout_excerpt as string) || undefined);
              eventBus.broadcast('run.completed', {
                runId: activeRun.id, agentId: agent.agent_id, agentRole: agent.role, exitCode,
              }, projectId);
            }
          } catch { /* non-fatal */ }

          // Kill tmux session immediately on completion
          try {
            const { execFileSync } = await import('child_process');
            const tmuxSessions = (() => {
              try {
                return execFileSync('tmux', ['ls'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] })
                  .trim().split('\n').map(l => l.split(':')[0]);
              } catch { return []; }
            })();
            const session = tmuxSessions.find(s => s === agent.agent_id || s.endsWith('-' + agent.agent_id));
            if (session) {
              execFileSync('tmux', ['kill-session', '-t', session], {
                encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
              });
            }
          } catch { /* non-fatal */ }

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

          // Finalize active run
          try {
            const { getActiveRunForAgent, finalizeRun } = await import('@/lib/db/run-queries');
            const activeRun = getActiveRunForAgent(projectId, agent.agent_id);
            if (activeRun) {
              finalizeRun(activeRun.id, 0); // Task completed = success
              eventBus.broadcast('run.completed', {
                runId: activeRun.id, agentId: agent.agent_id, agentRole: agent.role, exitCode: 0,
              }, projectId);
            }
          } catch { /* non-fatal */ }

          // Kill tmux session immediately on completion
          try {
            const { execFileSync } = await import('child_process');
            const tmuxSessions = (() => {
              try {
                return execFileSync('tmux', ['ls'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] })
                  .trim().split('\n').map(l => l.split(':')[0]);
              } catch { return []; }
            })();
            const session = tmuxSessions.find(s => s === agent.agent_id || s.endsWith('-' + agent.agent_id));
            if (session) {
              execFileSync('tmux', ['kill-session', '-t', session], {
                encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
              });
            }
          } catch { /* non-fatal */ }

          triggerPostCompletionRelay(projectId);
        }
        break;
      }

      case 'Notification': {
        // Forward to notification system
        try {
          const { rawDb } = await import('@/lib/db');
          rawDb.prepare(`
            INSERT INTO notifications (id, project_id, recipient, type, title, message, source_type, source_id, read_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `notif-hook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            projectId,
            'user',
            'hook',
            `Notification from ${agentId || 'agent'}`,
            body.result || 'Agent notification',
            'hook',
            null,
            null,
            now,
          );
        } catch { /* non-fatal */ }
        break;
      }

      case 'TeammateIdle': {
        // Agent Teams teammate is about to go idle — check if there's more work
        if (agent) {
          try {
            const { getProjectTasks } = await import('@/lib/db/project-queries');
            const tasks = getProjectTasks(projectId);
            const pendingTasks = tasks.filter((t) =>
              ['TODO', 'ASSIGNED', 'BACKLOG'].includes(t.status) && !t.assigned_agent
            );
            if (pendingTasks.length > 0) {
              // There's work to do — trigger relay to assign it
              triggerPostCompletionRelay(projectId);
            }
          } catch { /* non-fatal */ }

          const evt: EventRow = {
            id: `evt-idle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: now,
            level: 'info',
            agent_id: agent.agent_id,
            agent_role: agent.role,
            message: `Agent ${agent.agent_id} teammate idle`,
            details: JSON.stringify({ agentType: body.agent_type }),
          };
          insertProjectEvent(projectId, evt);
        }
        break;
      }

      case 'ApprovalRequest': {
        // Agent requests approval via hook
        if (agent) {
          try {
            const { createApproval } = await import('@/lib/db/approval-queries');
            const { secureId } = await import('@/lib/auth');
            const approvalType = (body.approval_type as string) || 'strategy_change';
            const validTypes = ['deploy', 'launch_agent', 'budget_override', 'strategy_change', 'merge'];
            if (validTypes.includes(approvalType)) {
              const approvalId = secureId('appr');
              createApproval({
                id: approvalId,
                project_id: projectId,
                type: approvalType,
                requested_by_agent: agent.agent_id,
                requested_by_role: agent.role,
                status: 'pending',
                payload: JSON.stringify({
                  description: body.description || '',
                  context: body.context || '',
                }),
                decision_by: null,
                decision_note: null,
                decided_at: null,
                expires_at: null,
                created_at: now,
              });
              eventBus.broadcast('approval.created', {
                id: approvalId, type: approvalType,
                requestedByAgent: agent.agent_id, requestedByRole: agent.role,
              }, projectId);

              // Create notification for user
              try {
                const { rawDb } = await import('@/lib/db');
                rawDb.prepare(`
                  INSERT INTO notifications (id, project_id, recipient, type, title, message, source_type, source_id, created_at)
                  VALUES (?, ?, 'user', 'approval', ?, ?, 'approval', ?, ?)
                `).run(
                  `notif-appr-${Date.now()}`, projectId,
                  `Approval needed: ${approvalType}`,
                  `${agent.role} (${agent.agent_id}) requests approval: ${body.description || approvalType}`,
                  approvalId, now,
                );
              } catch { /* non-fatal */ }
            }
          } catch { /* non-fatal */ }
        }
        break;
      }

      case 'SubagentStart': {
        // A subagent was spawned — register it immediately
        const agentType = body.agent_type || 'unknown';
        const evt: EventRow = {
          id: `evt-substart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: now,
          level: 'info',
          agent_id: agentId || agentType,
          agent_role: agent?.role || null,
          message: `Subagent started: ${agentType} (parent: ${agentId || 'unknown'})`,
          details: JSON.stringify({ sessionId, agentType }),
        };
        insertProjectEvent(projectId, evt);
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
