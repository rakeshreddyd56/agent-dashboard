# Agent Dashboard

Multi-agent orchestration dashboard built with Next.js 16, React 19, SQLite (better-sqlite3 + Drizzle), Zustand, Recharts, and dnd-kit.

## Build & Run

```bash
# Requires Node >= 20.9
PATH="/usr/local/Cellar/node/24.8.0/bin:$PATH"
npm run dev          # Dev server on port 4000
npm run build        # Production build
npm run start:prod   # Production start
```

## Architecture

- **API Routes:** `src/app/api/` — agents, analytics, coordination, events, git, projects, sessions, tasks, tmux, hooks, remote-control
- **DB:** SQLite at `data/dashboard.db` with WAL mode. Per-project dynamic tables (`{prefix}_agents`, `{prefix}_tasks`, etc.)
- **Event Bus:** `src/lib/events/event-bus.ts` — all domain events flow through `eventBus.broadcast()`
- **SSE:** `src/lib/sse/emitter.ts` — maps event bus events to SSE for client
- **Coordination:** `.claude/coordination/` in each project — `registry.json`, `TASKS.md`, `progress.txt`, `mission.json`
- **Agent Launch:** tmux-based (default) or SDK-based. Scripts in `scripts/run-{role}.sh`

## Conventions

- IDs: `{projectId}-{agentId}` for agents, UUID-like for tasks/events
- Timestamps: ISO 8601 strings
- Status enums: See `src/lib/types.ts` for `AgentStatus`, `TaskStatus`
- New columns must have defaults for backward compat (ALTER TABLE migration pattern)
- Event bus types defined in `src/lib/events/event-bus.ts`, SSE mapping in `src/lib/sse/emitter.ts`

## Agent Roles (One Piece Theme)

- Floor 1 (Research): rataa-research (Robin), researcher-1..4
- Floor 2 (Dev): rataa-frontend (Nami), rataa-backend (Franky), architect (Usopp), frontend (Sanji), backend-1 (Zoro), backend-2 (Law), tester-1 (Smoker), tester-2 (Tashigi)
- Floor 3 (Ops): rataa-ops (Luffy), supervisor (Rataa-1), supervisor-2 (Rataa-2)

## Key Files

- `src/lib/db/dynamic-tables.ts` — per-project table creation/migration
- `src/lib/db/project-queries.ts` — typed CRUD for project tables
- `src/lib/coordination/heartbeat-checker.ts` — agent liveness detection
- `src/app/api/agents/launch/route.ts` — tmux/SDK agent launching
- `src/lib/sdk/agent-launcher.ts` — SDK-based agent spawning
- `src/lib/sdk/worktree-manager.ts` — git worktree isolation
