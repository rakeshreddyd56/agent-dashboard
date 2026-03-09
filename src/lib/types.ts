// Core domain types for the Multi-Agent Dashboard

export type AgentRole =
  // Floor 1 — Research
  | 'rataa-research' | 'researcher-1' | 'researcher-2' | 'researcher-3' | 'researcher-4'
  // Floor 2 — Development
  | 'rataa-frontend' | 'rataa-backend' | 'architect' | 'frontend' | 'backend-1' | 'backend-2' | 'tester-1' | 'tester-2'
  // Floor 3 — Ops
  | 'rataa-ops' | 'supervisor' | 'supervisor-2';

export type AgentStatus = 'initializing' | 'planning' | 'working' | 'blocked' | 'reviewing' | 'completed' | 'idle' | 'offline';

export type LaunchMode = 'tmux' | 'sdk' | 'subagents';

export type TaskStatus = 'BACKLOG' | 'TODO' | 'ASSIGNED' | 'IN_PROGRESS' | 'REVIEW' | 'QUALITY_REVIEW' | 'TESTING' | 'FAILED' | 'TESTED' | 'DONE';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type EventLevel = 'info' | 'warning' | 'error' | 'success' | 'debug';

export type TaskSource = 'coordination' | 'dashboard' | 'tasks_md' | 'office';

