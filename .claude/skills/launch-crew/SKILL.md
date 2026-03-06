# /launch-crew

Launch the agent crew for a project.

## Instructions

1. Read the current mission: `curl -s 'http://localhost:4000/api/mission?projectId=PROJECT_ID'`
2. Check which agents are already running: `curl -s 'http://localhost:4000/api/agents/launch?projectId=PROJECT_ID'`
3. Launch the selected agents: `curl -s -X POST http://localhost:4000/api/agents/launch -H 'Content-Type: application/json' -d '{"projectId":"PROJECT_ID","agents":["ROLE1","ROLE2"]}'`
4. Report the launch results to the user.

If no project ID is specified, check the active project from the settings page or ask the user.

Available roles: rataa-research, researcher-1, researcher-2, researcher-3, researcher-4, rataa-frontend, rataa-backend, architect, frontend, backend-1, backend-2, tester-1, tester-2, rataa-ops, supervisor, supervisor-2
