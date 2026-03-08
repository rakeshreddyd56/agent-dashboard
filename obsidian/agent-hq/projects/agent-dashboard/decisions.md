---
tags: [project, agent-dashboard, decisions]
created: 2026-03-07
---

# Architecture Decisions

## ADR-001: SQLite over Postgres
- **Decision**: Use better-sqlite3 with WAL mode
- **Reason**: Single-server deployment, zero infra, fast reads, per-project dynamic tables
- **Trade-off**: No concurrent write scaling, but agents write infrequently

## ADR-002: tmux as Primary Agent Runtime
- **Decision**: Each agent runs in its own tmux session
- **Reason**: Observable (capture-pane), killable, works with any CLI tool
- **Trade-off**: Overhead per session, requires tmux on host

## ADR-003: SSE over WebSocket
- **Decision**: Server-sent events for real-time updates
- **Reason**: Simpler server-side, unidirectional (server→client), auto-reconnect
- **Trade-off**: No client→server channel (use REST for that)

## ADR-004: Hooks over Polling
- **Decision**: Claude Code hooks push events to /api/hooks
- **Reason**: Real-time, no polling overhead, works for both tmux and SDK agents
- **Trade-off**: Requires curl in hook commands, dashboard must be running

## ADR-005: Obsidian as Cross-Project Knowledge Base
- **Decision**: Obsidian vault via MCP for shared knowledge
- **Reason**: Human-editable, searchable, git-backed, scales to thousands of notes
- **Trade-off**: Extra MCP server process, vault must be maintained

## ADR-006: Native Claude Memory for Agent State
- **Decision**: Use `memory: project` in agent definitions instead of custom memory layer
- **Reason**: Built-in to Claude Code, persists across sessions, per-agent isolation
- **Trade-off**: Less control over storage format, 200-line MEMORY.md limit at load
