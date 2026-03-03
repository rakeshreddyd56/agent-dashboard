import fs from 'fs';
import path from 'path';
import type {
  AgentSnapshot,
  DashboardEvent,
  FileLock,
  Task,
  AgentRole,
  AgentStatus,
  EventLevel,
  TaskStatus,
  TaskPriority,
} from '@/lib/types';

function safeReadJSON(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function safeReadText(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const VALID_ROLES: Set<string> = new Set([
  'architect', 'coder', 'coder-2', 'reviewer', 'tester',
  'security-auditor', 'devops', 'coordinator', 'supervisor',
]);

const VALID_STATUSES: Set<string> = new Set([
  'initializing', 'planning', 'working', 'blocked',
  'reviewing', 'completed', 'idle', 'offline',
  'analyzing_requirements', 'implementing', 'verifying',
  'waiting', 'active', 'ready',
]);

const STATUS_ALIAS_MAP: Record<string, string> = {
  analyzing_requirements: 'planning',
  implementing: 'working',
  verifying: 'reviewing',
  waiting: 'idle',
  active: 'working',
  ready: 'idle',
};

// Parse registry.json -> AgentSnapshot[]
export function parseRegistry(coordinationPath: string, projectId: string): AgentSnapshot[] {
  const data = safeReadJSON(path.join(coordinationPath, 'registry.json'));
  if (!data || typeof data !== 'object') return [];

  const agents: AgentSnapshot[] = [];
  const registry = data as Record<string, unknown>;

  // Handle both array and object formats
  const entries = Array.isArray(registry.agents)
    ? registry.agents
    : Object.values(registry);

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const role = String(e.role || e.agent_role || 'coder');
    const agentId = String(e.id || e.agent_id || e.name || role);

    // Map real statuses to dashboard-known statuses
    const rawStatus = String(e.status || 'offline');
    const mappedStatus = STATUS_ALIAS_MAP[rawStatus] || rawStatus;
    const finalStatus = VALID_STATUSES.has(rawStatus)
      ? (STATUS_ALIAS_MAP[rawStatus] || rawStatus)
      : 'offline';

    agents.push({
      id: `${projectId}-${agentId}`,
      projectId,
      agentId,
      role: (VALID_ROLES.has(role) ? role : 'coder') as AgentRole,
      status: finalStatus as AgentStatus,
      currentTask: (e.current_task || e.task) as string | undefined,
      model: e.model as string | undefined,
      sessionStart: (e.session_start || e.startTime) as string | undefined,
      lastHeartbeat: (e.last_heartbeat || e.lastHeartbeat) as string | undefined,
      lockedFiles: Array.isArray(e.locked_files || e.lockedFiles) ? (e.locked_files || e.lockedFiles) as string[] : [],
      progress: typeof e.progress === 'number' ? e.progress : undefined,
      estimatedCost: typeof (e.estimated_cost ?? e.estimatedCost) === 'number' ? Number(e.estimated_cost ?? e.estimatedCost) : undefined,
      createdAt: new Date().toISOString(),
    });
  }

  return agents;
}

// Parse health.json -> update AgentSnapshot heartbeats
export function parseHealth(coordinationPath: string, projectId: string): Map<string, string> {
  const data = safeReadJSON(path.join(coordinationPath, 'health.json'));
  if (!data || typeof data !== 'object') return new Map();

  const heartbeats = new Map<string, string>();
  const health = data as Record<string, unknown>;

  // Primary: health.agents[] array with name/lastHeartbeat fields
  if (Array.isArray(health.agents)) {
    for (const entry of health.agents) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const agentId = String(e.name || e.id || e.agent_id || '');
      const heartbeat = String(e.lastHeartbeat || e.last_heartbeat || e.heartbeat || e.timestamp || '');
      if (agentId && heartbeat) {
        heartbeats.set(`${projectId}-${agentId}`, heartbeat);
      }
    }
  } else {
    // Fallback: flat object where keys are agent IDs (skip non-agent keys like lastCheck)
    for (const [k, v] of Object.entries(health)) {
      if (k === 'lastCheck' || k === 'last_check' || k === 'timestamp') continue;
      if (typeof v === 'object' && v !== null) {
        const e = v as Record<string, unknown>;
        const heartbeat = String(e.lastHeartbeat || e.last_heartbeat || e.heartbeat || e.timestamp || '');
        if (heartbeat) {
          heartbeats.set(`${projectId}-${k}`, heartbeat);
        }
      } else if (typeof v === 'string') {
        heartbeats.set(`${projectId}-${k}`, v);
      }
    }
  }

  return heartbeats;
}

