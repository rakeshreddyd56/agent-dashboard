---
tags: [pattern, coordination, agents, relay, heartbeat]
created: 2026-03-07
---

# Coordination Patterns

## Event Bus → SSE Pipeline

All domain events flow through a single pipeline:
```
Agent action → eventBus.broadcast() → SSE emitter → Client store update
```

Event types defined in `src/lib/events/event-bus.ts` (30+ types).
SSE mapping in `src/lib/sse/emitter.ts`.

## Heartbeat Detection

`src/lib/coordination/heartbeat-checker.ts`

- **tmux agents**: probe tmux session existence + check heartbeat age
- **SDK/hook agents**: only check heartbeat age (no tmux probing)
- **Supervisors**: always get heartbeat refreshed, never marked completed
- Thresholds: healthy < 60s, warning < 5min, stale > 5min

## Auto-Relay

`src/lib/coordination/relay.ts`

When an agent completes, relay finds the next pending task and launches a new agent:
1. Find agents with status `completed` or `idle`
2. Find tasks with status `TODO` or `BACKLOG` without `assigned_agent`
3. Launch agent via tmux with the task
4. Cooldown: 30s between relays per agent

## Hook-Based Updates

Hooks fire on every Claude Code action:
```
Agent uses tool → PostToolUse hook → curl POST /api/hooks → DB heartbeat refresh → SSE broadcast
```

Debounced: skip if last refresh was < 5 seconds ago.

## File-Based Coordination

In each project's `.claude/coordination/`:
- `registry.json` — who's running, what they're doing
- `TASKS.md` — task definitions with status markers
- `progress.txt` — append-only log
- `mission.json` — current mission goal

## Undo Pattern

Every task mutation returns undo instructions:
```json
{
  "undo": {
    "method": "PATCH",
    "url": "/api/tasks",
    "body": { "id": "...", "status": "previous-status" },
    "description": "Revert task status"
  }
}
```

## Launch Modes

| Mode | Process | Coordination | Best For |
|------|---------|-------------|----------|
| tmux | One tmux session per agent | File-based + hooks | Observable, killable |
| sdk | One `execFile` per agent | Hooks only | Programmatic, no tmux needed |
| subagents | Single process, `--agents` flag | Native Claude teams | Tight coordination |
