import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { TaskStatus, TaskPriority, AgentRole, AgentStatus, EventLevel } from '@/lib/types';

const DEMO_PROJECT_ID = 'demo-project';

function genId(prefix: string, i: number): string {
  return `${DEMO_PROJECT_ID}-${prefix}-${i}`;
}

export function seedDemoData() {
  // Check if demo project already exists
  const existing = db.select().from(schema.projects).where(eq(schema.projects.id, DEMO_PROJECT_ID)).get();
  if (existing) return;

  const now = new Date().toISOString();

  // Create demo project
  db.insert(schema.projects).values({
    id: DEMO_PROJECT_ID,
    name: '[Demo] Sample Project',
    path: '/tmp/demo-project',
    coordinationPath: '/tmp/demo-project/.claude/coordination',
    isActive: false,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Seed agents
  const agentDefs: { role: AgentRole; status: AgentStatus; model: string; task?: string }[] = [
    { role: 'architect', status: 'planning', model: 'claude-opus-4-6', task: 'Design API schema' },
    { role: 'frontend', status: 'working', model: 'claude-sonnet-4-6', task: 'Build dashboard UI' },
    { role: 'backend-1', status: 'working', model: 'claude-sonnet-4-6', task: 'Implement user auth' },
    { role: 'backend-2', status: 'working', model: 'claude-sonnet-4-6', task: 'Build payment integration' },
    { role: 'rataa-frontend', status: 'reviewing', model: 'claude-opus-4-6', task: 'Review PR #42' },
    { role: 'tester-1', status: 'working', model: 'claude-sonnet-4-6', task: 'Write e2e tests for auth' },
    { role: 'rataa-ops', status: 'completed', model: 'claude-opus-4-6', task: 'Set up CI pipeline' },
  ];

  for (let i = 0; i < agentDefs.length; i++) {
    const a = agentDefs[i];
    const hoursAgo = Math.floor(Math.random() * 60);
    db.insert(schema.agentSnapshots).values({
      id: genId('agent', i),
      projectId: DEMO_PROJECT_ID,
      agentId: a.role,
      role: a.role,
      status: a.status,
      currentTask: a.task,
      model: a.model,
      sessionStart: new Date(Date.now() - 3600000 * 3).toISOString(),
      lastHeartbeat: new Date(Date.now() - hoursAgo * 1000).toISOString(),
      lockedFiles: '[]',
      progress: Math.floor(Math.random() * 100),
      estimatedCost: Math.round(Math.random() * 5 * 100) / 100,
      createdAt: now,
    }).run();
  }

  // Seed tasks across all statuses
  const taskDefs: { title: string; status: TaskStatus; priority: TaskPriority; agent?: string; tags: string[] }[] = [
    { title: 'Set up monorepo structure', status: 'DONE', priority: 'P0', agent: 'architect', tags: ['setup'] },
    { title: 'Design database schema', status: 'DONE', priority: 'P0', agent: 'architect', tags: ['database'] },
    { title: 'Implement user authentication', status: 'IN_PROGRESS', priority: 'P0', agent: 'backend-1', tags: ['auth', 'security'] },
    { title: 'Build payment integration', status: 'IN_PROGRESS', priority: 'P1', agent: 'backend-2', tags: ['payments'] },
    { title: 'Create admin dashboard UI', status: 'TODO', priority: 'P1', tags: ['frontend', 'admin'] },
    { title: 'Write API documentation', status: 'TODO', priority: 'P2', tags: ['docs'] },
    { title: 'Review authentication PR', status: 'REVIEW', priority: 'P0', agent: 'rataa-frontend', tags: ['auth', 'review'] },
    { title: 'E2E tests for auth flow', status: 'TESTING', priority: 'P1', agent: 'tester-1', tags: ['testing', 'auth'] },
    { title: 'Set up CI/CD pipeline', status: 'DONE', priority: 'P1', agent: 'rataa-ops', tags: ['devops', 'ci'] },
    { title: 'Security audit: JWT implementation', status: 'BACKLOG', priority: 'P0', tags: ['security'] },
    { title: 'Add rate limiting middleware', status: 'BACKLOG', priority: 'P1', tags: ['security', 'api'] },
    { title: 'Implement WebSocket notifications', status: 'TODO', priority: 'P2', tags: ['realtime'] },
    { title: 'Build search functionality', status: 'BACKLOG', priority: 'P2', tags: ['search', 'feature'] },
    { title: 'Add file upload support', status: 'BACKLOG', priority: 'P3', tags: ['feature'] },
    { title: 'Performance optimization pass', status: 'BACKLOG', priority: 'P3', tags: ['perf'] },
  ];

  for (let i = 0; i < taskDefs.length; i++) {
    const t = taskDefs[i];
    db.insert(schema.tasks).values({
      id: genId('task', i),
      projectId: DEMO_PROJECT_ID,
      externalId: `demo-${i}`,
      title: t.title,
      description: `Demo task: ${t.title}`,
      status: t.status,
      priority: t.priority,
      assignedAgent: t.agent,
      tags: JSON.stringify(t.tags),
      effort: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
      dependencies: '[]',
      source: 'dashboard',
      columnOrder: i,
      createdAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
      updatedAt: now,
    }).run();
  }

  // Seed events
  const eventDefs: { level: EventLevel; agent?: string; message: string }[] = [
    { level: 'info', agent: 'architect', message: 'Started planning session' },
    { level: 'success', agent: 'backend-1', message: 'Completed user model implementation' },
    { level: 'info', agent: 'backend-1', message: 'Starting authentication module' },
    { level: 'warning', agent: 'rataa-frontend', message: 'Found potential SQL injection in query builder' },
    { level: 'success', agent: 'rataa-ops', message: 'CI pipeline configured and passing' },
    { level: 'info', agent: 'tester-1', message: 'Running test suite: auth module' },
    { level: 'error', agent: 'backend-2', message: 'Payment API integration test failing - timeout' },
    { level: 'info', agent: 'backend-2', message: 'Retrying with increased timeout' },
    { level: 'success', agent: 'backend-2', message: 'Payment integration tests passing' },
    { level: 'info', agent: 'architect', message: 'Updated API schema with pagination support' },
    { level: 'warning', agent: 'rataa-research', message: 'Research findings suggest alternative auth approach' },
    { level: 'success', agent: 'tester-1', message: '42/42 tests passing for user module' },
  ];

  for (let i = 0; i < eventDefs.length; i++) {
    const e = eventDefs[i];
    db.insert(schema.events).values({
      id: genId('evt', i),
      projectId: DEMO_PROJECT_ID,
      timestamp: new Date(Date.now() - (eventDefs.length - i) * 300000).toISOString(),
      level: e.level,
      agentId: e.agent,
      agentRole: e.agent as AgentRole | undefined,
      message: e.message,
    }).run();
  }

  // Seed analytics snapshots (last 7 days)
  for (let day = 6; day >= 0; day--) {
    const date = new Date(Date.now() - day * 86400000);
    db.insert(schema.analyticsSnapshots).values({
      id: genId('snap', day),
      projectId: DEMO_PROJECT_ID,
      timestamp: date.toISOString(),
      activeAgents: Math.floor(Math.random() * 5) + 2,
      tasksInProgress: Math.floor(Math.random() * 4) + 1,
      tasksCompleted: Math.floor(Math.random() * 3) + day,
      totalTasks: 15,
      estimatedCost: Math.round((Math.random() * 10 + 5) * 100) / 100,
    }).run();
  }
}
