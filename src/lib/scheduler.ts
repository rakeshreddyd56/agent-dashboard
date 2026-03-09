import { db, schema } from '@/lib/db';
import { eq, lt } from 'drizzle-orm';
import { AUTO_RELAY_CONFIG, OFFICE_CONFIG } from '@/lib/constants';

/**
 * Background Scheduler — Runs periodic tasks on a 60s tick loop.
 *
 * Adapted from mission-control's scheduler pattern:
 * - Each task is error-isolated (try-catch with result tracking)
 * - Tasks check their next run time on each tick
 * - Results stored in memory for status API
 */

interface ScheduledTask {
  name: string;
  intervalMs: number;
  lastRun: number | null;
  nextRun: number;
  running: boolean;
  enabled: boolean;
  lastResult?: { ok: boolean; message: string; timestamp: number };
}

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const EIGHT_HOURS = 8 * 60 * 60 * 1000;
const DAILY = 24 * 60 * 60 * 1000;
const TICK_INTERVAL = 60 * 1000; // Check every 60 seconds

const tasks = new Map<string, ScheduledTask>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

export function initScheduler() {
  if (tickTimer) return; // Already running

  const now = Date.now();

  tasks.set('heartbeat_check', {
    name: 'Agent Heartbeat Check',
    intervalMs: FIVE_MINUTES,
    lastRun: null,
    nextRun: now + FIVE_MINUTES,
    running: false,
    enabled: true,
  });

  tasks.set('analytics_cleanup', {
    name: 'Analytics Cleanup',
    intervalMs: DAILY,
    lastRun: null,
    nextRun: now + ONE_HOUR, // First run in 1 hour
    running: false,
    enabled: true,
  });

  tasks.set('sync_verification', {
    name: 'Sync Verification',
    intervalMs: TEN_MINUTES,
    lastRun: null,
    nextRun: now + TEN_MINUTES,
    running: false,
    enabled: true,
  });

  tasks.set('auto_relay', {
    name: 'Auto-Relay Agent Check',
    intervalMs: AUTO_RELAY_CONFIG.intervalMs,
    lastRun: null,
    nextRun: now + AUTO_RELAY_CONFIG.intervalMs,
    running: false,
    enabled: AUTO_RELAY_CONFIG.enabled,
  });

  // Phase 6: Office floor management
  tasks.set('office_cycle_check', {
    name: 'Office Floor Cycle',
    intervalMs: OFFICE_CONFIG.idleCheckIntervalMs,
    lastRun: null,
    nextRun: now + OFFICE_CONFIG.idleCheckIntervalMs,
    running: false,
    enabled: OFFICE_CONFIG.enabled && process.env.OFFICE_ENABLED !== 'false',
  });

  tasks.set('office_daily_comm', {
    name: 'Office Daily Communication',
    intervalMs: ONE_HOUR,
    lastRun: null,
    nextRun: now + ONE_HOUR,
    running: false,
    enabled: OFFICE_CONFIG.enabled && process.env.OFFICE_ENABLED !== 'false',
  });

  tasks.set('data_pruning', {
    name: 'Dashboard Data Pruning',
    intervalMs: EIGHT_HOURS,
    lastRun: null,
    nextRun: now + FIVE_MINUTES, // First run 5 min after startup
    running: false,
    enabled: true,
  });

  tasks.set('budget_monthly_reset', {
    name: 'Monthly Budget Reset',
    intervalMs: ONE_HOUR, // Check hourly, only acts on month boundary
    lastRun: null,
    nextRun: now + ONE_HOUR,
    running: false,
    enabled: true,
  });

  tasks.set('orphaned_runs_cleanup', {
    name: 'Orphaned Runs Cleanup',
    intervalMs: TEN_MINUTES,
    lastRun: null,
    nextRun: now + TEN_MINUTES,
    running: false,
    enabled: true,
  });

  tasks.set('stale_approvals_cleanup', {
    name: 'Stale Approvals Expiry',
    intervalMs: ONE_HOUR,
    lastRun: null,
    nextRun: now + ONE_HOUR,
    running: false,
    enabled: true,
  });

  tickTimer = setInterval(tick, TICK_INTERVAL);
}

async function tick() {
  const now = Date.now();

  for (const [key, task] of tasks) {
    if (!task.enabled || task.running || now < task.nextRun) continue;

    task.running = true;
    task.lastRun = now;
    task.nextRun = now + task.intervalMs;

    try {
      let result: { ok: boolean; message: string };

      switch (key) {
        case 'heartbeat_check':
          result = await runHeartbeatCheck();
          break;
        case 'analytics_cleanup':
          result = runAnalyticsCleanup();
          break;
        case 'sync_verification':
          result = await runSyncVerification();
          break;
        case 'auto_relay':
          result = await runAutoRelayTask();
          break;
        case 'office_cycle_check':
          result = await runOfficeCycleCheck();
          break;
        case 'office_daily_comm':
          result = await runOfficeDailyComm();
          break;
        case 'data_pruning':
          result = runDataPruning();
          break;
        case 'budget_monthly_reset':
          result = runBudgetMonthlyReset();
          break;
        case 'orphaned_runs_cleanup':
          result = await runOrphanedRunsCleanup();
          break;
        case 'stale_approvals_cleanup':
          result = runStaleApprovalsCleanup();
          break;
        default:
          result = { ok: true, message: 'Unknown task' };
      }

      task.lastResult = { ...result, timestamp: Date.now() };
    } catch (err) {
      task.lastResult = {
        ok: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
      };
    } finally {
      task.running = false;
    }
  }
}

