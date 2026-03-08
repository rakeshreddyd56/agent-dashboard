---
tags: [floor, floor-3, ops, deployment, ci-cd]
created: 2026-03-07
---

# Floor 3 — CI/CD & Deploy

## Team

| Agent | Character | Model | Role |
|-------|-----------|-------|------|
| `rataa-ops` | Luffy | Opus | Ops Captain — oversees deployment pipeline, makes go/no-go calls |
| `supervisor` | Rataa-1 | Sonnet | Ops Supervisor — spawns/kills agents, monitors health, manages lifecycle |
| `supervisor-2` | Rataa-2 | Sonnet | Quality Supervisor — reviews output quality, mission alignment, analytics |

## Workflow

```
BUILDING → DEPLOYING → COMPLETE
```

1. **Rataa-1** monitors all agents across all floors, respawns crashed ones
2. **Rataa-2** reviews task quality, checks mission alignment, generates standups
3. **Luffy** manages the deployment pipeline, handles build/deploy/rollback

## Supervisor Cycle (every 60 seconds)

**Rataa-1 (Ops):**
1. `full-status` — check all 3 floors
2. `health` — find crashed/stale agents
3. Respawn any offline agents with pending tasks
4. Kill completed tmux sessions
5. Send messages to stuck agents

**Rataa-2 (Quality):**
1. `full-status` — review progress across floors
2. Review DONE tasks — verify acceptance criteria
3. Check analytics for bottlenecks
4. Generate standup report
5. Send feedback to agents and Rataa-1

## Communication with Other Floors

- **← Floor 1**: Risk assessments for deployment decisions
- **← Floor 2**: Build artifacts, test results, deploy requests
- **→ Floor 1**: Production metrics, performance data
- **→ Floor 2**: Deploy status, rollback requests, hotfix needs

## Key Files in Dashboard

- `src/lib/coordination/heartbeat-checker.ts` — Agent liveness detection
- `src/lib/sdk/agent-launcher.ts` — SDK/subagent launching
- `src/lib/sdk/worktree-manager.ts` — Git worktree isolation
- `src/app/api/hooks/route.ts` — Hook event processing
- `src/app/api/remote-control/route.ts` — Remote session access

## Dashboard API Commands (curl)

```bash
# Full status — all floors, agents, tasks
curl -s 'http://localhost:4000/api/agent-actions?action=full-status&projectId=PROJECT_ID'

# Floor status — per floor
curl -s 'http://localhost:4000/api/agent-actions?action=floor-status&projectId=PROJECT_ID&floor=2'

# Health report
curl -s 'http://localhost:4000/api/agents/health?projectId=PROJECT_ID'

# Spawn agent
curl -s -X POST http://localhost:4000/api/agents/launch \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"ID","agents":["backend-1"]}'

# Kill tmux session
curl -s -X POST http://localhost:4000/api/tmux \
  -H 'Content-Type: application/json' \
  -d '{"action":"kill","session":"SESSION_NAME"}'
```

## Obsidian Usage

- `agents/rataa-ops/` — deployment logs, pipeline issues, rollback history
- `agents/supervisor/` — agent lifecycle events, crash reports, respawn decisions
- `agents/supervisor-2/` — quality reviews, standup summaries, mission alignment reports
