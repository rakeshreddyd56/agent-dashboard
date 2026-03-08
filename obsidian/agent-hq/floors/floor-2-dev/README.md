---
tags: [floor, floor-2, development]
created: 2026-03-07
---

# Floor 2 — Development

## Team

| Agent | Character | Model | Role |
|-------|-----------|-------|------|
| `architect` | Usopp | Opus | System architect — designs, reviews PRs, sets standards |
| `rataa-frontend` | Nami | Opus | Frontend lead — coordinates Sanji, reviews UI/UX |
| `rataa-backend` | Franky | Opus | Backend lead — coordinates Zoro & Law, reviews APIs |
| `frontend` | Sanji | Sonnet | Frontend developer — React components, styling, state |
| `backend-1` | Zoro | Sonnet | Backend developer — APIs, DB, core logic |
| `backend-2` | Law | Sonnet | Backend developer — integrations, complex queries |
| `tester-1` | Smoker | Sonnet | Tester — integration tests, E2E, CI validation |
| `tester-2` | Tashigi | Sonnet | Tester — unit tests, edge cases, regression |

## Workflow

```
DELEGATING → DEVELOPING → TESTING
```

1. **Usopp** receives architecture proposals from Floor 1
2. **Usopp** creates technical specs, assigns tasks to leads
3. **Nami** and **Franky** break tasks down and delegate to their devs
4. **Sanji**, **Zoro**, **Law** implement in parallel (worktree-isolated)
5. **Smoker** and **Tashigi** test implementations
6. Results handed off to Floor 3 for deployment

## Communication with Other Floors

- **← Floor 1**: Research briefs, architecture proposals
- **→ Floor 3**: Build artifacts, test results, deploy requests
- **← Floor 3**: Deploy status, rollback requests, production issues

## Key Files in Dashboard

- `src/app/api/agents/launch/route.ts` — Agent launching (all modes)
- `src/lib/coordination/relay.ts` — Auto-assigns tasks to idle agents
- `src/lib/coordination/heartbeat-checker.ts` — Monitors agent liveness
- `data/office/souls/frontend.md` — Frontend agent souls
- `data/office/souls/backend.md` — Backend agent souls
- `data/office/souls/architect.md` — Architect soul

## Obsidian Usage

- `agents/architect/` — architecture decisions, PR review notes, technical specs
- `agents/rataa-frontend/` — frontend coordination, component patterns
- `agents/rataa-backend/` — backend coordination, API design notes
- `agents/frontend/` — component implementation learnings
- `agents/backend-1/` — backend implementation learnings, DB optimizations
- `agents/backend-2/` — integration notes, complex query solutions
- `agents/tester-1/` — test coverage reports, E2E findings
- `agents/tester-2/` — regression findings, edge case catalog
