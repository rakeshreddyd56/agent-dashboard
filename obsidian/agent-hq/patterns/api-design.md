---
tags: [pattern, api, backend, next-js, routes]
created: 2026-03-07
updated: 2026-03-07
---

# API Design Patterns (Agent Dashboard)

## Route Structure

All routes in `src/app/api/{resource}/route.ts`. Use Next.js App Router conventions:
- `GET` — list/read
- `POST` — create/action
- `PATCH` — partial update
- `DELETE` — remove

## Standard Response Shape

```typescript
// Success
NextResponse.json({ tasks: [...] });
NextResponse.json({ ok: true });
NextResponse.json(entity, { status: 201 });

// Error
NextResponse.json({ error: 'message' }, { status: 400 });
```

## Input Validation

```typescript
const body = await req.json();
const { projectId, title } = body;

if (!projectId) {
  return NextResponse.json({ error: 'projectId required' }, { status: 400 });
}

if (status && !VALID_STATUSES.has(status)) {
  return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
}
```

## DB Access Pattern

```typescript
import { getProjectTasks, upsertProjectTask } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';

// Ensure tables exist before querying
if (!projectTablesExist(projectId)) {
  createProjectTables(projectId);
}

const tasks = getProjectTasks(projectId);
```

## Event Broadcasting

After every mutation, broadcast via event bus:
```typescript
import { eventBus } from '@/lib/events/event-bus';

eventBus.broadcast('task.created', taskData, projectId);
eventBus.broadcast('agent.updated', agentData, projectId);
```

## Undo Pattern (Tasks)

Every mutation returns undo instructions:
```typescript
return NextResponse.json({
  ...task,
  undo: {
    method: 'PATCH',
    url: '/api/tasks',
    body: { id, projectId, status: previousStatus },
    description: 'Revert task status',
  },
});
```

## Error Handling

```typescript
export async function POST(req: NextRequest) {
  try {
    // ... logic
  } catch (err) {
    console.error('POST /api/resource error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Dynamic Imports (for code splitting)

Used in hooks and launch routes to avoid loading heavy modules at startup:
```typescript
const { runAutoRelay } = await import('@/lib/coordination/relay');
const { launchAgentWithSDK } = await import('@/lib/sdk/agent-launcher');
```

## All API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/launch` | GET, POST | List/launch agents |
| `/api/agents/health` | GET | Health report |
| `/api/agent-actions` | GET, POST | Supervisor action API |
| `/api/tasks` | GET, POST, PATCH, DELETE | Task CRUD with undo |
| `/api/events` | GET | Event stream |
| `/api/hooks` | POST | Claude Code hook receiver |
| `/api/projects` | GET, POST, PATCH | Project CRUD |
| `/api/coordination` | GET, POST | Coordination file sync |
| `/api/analytics` | GET | Cost/performance stats |
| `/api/office` | GET, POST | Office state + research |
| `/api/git` | GET, POST | Git operations |
| `/api/tmux` | GET, POST | tmux session management |
| `/api/standup` | GET, POST | Auto-generated standups |
| `/api/remote-control` | GET, POST | Remote session access |
| `/api/sessions` | GET | Claude session data |
| `/api/messages` | GET, POST | Inter-agent messaging |
| `/api/notifications` | GET, PATCH | Notification system |
