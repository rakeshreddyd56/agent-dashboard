---
tags: [runbook, ops, agent, launch]
created: 2026-03-07
---

# Runbook: Launching Agents

## From Dashboard UI

1. Navigate to http://localhost:4000/mission
2. Select agents from the role grid
3. Choose launch mode (tmux / SDK / Teams)
4. Optionally enable worktree isolation
5. Click "Launch Selected" or "Launch All"

## From CLI (curl)

### Single Agent
```bash
curl -s -X POST http://localhost:4000/api/agents/launch \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"YOUR_PROJECT_ID","agents":["architect"]}'
```

### Multiple Agents
```bash
curl -s -X POST http://localhost:4000/api/agents/launch \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"ID","agents":["architect","frontend","backend-1","tester-1"]}'
```

### With Task Assignment
```bash
curl -s -X POST http://localhost:4000/api/agents/launch \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"ID","agents":["backend-1"],"task":{"id":"TASK-001","title":"Implement auth"}}'
```

### SDK Mode
```bash
curl -s -X POST http://localhost:4000/api/agents/launch \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"ID","agents":["architect"],"launchMode":"sdk"}'
```

### Teams Mode (Subagents)
```bash
curl -s -X POST http://localhost:4000/api/agents/launch \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"ID","agents":["architect","frontend","backend-1"],"launchMode":"subagents"}'
```

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| Agent stuck in "initializing" | `tmux capture-pane -t session -p` | Kill and relaunch |
| "Max concurrent SDK agents" | Check `getActiveSDKSessionCount()` | Cancel idle sessions |
| Script not found | `ls scripts/run-{role}.sh` | Will auto-generate on launch |
| tmux session exists but agent offline | `tmux ls` vs DB status | Kill stale session first |