// Parse locks.json -> FileLock[]
export function parseLocks(coordinationPath: string, projectId: string): FileLock[] {
  const data = safeReadJSON(path.join(coordinationPath, 'locks.json'));
  if (!data || typeof data !== 'object') return [];

  const locks: FileLock[] = [];
  const lockData = data as Record<string, unknown>;

  const entries = Array.isArray(lockData.locks)
    ? lockData.locks
    : Array.isArray(lockData)
    ? lockData
    : Object.entries(lockData).map(([filePath, v]) =>
        typeof v === 'object' && v !== null
          ? { file_path: filePath, ...(v as Record<string, unknown>) }
          : { file_path: filePath, agent_id: String(v) }
      );

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const filePath = String(e.file_path || e.file || e.path || '');
    const agentId = String(e.agent_id || e.agent || e.owner || '');
    if (!filePath || !agentId) continue;

    locks.push({
      id: `${projectId}-lock-${generateId()}`,
      projectId,
      filePath,
      agentId,
      agentRole: (VALID_ROLES.has(String(e.agent_role || e.role)) ? e.agent_role || e.role : 'coder') as AgentRole,
      lockedAt: String(e.locked_at || e.timestamp || new Date().toISOString()),
    });
  }

  return locks;
}

// Parse queue.json -> Task[]
export function parseQueue(coordinationPath: string, projectId: string): Task[] {
  const data = safeReadJSON(path.join(coordinationPath, 'queue.json'));
  if (!data || typeof data !== 'object') return [];

  const tasks: Task[] = [];
  const queueData = data as Record<string, unknown>;

  const statusMap: Record<string, TaskStatus> = {
    pending: 'TODO',
    queued: 'TODO',
    backlog: 'BACKLOG',
    assigned: 'IN_PROGRESS',
    in_progress: 'IN_PROGRESS',
    working: 'IN_PROGRESS',
    review: 'REVIEW',
    reviewing: 'REVIEW',
    testing: 'TESTING',
    done: 'DONE',
    completed: 'DONE',
    complete: 'DONE',
  };

  // Handle real format: {"pending":[],"in_progress":[],"completed":[]}
  // as well as: {tasks:[]}, {queue:[]}, or top-level array
  let entries: unknown[] = [];

  if ('pending' in queueData || 'in_progress' in queueData || 'completed' in queueData) {
    // Real queue.json format with status-keyed arrays
    const statusKeyMap: Record<string, string> = {
      pending: 'pending',
      in_progress: 'in_progress',
      completed: 'completed',
      review: 'review',
      testing: 'testing',
      backlog: 'backlog',
    };
    for (const [key, statusValue] of Object.entries(statusKeyMap)) {
      const arr = (queueData as Record<string, unknown>)[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === 'string') {
            entries.push({ id: item, title: item, status: statusValue });
          } else if (item && typeof item === 'object') {
            entries.push({ ...(item as Record<string, unknown>), status: (item as Record<string, unknown>).status || statusValue });
          }
        }
      }
    }
  } else if (Array.isArray(queueData.tasks)) {
    entries = queueData.tasks;
  } else if (Array.isArray(queueData.queue)) {
    entries = queueData.queue;
  } else if (Array.isArray(queueData)) {
    entries = queueData;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const rawStatus = String(e.status || 'backlog').toLowerCase();
    const status = statusMap[rawStatus] || 'BACKLOG';
    const rawPriority = String(e.priority || 'P2').toUpperCase();
    const priority = (['P0', 'P1', 'P2', 'P3'].includes(rawPriority) ? rawPriority : 'P2') as TaskPriority;
    const externalId = String(e.id || e.task_id || `queue-${i}`);

    tasks.push({
      id: `${projectId}-q-${externalId}`,
      projectId,
      externalId,
      title: String(e.title || e.name || e.description || 'Untitled Task'),
      description: e.description as string | undefined,
      status,
      priority,
      assignedAgent: e.assigned_to as string | undefined,
      tags: Array.isArray(e.tags) ? e.tags : [],
      effort: e.effort as string | undefined,
      dependencies: Array.isArray(e.dependencies) ? e.dependencies : [],
      source: 'coordination',
      columnOrder: i,
      createdAt: String(e.created_at || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    });
  }

  return tasks;
}

