---
tags: [runbook, ops, incident, troubleshooting]
created: 2026-03-07
---

# Runbook: Incident Response

## Agent Crash

1. Check health: `curl -s 'http://localhost:4000/api/agents/health?projectId=ID'`
2. Check events: `curl -s 'http://localhost:4000/api/agent-actions?action=list-events&projectId=ID&level=error&limit=10'`
3. Capture last output: `curl -s 'http://localhost:4000/api/agent-actions?action=capture-output&projectId=ID&agentId=ROLE&lines=50'`
4. Kill stale session: `tmux kill-session -t session-name`
5. Relaunch: `curl -s -X POST http://localhost:4000/api/agents/launch -H 'Content-Type: application/json' -d '{"projectId":"ID","agents":["ROLE"]}'`

## Build Failure

1. Check build: `npm run build 2>&1 | tail -20`
2. Type check: `./node_modules/.bin/tsc --noEmit 2>&1 | head -20`
3. Fix errors
4. Re-run build

## Database Issues

1. Check DB exists: `ls data/dashboard.db`
2. Check WAL mode: `sqlite3 data/dashboard.db "PRAGMA journal_mode;"`
3. Check tables: `sqlite3 data/dashboard.db ".tables"`
4. Backup: `cp data/dashboard.db data/dashboard.db.bak`

## All Agents Down

1. Kill all tmux: `tmux kill-server` (destructive — only if needed)
2. Clear stale DB entries: set all agents to `offline` via PATCH
3. Relaunch from mission page

## Dashboard Won't Start

1. Check port: `lsof -i :4000`
2. Kill existing: `kill -9 $(lsof -t -i :4000)`
3. Check Node version: `node -v` (need >= 20.9)
4. Reinstall deps: `rm -rf node_modules && npm install`
5. Restart: `npm run dev`
