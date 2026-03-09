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
  // Floor 1 — Research
  { role: 'rataa-research', label: 'Robin (Research Lead)', icon: 'FlaskRound', color: '#6366f1' },
  { role: 'researcher-1', label: 'Chopper', icon: 'BookOpen', color: '#f59e0b' },
  { role: 'researcher-2', label: 'Brook', icon: 'BookOpen', color: '#f59e0b' },
  { role: 'researcher-3', label: 'Jinbe', icon: 'BookOpen', color: '#f59e0b' },
  { role: 'researcher-4', label: 'Carrot', icon: 'BookOpen', color: '#f59e0b' },
  // Floor 2 — Development
  { role: 'rataa-frontend', label: 'Nami (Frontend Lead)', icon: 'MonitorSmartphone', color: '#8b5cf6' },
  { role: 'rataa-backend', label: 'Franky (Backend Lead)', icon: 'Server', color: '#7c3aed' },
  { role: 'architect', label: 'Usopp (Architect)', icon: 'Blocks', color: '#146b4e' },
  { role: 'frontend', label: 'Sanji (Frontend)', icon: 'Palette', color: '#06b6d4' },
  { role: 'backend-1', label: 'Zoro (Backend)', icon: 'Database', color: '#0891b2' },
  { role: 'backend-2', label: 'Law (Backend)', icon: 'Database', color: '#0891b2' },
  { role: 'tester-1', label: 'Smoker (Tester)', icon: 'TestTube', color: '#10b981' },
  { role: 'tester-2', label: 'Tashigi (Tester)', icon: 'TestTube', color: '#10b981' },
  // Floor 3 — Ops
  { role: 'rataa-ops', label: 'Luffy (Ops Lead)', icon: 'Rocket', color: '#a855f7' },
  { role: 'supervisor', label: 'Rataa-1 (Ops)', icon: 'Eye', color: '#9333ea' },
  { role: 'supervisor-2', label: 'Rataa-2 (Quality)', icon: 'Eye', color: '#7c3aed' },
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
  excludedRoles: ['supervisor', 'supervisor-2'] as string[],
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
  { href: '/office', label: 'Office', icon: 'Building2' },
  { href: '/standup', label: 'Standup', icon: 'FileText' },
  { href: '/approvals', label: 'Approvals', icon: 'ShieldCheck' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
] as const;

export const SDK_CONFIG = {
  defaultModel: 'claude-sonnet-4-6',
  maxBudgetUsd: 5.0,
  hookEndpoint: 'http://localhost:4000/api/hooks',
  maxConcurrentSdkAgents: 8,
};

export const HOOK_EVENT_TYPES = [
  'SessionStart',
  'PostToolUse',
  'Stop',
  'SubagentStop',
  'TaskCompleted',
  'Notification',
  'TeammateIdle',
  'SubagentStart',
  'SubagentStop',
  'ApprovalRequest',
] as const;

export type HookEventType = (typeof HOOK_EVENT_TYPES)[number];

export const OFFICE_CONFIG = {
  enabled: true,
  floors: { 1: 'Research & Ideation', 2: 'Development', 3: 'CI/CD & Deploy' } as Record<number, string>,
  idleCheckIntervalMs: 5 * 60_000,
  councilTimeoutMs: 5 * 60_000,
  eodCommunicationHour: 22,
  defaultCouncil: [
    { name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', role: 'chairman' as const },
    { name: 'Claude Sonnet', provider: 'openrouter', model: 'anthropic/claude-sonnet-4-6', role: 'member' as const },
    { name: 'Gemini 2 Flash', provider: 'openrouter', model: 'google/gemini-2.0-flash-001', role: 'member' as const },
    { name: 'Llama 3.1 70B', provider: 'openrouter', model: 'meta-llama/llama-3.1-70b-instruct', role: 'member' as const },
  ],
  floorAgents: {
    1: ['rataa-research', 'researcher-1', 'researcher-2', 'researcher-3', 'researcher-4'],
    2: ['rataa-frontend', 'rataa-backend', 'architect', 'frontend', 'backend-1', 'backend-2', 'tester-1', 'tester-2'],
    3: ['rataa-ops', 'supervisor', 'supervisor-2'],
  } as Record<number, string[]>,
} as const;

/** One Piece character mapping — each agent gets a character name + role */
export const AGENT_CHARACTERS: Record<string, { character: string; fullName: string; epithet: string; model: string }> = {
  // Floor 3 — CI/CD & Deploy
  'rataa-ops':       { character: 'Luffy',   fullName: 'Monkey D. Luffy',  epithet: 'Straw Hat Captain',        model: 'opus' },
  // Floor 2 — Development
  'rataa-frontend':  { character: 'Nami',    fullName: 'Nami',             epithet: 'Cat Burglar Navigator',    model: 'opus' },
  'rataa-backend':   { character: 'Franky',  fullName: 'Cutty Flam',       epithet: 'Cyborg Shipwright',        model: 'opus' },
  'architect':       { character: 'Usopp',   fullName: 'Usopp',            epithet: 'Sniper King Architect',    model: 'opus' },
  'frontend':        { character: 'Sanji',   fullName: 'Vinsmoke Sanji',   epithet: 'Black Leg Chef',           model: 'sonnet' },
  'backend-1':       { character: 'Zoro',    fullName: 'Roronoa Zoro',     epithet: 'Three-Sword Coder',        model: 'sonnet' },
  'backend-2':       { character: 'Law',     fullName: 'Trafalgar D. Law', epithet: 'Surgeon of Death',         model: 'sonnet' },
  'tester-1':        { character: 'Smoker',  fullName: 'Smoker',           epithet: 'White Hunter',             model: 'sonnet' },
  'tester-2':        { character: 'Tashigi', fullName: 'Tashigi',          epithet: 'Meticulous Blade',         model: 'sonnet' },
  // Floor 1 — Research & Ideation
  'rataa-research':  { character: 'Robin',   fullName: 'Nico Robin',       epithet: 'Devil Child Archaeologist', model: 'opus' },
  'researcher-1':    { character: 'Chopper', fullName: 'Tony Tony Chopper', epithet: 'Cotton Candy Lover',      model: 'gpt-4o' },
  'researcher-2':    { character: 'Brook',   fullName: 'Brook',            epithet: 'Soul King',                model: 'claude-sonnet' },
  'researcher-3':    { character: 'Jinbe',   fullName: 'Jinbe',            epithet: 'Knight of the Sea',        model: 'gemini-2-flash' },
  'researcher-4':    { character: 'Carrot',  fullName: 'Carrot',           epithet: 'Sulong Warrior',           model: 'llama-3.1-70b' },
};