// Parse events.log -> DashboardEvent[]
export function parseEventsLog(coordinationPath: string, projectId: string, afterByte?: number): {
  events: DashboardEvent[];
  newOffset: number;
} {
  const filePath = path.join(coordinationPath, 'events.log');
  const content = safeReadText(filePath);
  if (!content) return { events: [], newOffset: 0 };

  const startByte = afterByte || 0;
  const relevantContent = content.slice(startByte);
  const lines = relevantContent.split('\n').filter((l) => l.trim());

  const events: DashboardEvent[] = [];
  const levelMap: Record<string, EventLevel> = {
    info: 'info',
    warn: 'warning',
    warning: 'warning',
    error: 'error',
    critical: 'error',
    success: 'success',
    debug: 'debug',
  };

  for (const line of lines) {
    // Try JSON format first
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') {
        events.push({
          id: `${projectId}-evt-${generateId()}`,
          projectId,
          timestamp: String(parsed.timestamp || new Date().toISOString()),
          level: levelMap[String(parsed.level || 'info').toLowerCase()] || 'info',
          agentId: parsed.agent_id || parsed.agent,
          agentRole: parsed.agent_role || parsed.role,
          message: String(parsed.message || parsed.msg || line),
          details: parsed.details,
        });
        continue;
      }
    } catch {
      // Not JSON, try line parsing
    }

    // Try format: [TIMESTAMP] [AGENT] [LEVEL] message (actual format)
    // Also handle: [TIMESTAMP] [LEVEL] [AGENT] message (alternate format)
    const match = line.match(
      /^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(?:\[([^\]]+)\]\s*)?(.+)$/
    );
    if (match) {
      const [, timestamp, second, third, message] = match;
      // Determine if second bracket is agent or level
      const secondLower = second.toLowerCase();
      const isLevel = secondLower in levelMap;
      const level = isLevel ? secondLower : (third ? third.toLowerCase() : 'info');
      const agent = isLevel ? (third || undefined) : second;
      events.push({
        id: `${projectId}-evt-${generateId()}`,
        projectId,
        timestamp: timestamp || new Date().toISOString(),
        level: levelMap[level] || 'info',
        agentId: agent || undefined,
        message: message.trim(),
      });
    } else if (line.trim()) {
      events.push({
        id: `${projectId}-evt-${generateId()}`,
        projectId,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line.trim(),
      });
    }
  }

  return {
    events: events.slice(-10000), // Cap at 10k
    newOffset: content.length,
  };
}

// Parse TASKS.md -> Task[]
export function parseTasksMd(projectRoot: string, projectId: string): Task[] {
  const candidates = [
    path.join(projectRoot, '.claude', 'coordination', 'TASKS.md'),
    path.join(projectRoot, 'docs', 'TASKS.md'),
    path.join(projectRoot, 'TASKS.md'),
    path.join(projectRoot, 'tasks.md'),
    path.join(projectRoot, '.claude', 'TASKS.md'),
  ];

  let content = '';
  for (const p of candidates) {
    content = safeReadText(p);
    if (content) break;
  }

  if (!content) return [];

  // Try structured format first: ### TASK-ID: Title with **Field:** value metadata
  const structuredTasks = parseStructuredTasks(content, projectId);
  if (structuredTasks.length > 0) return structuredTasks;

  // Fall back to checkbox format: - [ ] task or - [x] task
  return parseCheckboxTasks(content, projectId);
}

