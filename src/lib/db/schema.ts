import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  coordinationPath: text('coordination_path').notNull(),
  gitUrl: text('git_url'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  externalId: text('external_id'),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('BACKLOG'),
  priority: text('priority').notNull().default('P2'),
  assignedAgent: text('assigned_agent'),
  tags: text('tags').notNull().default('[]'),
  effort: text('effort'),
  dependencies: text('dependencies').notNull().default('[]'),
  source: text('source').notNull().default('dashboard'),
  columnOrder: integer('column_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const agentSnapshots = sqliteTable('agent_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  agentId: text('agent_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('offline'),
  currentTask: text('current_task'),
  model: text('model'),
  sessionStart: text('session_start'),
  lastHeartbeat: text('last_heartbeat'),
  lockedFiles: text('locked_files').notNull().default('[]'),
  progress: integer('progress'),
  estimatedCost: real('estimated_cost'),
  createdAt: text('created_at').notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  timestamp: text('timestamp').notNull(),
  level: text('level').notNull().default('info'),
  agentId: text('agent_id'),
  agentRole: text('agent_role'),
  message: text('message').notNull(),
  details: text('details'),
});

export const taskComments = sqliteTable('task_comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  projectId: text('project_id').notNull().references(() => projects.id),
  agentId: text('agent_id').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull().default('comment'), // comment, bug, status-change, resolution
  createdAt: text('created_at').notNull(),
});

export const fileLocks = sqliteTable('file_locks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  filePath: text('file_path').notNull(),
  agentId: text('agent_id').notNull(),
  agentRole: text('agent_role').notNull(),
  lockedAt: text('locked_at').notNull(),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  actorType: text('actor_type').notNull().default('agent'),
  targetType: text('target_type'),
  targetId: text('target_id'),
  detail: text('detail'),
  createdAt: text('created_at').notNull(),
});

// Phase 3: Inter-agent messaging
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  conversationId: text('conversation_id').notNull(),
  fromAgent: text('from_agent').notNull(),
  toAgent: text('to_agent'),
  content: text('content').notNull(),
  messageType: text('message_type').notNull().default('text'),
  metadata: text('metadata'),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name'),
  participants: text('participants').notNull().default('[]'),
  lastMessageAt: text('last_message_at'),
  createdAt: text('created_at').notNull(),
});

// Phase 3: Notifications
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  recipient: text('recipient').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
});

// Phase 4: Quality reviews
export const qualityReviews = sqliteTable('quality_reviews', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  taskId: text('task_id').notNull().references(() => tasks.id),
  reviewer: text('reviewer').notNull(),
  status: text('status').notNull(), // pending, approved, rejected, needs_changes
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
});

// Phase 4: Standup reports
export const standupReports = sqliteTable('standup_reports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  date: text('date').notNull(),
  report: text('report').notNull(),
  createdAt: text('created_at').notNull(),
});

// Phase 5: Workflow templates
export const workflowTemplates = sqliteTable('workflow_templates', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  taskTitle: text('task_title').notNull(),
  taskDescription: text('task_description'),
  assignToRole: text('assign_to_role'),
  priority: text('priority').notNull().default('P2'),
  estimatedEffort: text('estimated_effort'),
  tags: text('tags').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Phase 5: Workflow pipelines
export const workflowPipelines = sqliteTable('workflow_pipelines', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  steps: text('steps').notNull().default('[]'),
  useCount: integer('use_count').notNull().default(0),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  pipelineId: text('pipeline_id').notNull().references(() => workflowPipelines.id),
  status: text('status').notNull().default('pending'),
  currentStep: integer('current_step').notNull().default(0),
  stepsSnapshot: text('steps_snapshot').notNull().default('[]'),
  triggeredBy: text('triggered_by').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
});

export const analyticsSnapshots = sqliteTable('analytics_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  timestamp: text('timestamp').notNull(),
  activeAgents: integer('active_agents').notNull().default(0),
  tasksInProgress: integer('tasks_in_progress').notNull().default(0),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  totalTasks: integer('total_tasks').notNull().default(0),
  estimatedCost: real('estimated_cost').notNull().default(0),
});

export const agentSystemPrompts = sqliteTable('agent_system_prompts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  agentRole: text('agent_role').notNull(),
  prompt: text('prompt').notNull(),
  missionGoal: text('mission_goal'),
  generatedBy: text('generated_by').notNull().default('rataa'),
  createdAt: text('created_at').notNull(),
});

// Phase 6: 3-Floor Office — Research & Ideation
export const researchSessions = sqliteTable('research_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  date: text('date').notNull(),
  state: text('state').notNull().default('IDLE'),
  topic: text('topic'),
  gitAnalysis: text('git_analysis'),
  councilResponses: text('council_responses'),
  peerReviews: text('peer_reviews'),
  synthesis: text('synthesis'),
  selectedIdea: text('selected_idea'),
  votes: text('votes'),
  ideationPlan: text('ideation_plan'),
  uiUxScreens: text('ui_ux_screens'),
  triggeredAt: text('triggered_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const officeMemory = sqliteTable('office_memory', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  floor: integer('floor').notNull(),
  type: text('type').notNull(),
  date: text('date').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').notNull().default('[]'),
  source: text('source').notNull(),
  importance: integer('importance').notNull().default(5),
  filePath: text('file_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const floorCommunications = sqliteTable('floor_communications', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  date: text('date').notNull(),
  fromFloor: integer('from_floor').notNull(),
  toFloor: integer('to_floor').notNull(),
  fromAgent: text('from_agent').notNull(),
  toAgent: text('to_agent').notNull(),
  messageType: text('message_type').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata'),
  acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const councilMembers = sqliteTable('council_members', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  role: text('role').notNull().default('member'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  totalVotes: integer('total_votes').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