/** Run heartbeat check — delegates to per-project heartbeat checker which
 *  actively probes tmux sessions to distinguish working agents from crashed ones. */
async function runHeartbeatCheck(): Promise<{ ok: boolean; message: string }> {
  const activeProjects = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.isActive, true))
    .all();

  if (activeProjects.length === 0) {
    return { ok: true, message: 'No active projects to check' };
  }

  let checked = 0;
  const { checkStaleAgents } = await import('@/lib/coordination/heartbeat-checker');
  for (const project of activeProjects) {
    try {
      checkStaleAgents(project.id);
      checked++;
    } catch (err) {
      console.error(`Heartbeat check failed for ${project.name}:`, err);
    }
  }

  return { ok: true, message: `Checked heartbeats for ${checked} projects` };
}

/** Delete analytics snapshots older than 30 days */
function runAnalyticsCleanup(): { ok: boolean; message: string } {
  const cutoff = new Date(Date.now() - 30 * DAILY).toISOString();

  const result = db.delete(schema.analyticsSnapshots)
    .where(lt(schema.analyticsSnapshots.timestamp, cutoff))
    .run();

  return { ok: true, message: `Cleaned up ${result.changes} old analytics snapshots` };
}

/** Re-sync active project as safety net */
async function runSyncVerification(): Promise<{ ok: boolean; message: string }> {
  const activeProject = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.isActive, true))
    .get();

  if (!activeProject) {
    return { ok: true, message: 'No active project to verify' };
  }

  try {
    // Dynamic import to avoid circular dependency
    const { syncProject } = await import('@/lib/coordination/sync-engine');
    await syncProject(activeProject as Parameters<typeof syncProject>[0]);
    return { ok: true, message: `Synced project: ${activeProject.name}` };
  } catch (err) {
    return { ok: false, message: `Sync failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** Run auto-relay check for all active projects */
async function runAutoRelayTask(): Promise<{ ok: boolean; message: string }> {
  const activeProjects = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.isActive, true))
    .all();

  if (activeProjects.length === 0) {
    return { ok: true, message: 'No active projects for relay' };
  }

  try {
    const { runAutoRelay } = await import('@/lib/coordination/relay');
    const results: string[] = [];

    for (const project of activeProjects) {
      const result = await runAutoRelay(project.id);
      if (result.relayed > 0 || result.noTasks > 0) {
        results.push(`${project.name}: ${result.relayed} relayed, ${result.skipped} skipped, ${result.noTasks} no-tasks`);
      }
    }

    return {
      ok: true,
      message: results.length > 0 ? results.join('; ') : 'No relay actions needed',
    };
  } catch (err) {
    return { ok: false, message: `Relay failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** Run office cycle check for all active projects */
async function runOfficeCycleCheck(): Promise<{ ok: boolean; message: string }> {
  const activeProjects = db.select().from(schema.projects)
    .where(eq(schema.projects.isActive, true)).all();

  if (activeProjects.length === 0) {
    return { ok: true, message: 'No active projects for office' };
  }

  try {
    const { runOfficeCycle } = await import('@/lib/office/floor-managers');
    const results: string[] = [];

    for (const project of activeProjects) {
      const result = await runOfficeCycle(project.id);
      if (result.stateTransition) {
        results.push(`${project.name}: ${result.stateTransition.from} → ${result.stateTransition.to}`);
      }
    }

    return { ok: true, message: results.length > 0 ? results.join('; ') : 'No office transitions' };
  } catch (err) {
    return { ok: false, message: `Office cycle error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** Run office daily communication at EOD */
async function runOfficeDailyComm(): Promise<{ ok: boolean; message: string }> {
  const hour = new Date().getHours();
  if (hour !== OFFICE_CONFIG.eodCommunicationHour) {
    return { ok: true, message: 'Not EOD communication time' };
  }

  const activeProjects = db.select().from(schema.projects)
    .where(eq(schema.projects.isActive, true)).all();

  try {
    const { runDailyCommunication } = await import('@/lib/office/floor-managers');
    for (const project of activeProjects) {
      await runDailyCommunication(project.id);
    }
    return { ok: true, message: `Daily comms sent for ${activeProjects.length} projects` };
  } catch (err) {
    return { ok: false, message: `Daily comm error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/**
 * Prune old operational data from high-volume tables.
 * Does NOT touch project coordination files.
 *
 * Schedule: every 8 hours, first run 5 min after startup.
 *
 * Retention:
 *   3 days — notifications, messages, floor_communications, events
 *   7 days — audit_log, standup_reports, analytics_snapshots
 *   1 day  — completed/offline agent_snapshots (keeps latest per agent)
 *   3 days — per-project _events tables
 *   7 days — per-project _analytics tables
 */
function runDataPruning(): { ok: boolean; message: string } {
  // Use rawDb lazily to avoid circular import during init
  const { rawDb: sqlite } = require('@/lib/db');
  let totalDeleted = 0;

  // Shared tables: [table, column, days]
  const rules: [string, string, number][] = [
    ['notifications',        'created_at', 3],
    ['messages',             'created_at', 3],
    ['floor_communications', 'created_at', 3],
    ['events',               'timestamp',  3],
    ['audit_log',            'created_at', 7],
    ['standup_reports',      'created_at', 7],
    ['analytics_snapshots',  'timestamp',  7],
    ['cost_events',          'occurred_at', 90],
    ['approvals',            'created_at', 30],
    ['agent_runs',           'created_at', 30],
  ];

  for (const [table, col, days] of rules) {
    try {
      const cutoff = new Date(Date.now() - days * DAILY).toISOString();
      const result = sqlite.prepare(
        `DELETE FROM "${table}" WHERE "${col}" < ?`
      ).run(cutoff);
      totalDeleted += result.changes;
    } catch { /* table may not exist yet */ }
  }

  // Stale agent snapshots — keep only latest per agent+project
  try {
    const result = sqlite.prepare(`
      DELETE FROM agent_snapshots
      WHERE status IN ('completed', 'offline', 'crashed')
      AND created_at < datetime('now', '-1 day')
      AND id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY agent_id, project_id ORDER BY created_at DESC
          ) as rn FROM agent_snapshots
        ) ranked WHERE rn = 1
      )
    `).run();
    totalDeleted += result.changes;
  } catch { /* non-fatal */ }

  // Per-project dynamic tables
  try {
    const eventTables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_events'"
    ).all() as { name: string }[];
    for (const { name } of eventTables) {
      try {
        const r = sqlite.prepare(
          `DELETE FROM "${name}" WHERE "timestamp" < datetime('now', '-3 days')`
        ).run();
        totalDeleted += r.changes;
      } catch { /* non-fatal */ }
    }

    const analyticsTables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_analytics'"
    ).all() as { name: string }[];
    for (const { name } of analyticsTables) {
      try {
        const r = sqlite.prepare(
          `DELETE FROM "${name}" WHERE "timestamp" < datetime('now', '-7 days')`
        ).run();
        totalDeleted += r.changes;
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }

  return { ok: true, message: `Pruned ${totalDeleted} rows` };
}

/** Reset monthly budgets when the month changes */
function runBudgetMonthlyReset(): { ok: boolean; message: string } {
  try {
    const { resetMonthlyBudgets } = require('@/lib/db/budget-queries');
    const created = resetMonthlyBudgets();
    return { ok: true, message: created > 0 ? `Reset ${created} budgets for new month` : 'No budget resets needed' };
  } catch (err) {
    return { ok: false, message: `Budget reset error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** Finalize orphaned runs (running but agent is offline) */
async function runOrphanedRunsCleanup(): Promise<{ ok: boolean; message: string }> {
  const activeProjects = db.select().from(schema.projects)
    .where(eq(schema.projects.isActive, true)).all();

  let totalFinalized = 0;
  for (const project of activeProjects) {
    try {
      const { getProjectAgents } = await import('@/lib/db/project-queries');
      const { finalizeOrphanedRuns } = await import('@/lib/db/run-queries');
      const agents = getProjectAgents(project.id);
      const activeIds = agents
        .filter(a => ['working', 'initializing', 'idle'].includes(a.status))
        .map(a => a.agent_id);
      totalFinalized += finalizeOrphanedRuns(project.id, activeIds);
    } catch { /* non-fatal */ }
  }

  return { ok: true, message: totalFinalized > 0 ? `Finalized ${totalFinalized} orphaned runs` : 'No orphaned runs' };
}

/** Expire stale pending approvals (older than 24h) */
function runStaleApprovalsCleanup(): { ok: boolean; message: string } {
  try {
    const { expireStaleApprovals } = require('@/lib/db/approval-queries');
    const expired = expireStaleApprovals();
    return { ok: true, message: expired > 0 ? `Expired ${expired} stale approvals` : 'No stale approvals' };
  } catch (err) {
    return { ok: false, message: `Approval cleanup error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** Get status of all scheduled tasks (for API) */
export function getSchedulerStatus() {
  const status: Record<string, {
    name: string;
    intervalMs: number;
    lastRun: number | null;
    nextRun: number;
    running: boolean;
    enabled: boolean;
    lastResult?: { ok: boolean; message: string; timestamp: number };
  }> = {};

  for (const [key, task] of tasks) {
    status[key] = { ...task };
  }

  return status;
}

/** Manually trigger a scheduled task */
export async function triggerTask(taskKey: string): Promise<{ ok: boolean; message: string }> {
  const task = tasks.get(taskKey);
  if (!task) return { ok: false, message: `Unknown task: ${taskKey}` };
  if (task.running) return { ok: false, message: `Task ${taskKey} is already running` };

  // Force next run to now
  task.nextRun = 0;
  await tick();

  return task.lastResult || { ok: true, message: 'Triggered' };
}
