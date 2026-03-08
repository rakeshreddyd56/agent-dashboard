---
tags: [pattern, database, sqlite, drizzle]
created: 2026-03-07
---

# Database Patterns

## Dynamic Per-Project Tables

Each project gets its own set of tables with a sanitized prefix:
```
{prefix}_agents
{prefix}_tasks
{prefix}_events
{prefix}_analytics
{prefix}_comments
{prefix}_file_locks
```

Created by `createProjectTables(projectId)` in `src/lib/db/dynamic-tables.ts`.

## Migration Pattern (Adding Columns)

Always use ALTER TABLE with defaults for backward compatibility:
```typescript
try {
  rawDb.exec(`ALTER TABLE ${table} ADD COLUMN new_col TEXT DEFAULT NULL`);
} catch {
  // Column already exists — ignore
}
```

## ID Conventions

| Entity | Format | Example |
|--------|--------|---------|
| Agent ID | `{projectId}-{role}` | `proj1-backend-1` |
| Task ID | `{projectId}-dash-{timestamp}-{random}` | `proj1-dash-1709-abc` |
| Event ID | `evt-{source}-{timestamp}-{random}` | `evt-sdk-done-1709-xyz` |
| Session ID | `sdk-{role}-{timestamp}-{random}` | `sdk-architect-1709-ab` |

## Upsert Pattern

```typescript
upsertProjectAgent(projectId, {
  id: `${projectId}-${agentId}`,
  agent_id: agentId,
  role,
  status: 'working',
  // ... all fields required
});
```

Uses `INSERT OR REPLACE` — must provide ALL columns.

## JSON-in-SQLite

Arrays stored as JSON strings:
```typescript
// Write
tags: JSON.stringify(['tag1', 'tag2'])
// Read
tags: JSON.parse(row.tags || '[]')
```

## WAL Mode

Database uses Write-Ahead Logging for concurrent reads:
```typescript
rawDb.pragma('journal_mode = WAL');
```
