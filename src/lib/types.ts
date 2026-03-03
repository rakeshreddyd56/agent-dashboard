// Core domain types for the Multi-Agent Dashboard

export type AgentRole = 'architect' | 'coder' | 'coder-2' | 'reviewer' | 'tester' | 'security-auditor' | 'devops' | 'coordinator' | 'supervisor';

export type AgentStatus = 'initializing' | 'planning' | 'working' | 'blocked' | 'reviewing' | 'completed' | 'idle' | 'offline';

export type TaskStatus = 'BACKLOG' | 'TODO' | 'ASSIGNED' | 'IN_PROGRESS' | 'REVIEW' | 'QUALITY_REVIEW' | 'TESTING' | 'FAILED' | 'TESTED' | 'DONE';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type EventLevel = 'info' | 'warning' | 'error' | 'success' | 'debug';

export type TaskSource = 'coordination' | 'dashboard' | 'tasks_md';

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
  | 'standup:new';

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
