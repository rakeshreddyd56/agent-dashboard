# /full-status

Get the full status of all floors, agents, and tasks.

## Instructions

1. Call: `curl -s 'http://localhost:4000/api/agent-actions?action=full-status&projectId=PROJECT_ID'`
2. Present a structured summary:
   - Per-floor breakdown (Floor 1 Research, Floor 2 Dev, Floor 3 Ops)
   - Agent statuses and current tasks
   - Task board summary (counts by status)
   - Any warnings or recommendations
