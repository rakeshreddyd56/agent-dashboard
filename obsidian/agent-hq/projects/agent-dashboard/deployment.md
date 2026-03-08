---
tags: [project, agent-dashboard, deployment, vercel, ops]
created: 2026-03-07
---

# Deployment Guide — Agent Dashboard

## Local Development

```bash
cd /Users/rakeshreddy/agent-dashboard
export PATH="/usr/local/Cellar/node/24.8.0/bin:$PATH"
npm run dev      # http://localhost:4000
```

## Production Build

```bash
npm run build    # Compiles all routes, checks types
npm run start:prod
```

## Vercel Deployment

The dashboard is deployed to Vercel with these considerations:

### Environment Variables
- `PORT=4000` — dashboard port
- `NODE_ENV=production`

### Build Settings
- Framework: Next.js
- Build command: `npm run build`
- Output directory: `.next`
- Node.js version: 20.x+

### Important Notes
- SQLite DB (`data/dashboard.db`) is **local only** — Vercel uses ephemeral filesystem
- For production: need to switch to Turso/LibSQL or external SQLite
- Hooks endpoint must be accessible from agents: use Vercel URL or tunnel
- tmux agents only work on local machine, not Vercel
- SDK agents can work with Vercel if Claude CLI is available

### Vercel Logs
- Build logs: Vercel dashboard → Deployments → Build Logs
- Runtime logs: Vercel dashboard → Logs tab
- Function logs: each API route logged separately
- Error tracking: check `/api/events` for agent errors

## Health Check

```bash
curl -s http://localhost:4000/api/health
```

Returns system status, active agents, DB state.

## Rollback

```bash
# Git-based rollback
git log --oneline -5
git revert HEAD

# Vercel rollback
vercel rollback
```

## Monitoring

| What | How |
|------|-----|
| Agent health | `GET /api/agents/health?projectId=ID` |
| Build status | `npm run build` exit code |
| Event errors | `GET /api/agent-actions?action=list-events&level=error` |
| tmux sessions | `tmux ls` or `GET /api/tmux?action=list` |
| SDK sessions | Dashboard UI → Mission page |
| Costs | `GET /api/analytics?projectId=ID` |
