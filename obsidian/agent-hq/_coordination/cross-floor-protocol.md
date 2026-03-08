---
tags: [coordination, protocol, cross-floor, communication]
created: 2026-03-07
---

# Cross-Floor Communication Protocol

## Floor 1 → Floor 2 (Research → Development)

**When:** Research synthesis is complete, ideas are voted on.

**Handoff Contents:**
- Research brief with key findings
- Architecture proposal (from Robin)
- Technology recommendations
- Risk assessment summary (from Jinbe)
- Prototype opportunities (from Carrot)

**How:**
1. Robin writes synthesis to `agents/rataa-research/`
2. Robin appends handoff note to `_coordination/shared-log.md`
3. Usopp (architect) picks up, creates technical specs
4. Dashboard: task created with status `TODO`, assigned to Floor 2 agent

## Floor 2 → Floor 3 (Development → Deployment)

**When:** Features are implemented and tested.

**Handoff Contents:**
- Build artifact (passing build)
- Test results (from Smoker/Tashigi)
- Changed files list
- Deploy readiness assessment

**How:**
1. Tester marks task as `TESTED`
2. Rataa-2 reviews quality, approves → `DONE`
3. Luffy picks up for deployment
4. Dashboard: hook fires `TaskCompleted`, relay triggers

## Floor 3 → Floor 1 (Deployment → Research)

**When:** Production data reveals new insights or issues.

**Handoff Contents:**
- Performance metrics
- User feedback
- Production incidents
- Scaling observations

**How:**
1. Luffy/Rataa-1 writes observation to `agents/rataa-ops/`
2. Appends to `_coordination/shared-log.md`
3. Robin picks up in next research cycle

## Emergency Communication

For urgent issues (production down, security vulnerability):
1. Use `send-message` API to directly message the relevant agent
2. Use `broadcast` to notify all agents
3. Log to `_coordination/shared-log.md` with `URGENT:` prefix