export interface Project {
  id: string;
  name: string;
  path: string;
  coordinationPath: string;
  gitUrl?: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  externalId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  tags: string[];
  effort?: string;
  dependencies: string[];
  source: TaskSource;
  columnOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSnapshot {
  id: string;
  projectId: string;
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask?: string;
  model?: string;
  sessionStart?: string;
  lastHeartbeat?: string;
  lockedFiles: string[];
  progress?: number;
  estimatedCost?: number;
  createdAt: string;
  launchMode?: LaunchMode;
  sdkSessionId?: string;
  hookEnabled?: boolean;
  worktreePath?: string;
  worktreeBranch?: string;
}

export interface DashboardEvent {
  id: string;
  projectId: string;
  timestamp: string;
  level: EventLevel;
  agentId?: string;
  agentRole?: AgentRole;
  message: string;
  details?: string;
}

export interface FileLock {
  id: string;
  projectId: string;
  filePath: string;
  agentId: string;
  agentRole: AgentRole;
  lockedAt: string;
}

export interface AnalyticsSnapshot {
  id: string;
  projectId: string;
  timestamp: string;
  activeAgents: number;
  tasksInProgress: number;
  tasksCompleted: number;
  totalTasks: number;
  estimatedCost: number;
}

export type CommentType = 'comment' | 'bug' | 'status-change' | 'resolution' | 'blocker' | 'note';

export interface TaskComment {
  id: string;
  taskId: string;
  projectId: string;
  agentId: string;
  content: string;
  type: CommentType;
  createdAt: string;
}

// SSE event types
export type SSEEventType =
  | 'agent:update'
  | 'agent:sync'
  | 'task:update'
  | 'task:sync'
  | 'task:delete'
  | 'event:new'
  | 'lock:update'
  | 'sync:complete'
  | 'analytics:update'
  | 'mission:update'
  // Phase 3+
  | 'message:new'
  | 'notification:new'
  | 'notification:read'
  | 'review:update'
  | 'pipeline:update'
  | 'standup:new'
  // Phase 6: Office
  | 'office:update'
  | 'office:communication'
  | 'office:memory'
  | 'office:research'
  // Phase 7: Constitution, Budget, Runs, Approvals
  | 'constitution:update'
  | 'budget:update'
  | 'budget:alert'
  | 'cost:new'
  | 'run:update'
  | 'approval:update';

export interface SSEMessage {
  type: SSEEventType;
  data: unknown;
  projectId: string;
  timestamp: string;
}

// Mission briefing
export interface Mission {
  goal: string;
  techStack: string;
  deliverables: string[];
  agentTeam: string[];
  createdAt: string;
  updatedAt: string;
}

// Board column definition
export interface BoardColumn {
  id: TaskStatus;
  title: string;
  color: string;
}

// KPI stats
export interface DashboardStats {
  activeAgents: number;
  tasksInProgress: number;
  completionRate: number;
  estimatedCost: number;
}

// Phase 6: 3-Floor Office types
export type FloorNumber = 1 | 2 | 3;

export type OfficeState =
  | 'IDLE' | 'CLONING' | 'ANALYZING' | 'RESEARCHING' | 'REVIEWING'
  | 'SYNTHESIZING' | 'PLANNING' | 'DELEGATING' | 'DEVELOPING'
  | 'TESTING' | 'BUILDING' | 'DEPLOYING' | 'COMPLETE';

export type MemoryType = 'daily_log' | 'long_term' | 'insight' | 'soul' | 'user_pref';

export type FloorMessageType =
  | 'ideation_handoff' | 'architecture_proposal' | 'architecture_feedback'
  | 'plan_finalized' | 'tickets_created' | 'build_request'
  | 'deploy_status' | 'daily_summary';

export interface ResearchSession {
  id: string;
  projectId: string;
  date: string;
  state: OfficeState;
  topic?: string;
  gitAnalysis?: string;
  councilResponses?: string;
  peerReviews?: string;
  synthesis?: string;
  selectedIdea?: string;
  votes?: string;
  ideationPlan?: string;
  uiUxScreens?: string;
  triggeredAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeMemoryEntry {
  id: string;
  projectId: string;
  floor: FloorNumber;
  type: MemoryType;
  date: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  importance: number;
  filePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FloorCommunication {
  id: string;
  projectId: string;
  date: string;
  fromFloor: FloorNumber;
  toFloor: FloorNumber;
  fromAgent: string;
  toAgent: string;
  messageType: FloorMessageType;
  content: string;
  metadata?: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface CouncilMember {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  model: string;
  role: 'member' | 'chairman';
  isActive: boolean;
  totalVotes: number;
  createdAt: string;
}

export interface ResearchIdea {
  title: string;
  description: string;
  viralPotential: string;
  mvpScope: string;
  uiScreens: string[];
  proposedBy: string;
  averageScore?: number;
}

export interface CouncilVote {
  memberId: string;
  memberName: string;
  ideaIndex: number;
  score: number;
  reasoning: string;
}

// Phase 7: Constitution, Budget, Runs, Approvals
export interface AgentPermissions {
  can_deploy: boolean;
  can_merge: boolean;
  can_launch_subagents: boolean;
  can_approve: boolean;
  can_override_budget: boolean;
  max_concurrent_tasks?: number;
}

export interface AgentConstitution {
  id: string;
  projectId: string;
  agentRole: string;
  title: string;
  capabilities: string[];
  permissions: AgentPermissions;
  reportsTo?: string;
  responsibilityScope: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CostEvent {
  id: string;
  projectId: string;
  agentId: string;
  agentRole: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  runId?: string;
  occurredAt: string;
  createdAt: string;
}

export interface AgentBudget {
  id: string;
  projectId: string;
  agentRole: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  currentMonth: string;
  softAlertSent: boolean;
  hardStopActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type InvocationSource = 'manual' | 'relay' | 'pipeline' | 'subagent';

export interface AgentRun {
  id: string;
  projectId: string;
  agentId: string;
  agentRole: string;
  status: RunStatus;
  invocationSource: InvocationSource;
  taskId?: string;
  model?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  toolCalls: number;
  stdoutExcerpt?: string;
  createdAt: string;
}

export type ApprovalType = 'deploy' | 'launch_agent' | 'budget_override' | 'strategy_change' | 'merge';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

export interface Approval {
  id: string;
  projectId: string;
  type: ApprovalType;
  requestedByAgent: string;
  requestedByRole: string;
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  decisionBy?: string;
  decisionNote?: string;
  decidedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface GitProjectAnalysis {
  repoName: string;
  description: string;
  techStack: string[];
  recentCommits: string[];
  fileStructure: string;
  currentVersion: string;
}
