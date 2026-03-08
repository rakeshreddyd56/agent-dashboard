---
tags: [home, index, navigation]
created: 2026-03-07
updated: 2026-03-07
---

# Agent HQ — Knowledge Base

Central knowledge vault shared by all 16 agents across all projects. Connected via `obsidian` MCP server.

## Quick Navigation

### By Project
- [[projects/agent-dashboard/architecture|Agent Dashboard Architecture]]
- [[projects/agent-dashboard/decisions|Architecture Decisions]]
- [[projects/agent-dashboard/api-reference|API Reference]]
- [[projects/agent-dashboard/deployment|Deployment Guide]]
- [[projects/clawbot-marketplace/overview|Clawbot Marketplace]]

### By Floor
- [[floors/floor-1-research/README|Floor 1 — Research & Ideation]]
- [[floors/floor-2-dev/README|Floor 2 — Development]]
- [[floors/floor-3-ops/README|Floor 3 — CI/CD & Deploy]]

### By Role
- [[agents/rataa-ops/profile|Luffy-Ops]] | [[agents/supervisor/profile|Rataa-1]] | [[agents/supervisor-2/profile|Rataa-2]]
- [[agents/architect/profile|Usopp-Architect]] | [[agents/rataa-frontend/profile|Nami-Frontend]] | [[agents/rataa-backend/profile|Franky-Backend]]
- [[agents/rataa-research/profile|Robin-Research]] | [[agents/researcher-1/profile|Chopper-Chairman]]

### References
- [[patterns/react-patterns|React Patterns]]
- [[patterns/api-design|API Design Patterns]]
- [[patterns/db-patterns|Database Patterns]]
- [[patterns/coordination-patterns|Coordination Patterns]]
- [[runbooks/incident-response|Incident Response]]
- [[runbooks/agent-launch|Agent Launch Runbook]]

---

## Vault Structure

| Folder | Purpose | Who Writes |
|--------|---------|------------|
| `projects/` | Per-project architecture, decisions, runbooks, deployment | Architect, Leads |
| `agents/` | Per-agent profile, learnings, session logs | Each agent |
| `floors/` | Per-floor coordination, handoffs, status | Floor leads |
| `patterns/` | Reusable code patterns, API designs, DB patterns | Architect, Senior devs |
| `daily/` | Daily standup summaries, progress snapshots | Supervisors |
| `runbooks/` | Operational procedures, incident response | Ops team |
| `retrospectives/` | Post-mortem analyses, sprint reviews | Rataa-2 (Quality) |
| `_coordination/` | Shared log, cross-floor handoffs | All agents |
| `_templates/` | Note templates for consistent formatting | System |

## Rules for Agents

1. **Search before writing** — use `obsidian` MCP `search_notes` before creating new notes
2. **Namespace by folder** — write to your agent folder `agents/{role}/`
3. **Tag everything** — every note needs `tags:` in frontmatter
4. **Shared log is append-only** — `_coordination/shared-log.md`
5. **Keep notes atomic** — one concept per note, use `[[wikilinks]]` between them
6. **Date your entries** — use ISO format `YYYY-MM-DD` in daily logs
