---
tags: [project, clawbot, marketplace]
created: 2026-03-07
---

# Clawbot Marketplace

## Overview
- **Location:** `/Users/rakeshreddy/Downloads/Clawbot-marketplace`
- **Type:** Multi-agent orchestrated marketplace project
- **Agent Template:** `~/.claude-multi-agent-template/template/.claude/agents`

## Agents
7 agents adapted from template: architect, coder (x2), reviewer, tester, security-auditor, devops

## Key Findings (2026-03-02)
- **Security Audit**: 2 CRITICAL (hardcoded JWT, unauth WebSocket), 6 HIGH
- **Code Review**: 4 CRITICAL (header auth bypass, predictable HMAC, trivial artifact validation)
- See `reviews/` directory in project for full reports

## CLI Notes
- Must `unset CLAUDECODE` in tmux sessions
- Use `--system-prompt "$(cat file.md)"` + `-p 'task'` for agent prompts
- Individual runner scripts in `scripts/run-*.sh`

## Monitoring
- `scripts/monitor-agents.sh` — 5-minute interval checks
- `/tmp/clawbot-*.log` — agent log files
- `progress.txt` — shared progress log (append-only)
