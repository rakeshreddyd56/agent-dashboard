---
tags: [project, agent-dashboard, architecture]
created: 2026-03-07
---

# Agent Dashboard Architecture

Multi-agent orchestration dashboard for managing Claude Code agent teams.

## Stack
- Next.js 16, React 19, TypeScript
- SQLite (better-sqlite3 + Drizzle ORM) — WAL mode
- Zustand state management
- Recharts for analytics
- dnd-kit for drag-and-drop board
- SSE for real-time updates

## Key Directories
- `src/app/api/` — API routes (agents, analytics, coordination, events, git, hooks, projects, sessions, tasks, tmux, remote-control)
- `src/lib/db/` — Database layer (dynamic per-project tables)
- `src/lib/coordination/` — Agent coordination (heartbeat, relay, stats)
- `src/lib/sdk/` — SDK launcher, worktree manager, teams bridge
- `src/lib/events/` — Event bus for domain events
- `src/lib/sse/` — Server-sent events emitter
- `src/components/` — React components (analytics, board, shared, ui)

## Agent Floors
- **Floor 1 (Research)**: rataa-research, researcher-1..4
- **Floor 2 (Development)**: rataa-frontend, rataa-backend, architect, frontend, backend-1, backend-2, tester-1, tester-2
- **Floor 3 (Ops)**: rataa-ops, supervisor, supervisor-2

## Coordination Files
- `registry.json` — active agent registry
- `TASKS.md` — task assignments with status/priority
- `progress.txt` — append-only progress log
- `mission.json` — current mission definition
- `state.json` — spatial state for office view
- `locks.json` — file locks per agent
- `undo-log.json` — mutation undo instructions

## DB Pattern
Per-project dynamic tables: `{prefix}_agents`, `{prefix}_tasks`, `{prefix}_events`, `{prefix}_analytics`
Columns added via ALTER TABLE migrations with defaults for backward compat.

## Launch Modes
1. **tmux** — traditional, one tmux session per agent
2. **sdk** — single Claude CLI process via `execFile`
3. **subagents** — `--agents` flag with native Claude coordination
