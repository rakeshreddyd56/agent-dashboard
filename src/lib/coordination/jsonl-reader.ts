import fs from 'fs';
import path from 'path';

export interface SessionSummary {
  sessionId: string;
  projectSlug: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: Record<string, number>;
  lastActivity?: string;
  stopReason?: string;
  messageCount: number;
}

const CLAUDE_DIR = path.join(process.env.HOME || '~', '.claude');

export function getProjectSessions(projectPath: string): SessionSummary[] {
  // Claude Code stores sessions under ~/.claude/projects/<slug>/<session>.jsonl
  const slug = projectPath.replace(/\//g, '-').replace(/^-/, '');
  const sessionsDir = path.join(CLAUDE_DIR, 'projects', slug);

  if (!fs.existsSync(sessionsDir)) return [];

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
  const sessions: SessionSummary[] = [];

  for (const file of files) {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(sessionsDir, file);

    try {
      const summary = parseSessionFile(filePath, sessionId, slug);
      if (summary) sessions.push(summary);
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by last activity, most recent first
  sessions.sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  return sessions;
}

function parseSessionFile(filePath: string, sessionId: string, projectSlug: string): SessionSummary | null {
  const stat = fs.statSync(filePath);
  // Skip very large files (>50MB) to avoid memory issues
  if (stat.size > 50 * 1024 * 1024) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length === 0) return null;

  const summary: SessionSummary = {
    sessionId,
    projectSlug,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: {},
    messageCount: 0,
  };

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Extract model
      if (entry.model && !summary.model) {
        summary.model = entry.model;
      }

      // Extract token usage from message.usage
      if (entry.message?.usage) {
        const u = entry.message.usage;
        if (typeof u.input_tokens === 'number') summary.inputTokens += u.input_tokens;
        if (typeof u.output_tokens === 'number') summary.outputTokens += u.output_tokens;
      }

      // Also handle top-level usage
      if (entry.usage) {
        if (typeof entry.usage.input_tokens === 'number') summary.inputTokens += entry.usage.input_tokens;
        if (typeof entry.usage.output_tokens === 'number') summary.outputTokens += entry.usage.output_tokens;
      }

      // Count tool calls
      if (entry.type === 'tool_use' || entry.message?.type === 'tool_use') {
        const toolName = entry.name || entry.message?.name || 'unknown';
        summary.toolCalls[toolName] = (summary.toolCalls[toolName] || 0) + 1;
      }

      // Count content blocks that are tool_use
      if (entry.message?.content && Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            const toolName = block.name || 'unknown';
            summary.toolCalls[toolName] = (summary.toolCalls[toolName] || 0) + 1;
          }
        }
      }

      // Track timestamp
      if (entry.timestamp) {
        summary.lastActivity = entry.timestamp;
      }

      // Track stop reason
      if (entry.stop_reason || entry.message?.stop_reason) {
        summary.stopReason = entry.stop_reason || entry.message?.stop_reason;
      }

      summary.messageCount++;
    } catch {
      // Skip malformed lines
    }
  }

  return summary.messageCount > 0 ? summary : null;
}

export function getAllSessions(): SessionSummary[] {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const allSessions: SessionSummary[] = [];
  const slugs = fs.readdirSync(projectsDir).filter((f) => {
    try {
      return fs.statSync(path.join(projectsDir, f)).isDirectory();
    } catch { return false; }
  });

  for (const slug of slugs) {
    const slugDir = path.join(projectsDir, slug);
    const files = fs.readdirSync(slugDir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files.slice(0, 20)) { // Limit per project
      const sessionId = file.replace('.jsonl', '');
      try {
        const summary = parseSessionFile(path.join(slugDir, file), sessionId, slug);
        if (summary) allSessions.push(summary);
      } catch {
        // Skip
      }
    }
  }

  allSessions.sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  return allSessions;
}