function parseStructuredTasks(content: string, projectId: string): Task[] {
  const tasks: Task[] = [];
  const lines = content.split('\n');

  const structuredStatusMap: Record<string, TaskStatus> = {
    backlog: 'BACKLOG',
    todo: 'TODO',
    open: 'TODO',
    pending: 'TODO',
    assigned: 'ASSIGNED',
    'in progress': 'IN_PROGRESS',
    'in-progress': 'IN_PROGRESS',
    'in_progress': 'IN_PROGRESS',
    implementing: 'IN_PROGRESS',
    working: 'IN_PROGRESS',
    active: 'IN_PROGRESS',
    failed: 'FAILED',
    critical: 'TODO',
    review: 'REVIEW',
    'code review': 'REVIEW',
    testing: 'TESTING',
    tested: 'TESTED',
    done: 'DONE',
    completed: 'DONE',
    complete: 'DONE',
    fixed: 'DONE',
    resolved: 'DONE',
    closed: 'DONE',
  };

  let currentTask: {
    externalId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignedAgent?: string;
    description?: string;
    effort?: string;
    tags: string[];
    dependencies: string[];
    lineNum: number;
  } | null = null;

  // Track the last field we assigned to, so continuation lines can append
  let lastFieldTarget: 'description' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: ###/####/##### TASK-ID: Title  OR  TASK-ID — Title  OR  TASK-ID - Title
    const headerMatch = line.match(/^#{3,5}\s+([\w-]+)\s*[:\u2014\u2013\-]+\s+(.+)$/);
    if (headerMatch) {
      // Save previous task
      if (currentTask) {
        tasks.push({
          id: `${projectId}-md-${currentTask.externalId}`,
          projectId,
          externalId: currentTask.externalId,
          title: currentTask.title,
          description: currentTask.description?.trim() || undefined,
          status: currentTask.status,
          priority: currentTask.priority,
          assignedAgent: currentTask.assignedAgent,
          tags: currentTask.tags,
          effort: currentTask.effort,
          dependencies: currentTask.dependencies,
          source: 'tasks_md',
          columnOrder: tasks.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      currentTask = {
        externalId: headerMatch[1],
        title: headerMatch[2].trim(),
        status: 'BACKLOG',
        priority: 'P2',
        tags: [],
        dependencies: [],
        lineNum: i,
      };
      lastFieldTarget = null;
      continue;
    }

    if (!currentTask) continue;

    // Match: - **Field:** value  or  - **Field**: value
    const fieldMatch = line.match(/^[-*]\s+\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (fieldMatch) {
      lastFieldTarget = null; // Reset continuation tracking
      const [, field, value] = fieldMatch;
      const fieldLower = field.toLowerCase().trim().replace(/:$/, '');
      const valueTrimmed = value.trim();

      switch (fieldLower) {
        case 'status': {
          // Strip emoji prefixes (✅, 🔴, 🟡, 🟢, 🟠, 🟣, ⏳, 🛑, ❌, ⚠️, 🔵, 🔍) and clean up
          // Also strip parenthetical notes like "(maps to queue TASK-007)"
          const cleanStatus = valueTrimmed
            .replace(/^[\u2705\u{1F534}\u{1F7E1}\u{1F7E2}\u{1F7E0}\u{1F7E3}\u23F3\u{1F6D1}\u274C\u26A0\uFE0F\u{1F535}\u{1F50D}]\s*/u, '')
            .replace(/\s*\(.*\)\s*$/, '')
            .trim().toLowerCase();
          // Try exact match first, then first-word match (handles "fixed by coder", "complete + verified", etc.)
          let mapped = structuredStatusMap[cleanStatus];
          if (!mapped) {
            const firstWord = cleanStatus.split(/[\s,+&\-—]/)[0].trim();
            mapped = structuredStatusMap[firstWord];
          }
          // Also handle "low-risk" as a done-like status (verified items)
          if (!mapped && (cleanStatus.includes('low-risk') || cleanStatus.includes('verified') || cleanStatus.includes('hardened'))) {
            mapped = 'DONE';
          }
          currentTask.status = mapped || 'BACKLOG';
          break;
        }
        case 'priority': {
          // Extract P0-P3 even with suffix like "P0 — Critical"
          const pMatch = valueTrimmed.match(/P([0-3])/i);
          if (pMatch) {
            currentTask.priority = `P${pMatch[1]}` as TaskPriority;
          }
          break;
        }
        case 'assigned to':
        case 'assigned':
        case 'assignee':
        case 'agent':
        case 'owner':
          currentTask.assignedAgent = valueTrimmed || undefined;
          break;
        case 'description':
          currentTask.description = valueTrimmed || undefined;
          lastFieldTarget = 'description';
          break;
        case 'fix':
        case 'fix applied':
        case 'action':
        case 'acceptance':
        case 'note':
        case '\u26A0\uFE0F note': {
          // Append to description as supplementary info
          const supplement = `${field}: ${valueTrimmed}`;
          if (currentTask.description) {
            currentTask.description += '\n' + supplement;
          } else {
            currentTask.description = supplement;
          }
          lastFieldTarget = 'description';
          break;
        }
        case 'completed':
        case 'findings':
          // Known metadata — use as description if none exists
          if (!currentTask.description && valueTrimmed) {
            currentTask.description = valueTrimmed;
          } else if (currentTask.description && valueTrimmed) {
            currentTask.description += '\n' + valueTrimmed;
          }
          break;
        case 'files':
          // Capture as tags (file paths mentioned)
          if (valueTrimmed) {
            const filePaths = valueTrimmed.split(',').map((f) => f.trim().replace(/`/g, '')).filter(Boolean);
            currentTask.tags.push(...filePaths);
          }
          break;
        case 'effort':
          currentTask.effort = valueTrimmed || undefined;
          break;
        case 'depends on':
        case 'dependencies':
          currentTask.dependencies = valueTrimmed.split(',').map((d) => d.trim()).filter(Boolean);
          break;
        case 'tags':
          currentTask.tags = valueTrimmed.split(',').map((t) => t.trim()).filter(Boolean);
          break;
      }
      continue;
    }

    // Continuation lines: indented text (2+ spaces or tab) that follows a description field
    if (lastFieldTarget === 'description' && currentTask && /^\s{2,}/.test(line) && line.trim()) {
      currentTask.description = (currentTask.description || '') + '\n' + line.trimEnd();
    } else if (line.trim() === '' || line.match(/^---/)) {
      lastFieldTarget = null; // Blank line or separator ends continuation
    }
  }

  // Don't forget the last task
  if (currentTask) {
    tasks.push({
      id: `${projectId}-md-${currentTask.externalId}`,
      projectId,
      externalId: currentTask.externalId,
      title: currentTask.title,
      description: currentTask.description,
      status: currentTask.status,
      priority: currentTask.priority,
      assignedAgent: currentTask.assignedAgent,
      tags: currentTask.tags,
      effort: currentTask.effort,
      dependencies: currentTask.dependencies,
      source: 'tasks_md',
      columnOrder: tasks.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return tasks;
}

function parseCheckboxTasks(content: string, projectId: string): Task[] {
  const tasks: Task[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const taskMatch = line.match(/^[-*]\s+\[([x ])\]\s+(.+)$/i);
    if (taskMatch) {
      const [, checkbox, title] = taskMatch;
      const status: TaskStatus = checkbox.toLowerCase() === 'x' ? 'DONE' : 'TODO';

      const priorityMatch = title.match(/\(?P([0-3])\)?/i);
      const priority = priorityMatch ? `P${priorityMatch[1]}` as TaskPriority : 'P2';
      const agentMatch = title.match(/@(\w+)/);

      const cleanTitle = title
        .replace(/\(?P[0-3]\)?/gi, '')
        .replace(/@\w+/g, '')
        .trim();

      tasks.push({
        id: `${projectId}-md-${i}`,
        projectId,
        externalId: `md-line-${i}`,
        title: cleanTitle,
        status,
        priority,
        assignedAgent: agentMatch ? agentMatch[1] : undefined,
        tags: [],
        dependencies: [],
        source: 'tasks_md',
        columnOrder: tasks.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return tasks;
}

// Parse progress.txt -> DashboardEvent[] (format: YYYY-MM-DD agent: message)
export function parseProgressTxt(projectRoot: string, projectId: string): DashboardEvent[] {
  const candidates = [
    path.join(projectRoot, 'progress.txt'),
    path.join(projectRoot, '.claude', 'progress.txt'),
  ];

  let content = '';
  for (const p of candidates) {
    content = safeReadText(p);
    if (content) break;
  }

  if (!content) return [];

  return content
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const trimmed = line.trim();

      // Try format: YYYY-MM-DD HH:MM:SS agent: message
      // or: YYYY-MM-DD agent: message
      const timestampMatch = trimmed.match(
        /^(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\s+([\w-]+):\s+(.+)$/
      );

      if (timestampMatch) {
        const [, timestamp, agent, message] = timestampMatch;
        return {
          id: `${projectId}-prog-${generateId()}`,
          projectId,
          timestamp: new Date(timestamp).toISOString() || new Date().toISOString(),
          level: 'info' as EventLevel,
          agentId: agent,
          message: message.trim(),
        };
      }

      // Fallback: plain line
      return {
        id: `${projectId}-prog-${generateId()}`,
        projectId,
        timestamp: new Date().toISOString(),
        level: 'info' as EventLevel,
        message: trimmed,
      };
    });
}
