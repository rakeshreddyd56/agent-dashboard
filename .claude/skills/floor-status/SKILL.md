# /floor-status [1|2|3]

Check the status of a specific floor.

## Instructions

1. Parse the floor number from the argument (1=Research, 2=Dev, 3=Ops). If no number given, show all 3 floors.
2. Call: `curl -s 'http://localhost:4000/api/agent-actions?action=floor-status&projectId=PROJECT_ID&floor=FLOOR_NUM'`
3. Summarize the response: agents on the floor, their status, current tasks, and any issues.
