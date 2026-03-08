---
tags: [project, agent-dashboard, api, reference]
created: 2026-03-07
---

# Agent Dashboard — API Reference

Base URL: `http://localhost:4000`

## Agent APIs

### GET /api/agents/launch?projectId=ID
Returns available agent scripts, templates, active tmux sessions.

### POST /api/agents/launch
Launch agents in any mode.
```json
{
  "projectId": "string",
  "agents": ["architect", "frontend", "backend-1"],
  "launchMode": "tmux" | "sdk" | "subagents",
  "useWorktree": false,
  "task": { "id": "TASK-001", "title": "Implement auth" }
}
```
- `tmux` — one tmux session per agent (default)
- `sdk` — single CLI process via execFile
- `subagents` — `--agents` flag, lead coordinates team

### GET /api/agents/health?projectId=ID
Health report: crashes, stale heartbeats, recommendations.

## Task APIs

### GET /api/tasks?projectId=ID
List all tasks for project. Deduplicates by externalId.

### POST /api/tasks
Create task. Returns `undo` instructions.
```json
{
  "projectId": "string",
  "title": "string",
  "status": "TODO",
  "priority": "P1",
  "assignedAgent": "backend-1"
}
```

### PATCH /api/tasks
Update task. Returns `undo` with previous values.
```json
{ "id": "task-id", "projectId": "string", "status": "DONE" }
```

### DELETE /api/tasks?id=ID&projectId=ID
Delete task. Returns `undo` with full recreation payload.

## Agent Actions (Supervisor API)

### GET /api/agent-actions?action=ACTION&projectId=ID

| Action | Description |
|--------|-------------|
| `full-status` | All floors, agents, tasks |
| `floor-status&floor=N` | Per-floor agents and tasks |
| `board-summary` | Task counts by status |
| `list-tasks&status=STATUS` | Tasks filtered by status |
| `get-task&taskId=ID` | Single task with comments |
| `list-events&level=error&limit=30` | Filtered events |
| `capture-output&agentId=ID&lines=30` | Live tmux output |
| `read-mission` | Current mission |
| `list-conversations` | Inter-agent messages |

### POST /api/agent-actions
```json
{ "action": "move-task", "projectId": "ID", "taskId": "ID", "status": "DONE", "agentId": "supervisor" }
{ "action": "create-task", "projectId": "ID", "title": "Title", "status": "TODO", "priority": "P1" }
{ "action": "comment-task", "projectId": "ID", "taskId": "ID", "content": "Comment", "agentId": "supervisor" }
{ "action": "send-message", "projectId": "ID", "fromAgent": "supervisor", "toAgent": "backend-1", "content": "Message" }
```

## Hooks API

### POST /api/hooks
Receives Claude Code hook events. Payload:
```json
{
  "type": "PostToolUse" | "Stop" | "TaskCompleted" | "TeammateIdle" | "SubagentStart" | "SubagentStop" | "Notification",
  "session_id": "string",
  "agent_id": "string",
  "project_id": "string",
  "tool_name": "string",
  "timestamp": "ISO8601"
}
```

## Office API

### GET /api/office?projectId=ID
Returns office state, floor statuses, spatial agent positions, council members, sessions.

### POST /api/office
```json
{ "projectId": "ID", "action": "trigger_research" }
```

## Other APIs

| Route | Purpose |
|-------|---------|
| `GET /api/projects` | List all projects |
| `GET /api/events?projectId=ID` | Event stream |
| `GET /api/analytics?projectId=ID` | Cost/performance analytics |
| `GET /api/coordination?projectId=ID` | Coordination file status |
| `POST /api/git` | Git operations (commit, push, status) |
| `GET /api/tmux?action=list` | List tmux sessions |
| `POST /api/tmux` | Kill tmux sessions |
| `GET /api/standup?projectId=ID` | Generated standup report |
| `GET /api/remote-control?projectId=ID` | List remote-controllable sessions |

## Task Statuses
`BACKLOG → TODO → ASSIGNED → IN_PROGRESS → REVIEW → QUALITY_REVIEW → TESTING → FAILED → TESTED → DONE`

## Agent Statuses
`initializing → working → reviewing → blocked → completed → idle → offline`
