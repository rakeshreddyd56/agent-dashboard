#!/usr/bin/env node
/**
 * Dashboard Data Pruner
 *
 * Cleans high-volume operational tables that grow indefinitely.
 * Safe to run frequently — only deletes old ephemeral data.
 * Does NOT touch project coordination files (TASKS.md, registry.json, etc).
 *
 * Usage: node scripts/prune-dashboard.mjs [--dry-run]
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || './data/dashboard.db';
const DRY_RUN = process.argv.includes('--dry-run');

const dbPath = path.resolve(DB_PATH);
if (!fs.existsSync(dbPath)) {
  console.log('No database found at', dbPath);
  process.exit(0);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Pruning rules: [table, column, days, description]
const PRUNE_RULES = [
  ['notifications',        'created_at',  3, 'notifications'],
  ['messages',             'created_at',  3, 'inter-agent messages'],
  ['floor_communications', 'created_at',  3, 'floor communications'],
  ['audit_log',            'created_at',  7, 'audit log entries'],
  ['standup_reports',      'created_at',  7, 'standup reports'],
  ['events',               'timestamp',   3, 'events (tightened from 7d)'],
  ['analytics_snapshots',  'timestamp',   7, 'analytics snapshots (tightened from 30d)'],
];

console.log(`Dashboard Pruner — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
console.log(`Database: ${dbPath}`);
console.log('---');

let totalDeleted = 0;

for (const [table, column, days, desc] of PRUNE_RULES) {
  try {
    // Check table exists
    const exists = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!exists) continue;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    if (DRY_RUN) {
      const count = db.prepare(
        `SELECT COUNT(*) as cnt FROM "${table}" WHERE "${column}" < ?`
      ).get(cutoff);
      console.log(`[DRY] ${desc}: ${count.cnt} rows older than ${days}d`);
      totalDeleted += count.cnt;
    } else {
      const result = db.prepare(
        `DELETE FROM "${table}" WHERE "${column}" < ?`
      ).run(cutoff);
      console.log(`${desc}: deleted ${result.changes} rows (older than ${days}d)`);
      totalDeleted += result.changes;
    }
  } catch (err) {
    console.error(`Error pruning ${table}:`, err.message);
  }
}

// Prune completed/offline agent snapshots — keep only the latest per agent per project
try {
  const exists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_snapshots'"
  ).get();
  if (exists) {
    if (DRY_RUN) {
      const count = db.prepare(`
        SELECT COUNT(*) as cnt FROM agent_snapshots
        WHERE status IN ('completed', 'offline', 'crashed')
        AND created_at < datetime('now', '-1 day')
        AND id NOT IN (
          SELECT id FROM agent_snapshots AS a2
          WHERE a2.agent_id = agent_snapshots.agent_id
          AND a2.project_id = agent_snapshots.project_id
          ORDER BY a2.created_at DESC LIMIT 1
        )
      `).get();
      console.log(`[DRY] stale agent snapshots: ${count.cnt} rows`);
      totalDeleted += count.cnt;
    } else {
      const result = db.prepare(`
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
      console.log(`stale agent snapshots: deleted ${result.changes} rows`);
      totalDeleted += result.changes;
    }
  }
} catch (err) {
  console.error('Error pruning agent_snapshots:', err.message);
}

// Prune per-project dynamic tables (events, analytics, task_comments)
try {
  const projectTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_events'"
  ).all();
  for (const { name } of projectTables) {
    if (DRY_RUN) {
      const count = db.prepare(
        `SELECT COUNT(*) as cnt FROM "${name}" WHERE "timestamp" < datetime('now', '-3 days')`
      ).get();
      if (count.cnt > 0) console.log(`[DRY] ${name}: ${count.cnt} rows older than 3d`);
      totalDeleted += count.cnt;
    } else {
      const result = db.prepare(
        `DELETE FROM "${name}" WHERE "timestamp" < datetime('now', '-3 days')`
      ).run();
      if (result.changes > 0) console.log(`${name}: deleted ${result.changes} rows`);
      totalDeleted += result.changes;
    }
  }

  const analyticsTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_analytics'"
  ).all();
  for (const { name } of analyticsTables) {
    if (DRY_RUN) {
      const count = db.prepare(
        `SELECT COUNT(*) as cnt FROM "${name}" WHERE "timestamp" < datetime('now', '-7 days')`
      ).get();
      if (count.cnt > 0) console.log(`[DRY] ${name}: ${count.cnt} rows older than 7d`);
      totalDeleted += count.cnt;
    } else {
      const result = db.prepare(
        `DELETE FROM "${name}" WHERE "timestamp" < datetime('now', '-7 days')`
      ).run();
      if (result.changes > 0) console.log(`${name}: deleted ${result.changes} rows`);
      totalDeleted += result.changes;
    }
  }
} catch (err) {
  console.error('Error pruning per-project tables:', err.message);
}

// Vacuum if we deleted a significant amount
if (!DRY_RUN && totalDeleted > 100) {
  console.log('Running VACUUM to reclaim space...');
  db.exec('VACUUM');
}

console.log(`---\nTotal: ${totalDeleted} rows ${DRY_RUN ? 'would be' : ''} pruned`);
db.close();
