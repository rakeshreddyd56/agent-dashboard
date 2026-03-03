import type { AgentRole, AgentStatus, BoardColumn, TaskPriority, TaskStatus } from './types';

/* Board columns — Moltbook pill-tone palette */
export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'BACKLOG', title: 'Backlog', color: '#7fa393' },
  { id: 'TODO', title: 'To Do', color: '#24556f' },
  { id: 'ASSIGNED', title: 'Assigned', color: '#5ba3c9' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: '#8d5a0f' },
  { id: 'REVIEW', title: 'Review', color: '#d5601d' },
  { id: 'QUALITY_REVIEW', title: 'QA Gate', color: '#8d5a0f' },
  { id: 'TESTING', title: 'Testing', color: '#24556f' },
  { id: 'FAILED', title: 'Failed', color: '#a4312f' },
  { id: 'TESTED', title: 'Tested', color: '#3dba8a' },
  { id: 'DONE', title: 'Done', color: '#0d7a4a' },
];

/* Priority — mapped to Moltbook pill tones: bad, warn, info, muted */
export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgClass: string }> = {
  P0: { label: 'Critical', color: '#a4312f', bgClass: 'bg-[#a4312f]/15 text-[#e05252]' },
  P1: { label: 'High', color: '#8d5a0f', bgClass: 'bg-[#8d5a0f]/15 text-[#f5b942]' },
  P2: { label: 'Medium', color: '#24556f', bgClass: 'bg-[#24556f]/15 text-[#5ba3c9]' },
  P3: { label: 'Low', color: '#7fa393', bgClass: 'bg-[#7fa393]/15 text-[#7fa393]' },
};

/* Agent roles — Clawbot marketplace colors (greens, oranges, blues) */
export const AGENT_ROLES: { role: AgentRole; label: string; icon: string; color: string }[] = [
  { role: 'architect', label: 'Architect', icon: 'Blocks', color: '#146b4e' },
  { role: 'coder', label: 'Coder', icon: 'Code', color: '#3dba8a' },
  { role: 'coder-2', label: 'Coder 2', icon: 'Code', color: '#5ba3c9' },
  { role: 'reviewer', label: 'Reviewer', icon: 'Search', color: '#d5601d' },
  { role: 'tester', label: 'Tester', icon: 'FlaskConical', color: '#0d7a4a' },
  { role: 'security-auditor', label: 'Security', icon: 'Shield', color: '#a4312f' },
  { role: 'devops', label: 'DevOps', icon: 'Container', color: '#8d5a0f' },
  { role: 'coordinator', label: 'Coordinator', icon: 'Users', color: '#24556f' },
  { role: 'supervisor', label: 'Supervisor (Rataa)', icon: 'Eye', color: '#9333ea' },
];

/* Agent status — mapped to Moltbook freshness/trust semantics
   working/completed = ok (green), planning/reviewing = info (blue),
   idle/initializing = warn (amber), blocked/offline = bad (red) */
export const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; bgClass: string }> = {
  initializing: { label: 'Initializing', color: '#7fa393', bgClass: 'bg-[#7fa393]/15 text-[#7fa393]' },
  planning: { label: 'Planning', color: '#24556f', bgClass: 'bg-[#24556f]/15 text-[#5ba3c9]' },
  working: { label: 'Working', color: '#0d7a4a', bgClass: 'bg-[#0d7a4a]/15 text-[#3dba8a]' },
  blocked: { label: 'Blocked', color: '#a4312f', bgClass: 'bg-[#a4312f]/15 text-[#e05252]' },
  reviewing: { label: 'Reviewing', color: '#d5601d', bgClass: 'bg-[#d5601d]/15 text-[#e8823e]' },
  completed: { label: 'Completed', color: '#146b4e', bgClass: 'bg-[#146b4e]/15 text-[#3dba8a]' },
  idle: { label: 'Idle', color: '#8d5a0f', bgClass: 'bg-[#8d5a0f]/15 text-[#f5b942]' },
  offline: { label: 'Offline', color: '#476256', bgClass: 'bg-[#476256]/15 text-[#476256]' },
};

export const TASK_STATUS_ORDER: TaskStatus[] = ['BACKLOG', 'TODO', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'QUALITY_REVIEW', 'TESTING', 'FAILED', 'TESTED', 'DONE'];

export const MODEL_COSTS: Record<string, number> = {
  'opus': 15,
  'claude-opus-4-6': 15,
  'sonnet': 3,
  'claude-sonnet-4-6': 3,
  'haiku': 0.25,
  'claude-haiku-4-5': 0.25,
};

export const AUTO_RELAY_CONFIG = {
  enabled: true,
  intervalMs: 60_000,
  maxRelaysPerAgent: 10,
  cooldownMs: 30_000,
  excludedRoles: ['coordinator', 'supervisor'] as string[],
};

export const HEARTBEAT_THRESHOLDS = {
  healthy: 60_000,    // < 60s = green
  warning: 300_000,   // < 5min = yellow
  // > 5min = red/stale
};

export const COORDINATION_FILES = [
  'registry.json',
  'locks.json',
  'queue.json',
  'events.log',
  'health.json',
] as const;

export const NAV_ITEMS = [
  { href: '/', label: 'HQ', icon: 'LayoutDashboard' },
  { href: '/mission', label: 'Mission', icon: 'Rocket' },
  { href: '/board', label: 'Board', icon: 'Columns3' },
  { href: '/agents', label: 'Agents', icon: 'Bot' },
  { href: '/backlog', label: 'Backlog', icon: 'List' },
  { href: '/activity', label: 'Activity', icon: 'Activity' },
  { href: '/analytics', label: 'Analytics', icon: 'BarChart3' },
  { href: '/standup', label: 'Standup', icon: 'FileText' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
] as const;
