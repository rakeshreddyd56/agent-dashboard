import fs from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const TEAMS_DIR = path.join(CLAUDE_DIR, 'teams');
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks');

export interface TeamConfig {
  name: string;
  teammates: TeamMember[];
  createdAt?: string;
}

export interface TeamMember {
  name: string;
  role: string;
  model?: string;
  systemPrompt?: string;
}

export interface TeamTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignedTo?: string;
  priority?: string;
  createdAt?: string;
}

/**
 * Check if Agent Teams feature is available (config directory exists).
 */
export function isAgentTeamsAvailable(): boolean {
  return fs.existsSync(TEAMS_DIR) || fs.existsSync(TASKS_DIR);
}

/**
 * Read all team configurations from ~/.claude/teams/
 */
export function readTeamConfigs(): TeamConfig[] {
  if (!fs.existsSync(TEAMS_DIR)) return [];

  const configs: TeamConfig[] = [];
  try {
    const files = fs.readdirSync(TEAMS_DIR).filter(
      (f) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
    );

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(TEAMS_DIR, file), 'utf-8');
        const config = JSON.parse(content) as TeamConfig;
        if (config.name) {
          configs.push(config);
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory might not be readable
  }

  return configs;
}

/**
 * Read task files from ~/.claude/tasks/
 */
export function readTeamTasks(): TeamTask[] {
  if (!fs.existsSync(TASKS_DIR)) return [];

  const tasks: TeamTask[] = [];
  try {
    const files = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(TASKS_DIR, file), 'utf-8');
        const data = JSON.parse(content);

        if (Array.isArray(data)) {
          // File contains array of tasks
          for (const task of data) {
            if (task.id && task.title) {
              tasks.push(normalizeTask(task));
            }
          }
        } else if (data.id && data.title) {
          // File contains single task
          tasks.push(normalizeTask(data));
        } else if (data.tasks && Array.isArray(data.tasks)) {
          // File contains { tasks: [...] }
          for (const task of data.tasks) {
            if (task.id && task.title) {
              tasks.push(normalizeTask(task));
            }
          }
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory might not be readable
  }

  return tasks;
}

function normalizeTask(raw: Record<string, unknown>): TeamTask {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || ''),
    description: raw.description ? String(raw.description) : undefined,
    status: String(raw.status || 'pending'),
    assignedTo: raw.assignedTo ? String(raw.assignedTo) : raw.assigned_to ? String(raw.assigned_to) : undefined,
    priority: raw.priority ? String(raw.priority) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : raw.created_at ? String(raw.created_at) : undefined,
  };
}

/**
 * Map Agent Teams task status to dashboard TaskStatus.
 */
export function mapTaskStatus(teamStatus: string): string {
  const statusMap: Record<string, string> = {
    pending: 'TODO',
    'in-progress': 'IN_PROGRESS',
    in_progress: 'IN_PROGRESS',
    active: 'IN_PROGRESS',
    review: 'REVIEW',
    done: 'DONE',
    completed: 'DONE',
    failed: 'FAILED',
    blocked: 'BACKLOG',
  };
  return statusMap[teamStatus.toLowerCase()] || 'BACKLOG';
}

/**
 * Get a summary of Agent Teams status for the settings page.
 */
export function getAgentTeamsSummary(): {
  available: boolean;
  teams: { name: string; memberCount: number }[];
  taskCount: number;
} {
  const available = isAgentTeamsAvailable();
  const teams = readTeamConfigs().map((t) => ({
    name: t.name,
    memberCount: t.teammates?.length || 0,
  }));
  const taskCount = readTeamTasks().length;

  return { available, teams, taskCount };
}
