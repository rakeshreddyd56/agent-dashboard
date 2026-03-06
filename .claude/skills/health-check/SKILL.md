# /health-check

Run a health check on all agents.

## Instructions

1. Call the health endpoint: `curl -s 'http://localhost:4000/api/agents/health?projectId=PROJECT_ID'`
2. Parse the JSON response and summarize:
   - Total agents, healthy count, warning count, critical count
   - List any agents with issues (stale heartbeat, offline, blocked)
   - Recommendations from the health report
3. Present a concise summary to the user.
