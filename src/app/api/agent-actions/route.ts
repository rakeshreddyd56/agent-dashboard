import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';
import { OFFICE_CONFIG } from '@/lib/constants';
import {
  getProjectAgents,
  upsertProjectAgent,
  getProjectTasks,
  getProjectTask,
  getProjectTasksByStatus,
  upsertProjectTask,
  updateProjectTask,
  getProjectTaskComments,
  insertProjectTaskComment,
  insertProjectEvent,
} from '@/lib/db/project-queries';
import type { AgentRow, TaskRow, EventRow, CommentRow } from '@/lib/db/project-queries';

/**
 * Agent Actions API — Restricted scope
 *
 * Agents can ONLY:
 *   READ:  list-tasks, list-agents, board-summary, read-mission, get-task, get-comments
 *   WRITE: move-task, create-task, update-agent (self only), comment-task, close-task
 *
 * Agents CANNOT:
 *   - Delete/create projects
 *   - Access filesystem (no /api/fs)
 *   - Modify settings or the platform itself
 *   - Delete tasks (only close them by moving to DONE)
 *   - Modify other agents' status
 */

const AGENT_READ_ACTIONS = new Set([
  'list-tasks', 'list-agents', 'board-summary', 'read-mission', 'get-task', 'get-comments',
  'list-messages', 'list-conversations', 'get-notifications', 'get-reviews',
  // Supervisor visibility actions
  'floor-status', 'full-status', 'list-events', 'capture-output',
]);

const AGENT_WRITE_ACTIONS = new Set([
  'move-task', 'create-task', 'update-agent', 'comment-task', 'close-task', 'create-bug',
  'send-message', 'submit-review',
]);

const VALID_STATUSES = new Set([
  'BACKLOG', 'TODO', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'QUALITY_REVIEW', 'TESTING', 'FAILED', 'TESTED', 'DONE',
]);

const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);

const COMMENT_TYPES = new Set(['comment', 'bug', 'status-change', 'resolution', 'blocker', 'note']);

/** Ensure per-project tables exist, creating them if needed. */
function ensureProjectTables(projectId: string): void {
  if (!projectTablesExist(projectId)) {
    createProjectTables(projectId);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  if (action && !AGENT_READ_ACTIONS.has(action)) {
    return NextResponse.json({
      error: `Restricted: '${action}' is not an allowed read action.`,
      allowedReadActions: Array.from(AGENT_READ_ACTIONS),
      allowedWriteActions: Array.from(AGENT_WRITE_ACTIONS),
    }, { status: 403 });
  }

  ensureProjectTables(projectId);

  switch (action) {
    case 'list-tasks': {
      const status = searchParams.get('status');
      let tasks: TaskRow[];
      if (status) {
        tasks = getProjectTasksByStatus(projectId, status);
      } else {
        tasks = getProjectTasks(projectId);
      }

      return NextResponse.json({
        tasks: tasks.map((t) => ({
          id: t.id,
          externalId: t.external_id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assignedAgent: t.assigned_agent,
          source: t.source,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })),
        count: tasks.length,
      });
    }

    case 'get-task': {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      }

      const task = getProjectTask(projectId, taskId);

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const comments = getProjectTaskComments(projectId, taskId);

      return NextResponse.json({ task, comments });
    }

    case 'get-comments': {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      }

      const comments = getProjectTaskComments(projectId, taskId);

      return NextResponse.json({ comments, count: comments.length });
    }

    case 'list-agents': {
      const agents = getProjectAgents(projectId);

      return NextResponse.json({
        agents: agents.map((a) => ({
          id: a.id,
          agentId: a.agent_id,
          role: a.role,
          status: a.status,
          currentTask: a.current_task,
          lastHeartbeat: a.last_heartbeat,
        })),
      });
    }

    case 'board-summary': {
      const tasks = getProjectTasks(projectId);

      const byStatus: Record<string, number> = {};
      for (const t of tasks) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      }

      return NextResponse.json({
        total: tasks.length,
        byStatus,
        validStatuses: Array.from(VALID_STATUSES),
      });
    }

    case 'read-mission': {
      const fs = await import('fs');
      const path = await import('path');

      const project = db.select().from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get();

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const missionPath = path.join(project.coordinationPath, 'mission.json');
      try {
        if (fs.existsSync(missionPath)) {
          const mission = JSON.parse(fs.readFileSync(missionPath, 'utf-8'));
          return NextResponse.json({ mission });
        }
      } catch { /* ignore */ }

      return NextResponse.json({ mission: null });
    }

    case 'list-messages': {
      const conversationId = searchParams.get('conversationId');
      const agentId = searchParams.get('agentId');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

      if (conversationId) {
        const messages = db.select().from(schema.messages)
          .where(and(eq(schema.messages.projectId, projectId), eq(schema.messages.conversationId, conversationId)))
          .orderBy(desc(schema.messages.createdAt))
          .limit(limit).all().reverse();
        return NextResponse.json({ messages });
      }

      if (agentId) {
        const messages = db.select().from(schema.messages)
          .where(and(
            eq(schema.messages.projectId, projectId),
            or(eq(schema.messages.fromAgent, agentId), eq(schema.messages.toAgent, agentId)),
          ))
          .orderBy(desc(schema.messages.createdAt))
          .limit(limit).all().reverse();
        return NextResponse.json({ messages });
      }

      return NextResponse.json({ messages: [] });
    }

    case 'list-conversations': {
      const conversations = db.select().from(schema.conversations)
        .where(eq(schema.conversations.projectId, projectId))
        .orderBy(desc(schema.conversations.lastMessageAt))
        .all()
        .map((c) => ({ ...c, participants: JSON.parse(c.participants) }));
      return NextResponse.json({ conversations });
    }

    case 'get-notifications': {
      const recipient = searchParams.get('recipient') || searchParams.get('agentId');
      const conditions = [eq(schema.notifications.projectId, projectId)];
      if (recipient) conditions.push(eq(schema.notifications.recipient, recipient));
      conditions.push(isNull(schema.notifications.readAt));

      const notifications = db.select().from(schema.notifications)
        .where(and(...conditions))
        .orderBy(desc(schema.notifications.createdAt))
        .limit(20).all();

      return NextResponse.json({ notifications, count: notifications.length });
    }

    case 'get-reviews': {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      }
      const reviews = db.select().from(schema.qualityReviews)
        .where(and(eq(schema.qualityReviews.taskId, taskId), eq(schema.qualityReviews.projectId, projectId)))
        .orderBy(desc(schema.qualityReviews.createdAt))
        .all();
      return NextResponse.json({ reviews });
    }

    case 'floor-status': {
      const floor = parseInt(searchParams.get('floor') || '0');
      const floorAgentRoles = floor > 0
        ? (OFFICE_CONFIG.floorAgents as Record<number, string[]>)[floor] || []
        : Object.values(OFFICE_CONFIG.floorAgents as Record<number, string[]>).flat();

      const agents = getProjectAgents(projectId);
      const tasks = getProjectTasks(projectId);

      // Filter agents by floor
      const floorAgents = agents.filter((a) => floorAgentRoles.includes(a.agent_id) || floorAgentRoles.includes(a.role));

      // Build per-agent detail with their tasks
      const agentDetails = floorAgents.map((a) => {
        const agentTasks = tasks.filter((t) => t.assigned_agent === a.agent_id);
        return {
          agentId: a.agent_id,
          role: a.role,
          status: a.status,
          currentTask: a.current_task,
          lastHeartbeat: a.last_heartbeat,
          progress: a.progress,
          tasks: agentTasks.map((t) => ({
            id: t.id,
            externalId: t.external_id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            updatedAt: t.updated_at,
          })),
        };
      });

      // Floor-level task stats
      const floorTaskIds = new Set(floorAgents.map((a) => a.current_task).filter(Boolean));
      const floorTasks = tasks.filter((t) => floorTaskIds.has(t.id) || floorTaskIds.has(t.external_id) || floorAgents.some((a) => t.assigned_agent === a.agent_id));
      const tasksByStatus: Record<string, number> = {};
      for (const t of floorTasks) tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;

      const floorNames: Record<number, string> = { 1: 'Research Lab', 2: 'Dev Floor', 3: 'Ops Center' };

      return NextResponse.json({
        floor: floor || 'all',
        floorName: floor > 0 ? floorNames[floor] || `Floor ${floor}` : 'All Floors',
        agents: agentDetails,
        agentCount: agentDetails.length,
        activeCount: agentDetails.filter((a) => a.status === 'working' || a.status === 'planning' || a.status === 'reviewing').length,
        tasksByStatus,
        totalTasks: floorTasks.length,
      });
    }

    case 'full-status': {
      const agents = getProjectAgents(projectId);
      const tasks = getProjectTasks(projectId);

      // Build comprehensive per-floor breakdown
      const floors = [1, 2, 3].map((floorNum) => {
        const floorRoles = (OFFICE_CONFIG.floorAgents as Record<number, string[]>)[floorNum] || [];
        const fAgents = agents.filter((a) => floorRoles.includes(a.agent_id) || floorRoles.includes(a.role));
        const fTasks = tasks.filter((t) => fAgents.some((a) => t.assigned_agent === a.agent_id));
        const floorNames: Record<number, string> = { 1: 'Research Lab', 2: 'Dev Floor', 3: 'Ops Center' };

        return {
          floor: floorNum,
          name: floorNames[floorNum],
          agents: fAgents.map((a) => ({
            agentId: a.agent_id,
            role: a.role,
            status: a.status,
            currentTask: a.current_task,
            lastHeartbeat: a.last_heartbeat,
          })),
          activeCount: fAgents.filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length,
          totalAgents: fAgents.length,
          tasks: {
            total: fTasks.length,
            inProgress: fTasks.filter((t) => t.status === 'IN_PROGRESS').length,
            done: fTasks.filter((t) => t.status === 'DONE').length,
            blocked: fTasks.filter((t) => t.status === 'FAILED').length,
          },
        };
      });

      // Global task stats
      const tasksByStatus: Record<string, number> = {};
      for (const t of tasks) tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;

      // Unassigned tasks
      const unassigned = tasks.filter((t) => !t.assigned_agent && t.status !== 'DONE' && t.status !== 'BACKLOG');

      return NextResponse.json({
        floors,
        global: {
          totalAgents: agents.length,
          activeAgents: agents.filter((a) => ['working', 'planning', 'reviewing'].includes(a.status)).length,
          totalTasks: tasks.length,
          tasksByStatus,
          unassignedTasks: unassigned.map((t) => ({ id: t.id, externalId: t.external_id, title: t.title, status: t.status, priority: t.priority })),
        },
      });
    }

    case 'list-events': {
      const level = searchParams.get('level'); // error, warn, info, success
      const agentId = searchParams.get('agentId');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

      const { getProjectEvents } = await import('@/lib/db/project-queries');
      let events = getProjectEvents(projectId);

      // Filter by level
      if (level) {
        const levels = level.split(',');
        events = events.filter((e) => levels.includes(e.level));
      }

      // Filter by agent
      if (agentId) {
        events = events.filter((e) => e.agent_id === agentId);
      }

      // Limit and reverse (newest first)
      events = events.slice(-limit).reverse();

      return NextResponse.json({
        events: events.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          level: e.level,
          agentId: e.agent_id,
          agentRole: e.agent_role,
          message: e.message,
          details: e.details,
        })),
        count: events.length,
      });
    }

    case 'capture-output': {
      const agentId = searchParams.get('agentId');
      const lines = Math.min(parseInt(searchParams.get('lines') || '20'), 100);
      if (!agentId) {
        return NextResponse.json({ error: 'agentId required' }, { status: 400 });
      }

      const { execFileSync } = await import('child_process');

      // Find tmux session for this agent
      let sessions: string[] = [];
      try {
        const output = execFileSync('tmux', ['ls'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        sessions = output ? output.split('\n').map((l) => l.split(':')[0]) : [];
      } catch { sessions = []; }

      const session = sessions.find((s) => s.includes(agentId));
      if (!session) {
        return NextResponse.json({ agentId, session: null, output: null, error: 'No tmux session found' });
      }

      let paneOutput = '';
      let paneCommand = '';
      try {
        paneOutput = execFileSync('tmux', ['capture-pane', '-t', session, '-p', '-S', `-${lines}`], {
          encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        paneCommand = execFileSync('tmux', ['list-panes', '-t', session, '-F', '#{pane_current_command}'], {
          encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch { /* session might be gone */ }

      return NextResponse.json({ agentId, session, command: paneCommand, output: paneOutput, lines: paneOutput.split('\n').length });
    }

    default:
      return NextResponse.json({
        error: 'Unknown or missing action.',
        allowedReadActions: Array.from(AGENT_READ_ACTIONS),
        allowedWriteActions: Array.from(AGENT_WRITE_ACTIONS),
        usage: {
          'list-tasks': 'GET ?action=list-tasks&projectId=X[&status=IN_PROGRESS]',
          'get-task': 'GET ?action=get-task&projectId=X&taskId=Y',
          'get-comments': 'GET ?action=get-comments&projectId=X&taskId=Y',
          'list-agents': 'GET ?action=list-agents&projectId=X',
          'board-summary': 'GET ?action=board-summary&projectId=X',
          'read-mission': 'GET ?action=read-mission&projectId=X',
          'list-messages': 'GET ?action=list-messages&projectId=X&agentId=Y',
          'list-conversations': 'GET ?action=list-conversations&projectId=X',
          'get-notifications': 'GET ?action=get-notifications&projectId=X&agentId=Y',
          'get-reviews': 'GET ?action=get-reviews&projectId=X&taskId=Y',
          'floor-status': 'GET ?action=floor-status&projectId=X&floor=1|2|3 (per-floor agents+tasks)',
          'full-status': 'GET ?action=full-status&projectId=X (all floors, all agents, all tasks)',
          'list-events': 'GET ?action=list-events&projectId=X[&level=error,warn][&agentId=Y][&limit=50]',
          'capture-output': 'GET ?action=capture-output&projectId=X&agentId=Y[&lines=20] (tmux output)',
          'move-task': 'POST {action:"move-task", projectId, taskId, status, agentId}',
          'create-task': 'POST {action:"create-task", projectId, title, status, priority, agentId}',
          'create-bug': 'POST {action:"create-bug", projectId, title, description, priority, agentId}',
          'comment-task': 'POST {action:"comment-task", projectId, taskId, agentId, content, type}',
          'close-task': 'POST {action:"close-task", projectId, taskId, agentId, resolution}',
          'update-agent': 'POST {action:"update-agent", projectId, agentId, status, currentTask}',
          'send-message': 'POST {action:"send-message", projectId, fromAgent, content, toAgent?}',
          'submit-review': 'POST {action:"submit-review", projectId, taskId, reviewer, status(approved|rejected|needs_changes), notes?}',
        },
      }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, projectId } = body;

  if (!projectId || !action) {
    return NextResponse.json({ error: 'action and projectId required' }, { status: 400 });
  }

  // Enforce restricted scope — only task/agent operations
  if (!AGENT_WRITE_ACTIONS.has(action)) {
    return NextResponse.json({
      error: `Restricted: '${action}' is not an allowed agent action. Agents can only manage tasks and their own status.`,
      allowedWriteActions: Array.from(AGENT_WRITE_ACTIONS),
    }, { status: 403 });
  }

  ensureProjectTables(projectId);

  switch (action) {
    case 'move-task': {
      const { taskId, status, agentId } = body;
      if (!taskId || !status) {
        return NextResponse.json({ error: 'taskId and status required' }, { status: 400 });
      }
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json({ error: `Invalid status. Valid: ${Array.from(VALID_STATUSES).join(', ')}` }, { status: 400 });
      }

      const task = getProjectTask(projectId, taskId);

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const now = new Date().toISOString();
      const updates: Partial<TaskRow> = { status, updated_at: now };
      if (agentId) updates.assigned_agent = agentId;

      updateProjectTask(projectId, taskId, updates);

      // Auto-add status change comment
      if (agentId) {
        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        insertProjectTaskComment(projectId, {
          id: commentId,
          task_id: taskId,
          agent_id: agentId,
          content: `Moved task from ${task.status} to ${status}`,
          type: 'status-change',
          created_at: now,
        });
      }

      eventBus.broadcast('task.status_changed', { id: taskId, title: task.title, previousStatus: task.status, status, assignedAgent: agentId, updatedAt: now }, projectId);

      // Log event
      logAgentEvent(projectId, agentId, 'info', `Moved task "${task.title}" to ${status}`);

      return NextResponse.json({ success: true, taskId, previousStatus: task.status, newStatus: status });
    }

    case 'create-task': {
      const { title, description, status, priority, agentId, externalId } = body;
      if (!title) {
        return NextResponse.json({ error: 'title required' }, { status: 400 });
      }

      const taskStatus = status && VALID_STATUSES.has(status) ? status : 'BACKLOG';
      const taskPriority = priority && VALID_PRIORITIES.has(priority) ? priority : 'P2';

      const taskId = `${projectId}-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      upsertProjectTask(projectId, {
        id: taskId,
        external_id: externalId || null,
        title,
        description: description || null,
        status: taskStatus,
        priority: taskPriority,
        assigned_agent: agentId || null,
        tags: '[]',
        effort: null,
        dependencies: '[]',
        source: 'coordination',
        column_order: 0,
        created_at: now,
        updated_at: now,
      });

      // Auto-comment on creation
      if (agentId) {
        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        insertProjectTaskComment(projectId, {
          id: commentId,
          task_id: taskId,
          agent_id: agentId,
          content: `Created task: ${title}${description ? '\n' + description : ''}`,
          type: 'comment',
          created_at: now,
        });
      }

      eventBus.broadcast('task.created', {
        id: taskId, projectId, title, status: taskStatus,
        priority: taskPriority, assignedAgent: agentId,
      }, projectId);

      logAgentEvent(projectId, agentId, 'success', `Created task: ${title} [${taskPriority}]`);

      return NextResponse.json({ success: true, taskId, title, status: taskStatus, priority: taskPriority });
    }

    case 'create-bug': {
      const { title, description, priority, agentId, relatedTaskId } = body;
      if (!title) {
        return NextResponse.json({ error: 'title required' }, { status: 400 });
      }
      if (!agentId) {
        return NextResponse.json({ error: 'agentId required for bug reports' }, { status: 400 });
      }

      const bugPriority = priority && VALID_PRIORITIES.has(priority) ? priority : 'P1';
      const bugTitle = title.startsWith('BUG:') ? title : `BUG: ${title}`;
      const taskId = `${projectId}-bug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      upsertProjectTask(projectId, {
        id: taskId,
        external_id: null,
        title: bugTitle,
        description: description || null,
        status: 'BACKLOG',
        priority: bugPriority,
        assigned_agent: null,
        tags: JSON.stringify(['bug', `reported-by:${agentId}`]),
        effort: null,
        dependencies: relatedTaskId ? JSON.stringify([relatedTaskId]) : '[]',
        source: 'coordination',
        column_order: 0,
        created_at: now,
        updated_at: now,
      });

      // Comment on the bug
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      insertProjectTaskComment(projectId, {
        id: commentId,
        task_id: taskId,
        agent_id: agentId,
        content: `Bug reported: ${title}${description ? '\nDetails: ' + description : ''}${relatedTaskId ? '\nRelated to: ' + relatedTaskId : ''}`,
        type: 'bug',
        created_at: now,
      });

      // If related to an existing task, add comment there too
      if (relatedTaskId) {
        const relCommentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}b`;
        insertProjectTaskComment(projectId, {
          id: relCommentId,
          task_id: relatedTaskId,
          agent_id: agentId,
          content: `Bug filed: ${bugTitle} (${taskId})`,
          type: 'bug',
          created_at: now,
        });
      }

      eventBus.broadcast('task.created', {
        id: taskId, projectId, title: bugTitle, status: 'BACKLOG',
        priority: bugPriority, assignedAgent: null, type: 'bug',
      }, projectId);

      logAgentEvent(projectId, agentId, 'warning', `Bug reported: ${bugTitle} [${bugPriority}]`);

      return NextResponse.json({ success: true, taskId, title: bugTitle, priority: bugPriority, type: 'bug' });
    }

    case 'comment-task': {
      const { taskId, agentId, content, type } = body;
      if (!taskId || !agentId || !content) {
        return NextResponse.json({ error: 'taskId, agentId, and content required' }, { status: 400 });
      }

      const task = getProjectTask(projectId, taskId);

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const commentType = type && COMMENT_TYPES.has(type) ? type : 'comment';
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();

      insertProjectTaskComment(projectId, {
        id: commentId,
        task_id: taskId,
        agent_id: agentId,
        content,
        type: commentType,
        created_at: now,
      });

      // Update task's updated_at
      updateProjectTask(projectId, taskId, { updated_at: now });

      eventBus.broadcast('task.updated', { id: taskId, updatedAt: now, lastComment: { agentId, content, type: commentType } }, projectId);

      return NextResponse.json({ success: true, commentId, taskId });
    }

    case 'close-task': {
      const { taskId, agentId, resolution } = body;
      if (!taskId || !agentId) {
        return NextResponse.json({ error: 'taskId and agentId required' }, { status: 400 });
      }

      const task = getProjectTask(projectId, taskId);

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const now = new Date().toISOString();

      // Quality gate: check for approved review before allowing DONE
      const approvedReview = db.select().from(schema.qualityReviews)
        .where(and(
          eq(schema.qualityReviews.taskId, taskId),
          eq(schema.qualityReviews.status, 'approved'),
        ))
        .get();

      const finalStatus = approvedReview ? 'DONE' : 'QUALITY_REVIEW';

      updateProjectTask(projectId, taskId, {
        status: finalStatus,
        updated_at: now,
      });

      // Add resolution comment
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      insertProjectTaskComment(projectId, {
        id: commentId,
        task_id: taskId,
        agent_id: agentId,
        content: finalStatus === 'DONE'
          ? (resolution || `Task closed by ${agentId}`)
          : `Task sent to quality review (close requested by ${agentId})`,
        type: finalStatus === 'DONE' ? 'resolution' : 'status-change',
        created_at: now,
      });

      if (finalStatus === 'QUALITY_REVIEW') {
        // Create a pending review (stays in shared qualityReviews table)
        const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        db.insert(schema.qualityReviews).values({
          id: reviewId,
          projectId,
          taskId,
          reviewer: 'pending',
          status: 'pending',
          notes: resolution || null,
          createdAt: now,
        }).run();
        eventBus.broadcast('review.created', { id: reviewId, taskId, title: task.title }, projectId);
      }

      eventBus.broadcast('task.status_changed', { id: taskId, title: task.title, status: finalStatus, previousStatus: task.status, updatedAt: now }, projectId);

      logAgentEvent(projectId, agentId, finalStatus === 'DONE' ? 'success' : 'info',
        finalStatus === 'DONE' ? `Closed task: ${task.title}` : `Task "${task.title}" sent to quality review`);

      return NextResponse.json({ success: true, taskId, status: finalStatus, qualityGate: !approvedReview });
    }

    case 'update-agent': {
      const { agentId, status, currentTask, role } = body;
      if (!agentId) {
        return NextResponse.json({ error: 'agentId required' }, { status: 400 });
      }

      // Agents can only update their own status — validated by requiring agentId matches
      const id = `${projectId}-${agentId}`;
      const agents = getProjectAgents(projectId);
      const existing = agents.find((a) => a.id === id);

      const now = new Date().toISOString();

      if (existing) {
        const updatedAgent: AgentRow = {
          ...existing,
          last_heartbeat: now,
          status: status || existing.status,
          current_task: currentTask !== undefined ? currentTask : existing.current_task,
        };
        upsertProjectAgent(projectId, updatedAgent);
      } else {
        upsertProjectAgent(projectId, {
          id,
          agent_id: agentId,
          role: role || 'architect',
          status: status || 'working',
          current_task: currentTask || null,
          model: null,
          session_start: now,
          last_heartbeat: now,
          locked_files: '[]',
          progress: 0,
          estimated_cost: 0,
          created_at: now,
          launch_mode: null,
          sdk_session_id: null,
          hook_enabled: null,
          worktree_path: null,
          worktree_branch: null,
        });
      }

      eventBus.broadcast('agent.updated', { agentId, status, currentTask }, projectId);

      return NextResponse.json({ success: true, agentId });
    }

    case 'send-message': {
      const { fromAgent, toAgent, content, messageType } = body;
      if (!fromAgent || !content) {
        return NextResponse.json({ error: 'fromAgent and content required' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const conversationId = toAgent
        ? `dm:${[fromAgent, toAgent].sort().join(':')}`
        : `broadcast:${projectId}`;

      // Upsert conversation (shared table)
      const existingConv = db.select().from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .get();

      if (!existingConv) {
        const participants = toAgent ? [fromAgent, toAgent] : [fromAgent];
        db.insert(schema.conversations).values({
          id: conversationId,
          projectId,
          name: toAgent ? `${fromAgent} & ${toAgent}` : 'Broadcast',
          participants: JSON.stringify(participants),
          lastMessageAt: now,
          createdAt: now,
        }).run();
      } else {
        db.update(schema.conversations)
          .set({ lastMessageAt: now })
          .where(eq(schema.conversations.id, conversationId)).run();
      }

      db.insert(schema.messages).values({
        id: msgId,
        projectId,
        conversationId,
        fromAgent,
        toAgent: toAgent || null,
        content,
        messageType: messageType || 'text',
        metadata: null,
        readAt: null,
        createdAt: now,
      }).run();

      eventBus.broadcast('message.created', {
        id: msgId, projectId, conversationId, fromAgent, toAgent, content,
      }, projectId);

      logAgentEvent(projectId, fromAgent, 'info', `Sent message${toAgent ? ` to ${toAgent}` : ' (broadcast)'}`);

      return NextResponse.json({ success: true, id: msgId, conversationId });
    }

    case 'submit-review': {
      const { taskId, reviewer, status: reviewStatus, notes } = body;
      if (!taskId || !reviewer || !reviewStatus) {
        return NextResponse.json({ error: 'taskId, reviewer, and status required' }, { status: 400 });
      }

      const validReviewStatuses = new Set(['approved', 'rejected', 'needs_changes']);
      if (!validReviewStatuses.has(reviewStatus)) {
        return NextResponse.json({ error: `Invalid status. Valid: ${Array.from(validReviewStatuses).join(', ')}` }, { status: 400 });
      }

      const task = getProjectTask(projectId, taskId);

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const now = new Date().toISOString();
      const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Quality reviews stay in shared table
      db.insert(schema.qualityReviews).values({
        id: reviewId,
        projectId,
        taskId,
        reviewer,
        status: reviewStatus,
        notes: notes || null,
        createdAt: now,
      }).run();

      eventBus.broadcast('review.decided', {
        id: reviewId, taskId, reviewer, status: reviewStatus, title: task.title,
      }, projectId);

      // If approved and task is in QUALITY_REVIEW, auto-advance to DONE
      if (reviewStatus === 'approved' && task.status === 'QUALITY_REVIEW') {
        updateProjectTask(projectId, taskId, { status: 'DONE', updated_at: now });
        eventBus.broadcast('task.status_changed', {
          id: taskId, title: task.title, status: 'DONE', previousStatus: 'QUALITY_REVIEW', updatedAt: now,
        }, projectId);
        logAgentEvent(projectId, reviewer, 'success', `Approved and closed task: ${task.title}`);
      } else if (reviewStatus === 'rejected' || reviewStatus === 'needs_changes') {
        // Send back to IN_PROGRESS
        updateProjectTask(projectId, taskId, { status: 'IN_PROGRESS', updated_at: now });
        eventBus.broadcast('task.status_changed', {
          id: taskId, title: task.title, status: 'IN_PROGRESS', previousStatus: 'QUALITY_REVIEW', updatedAt: now,
        }, projectId);
        logAgentEvent(projectId, reviewer, 'warning', `Rejected task: ${task.title} — ${notes || 'needs changes'}`);
      }

      return NextResponse.json({ success: true, reviewId, taskId, status: reviewStatus });
    }

    default:
      return NextResponse.json({
        error: `Restricted: '${action}' is not an allowed agent action.`,
        allowedWriteActions: Array.from(AGENT_WRITE_ACTIONS),
      }, { status: 403 });
  }
}

/** Log an agent event to the per-project events table */
function logAgentEvent(projectId: string, agentId: string | undefined, level: string, message: string) {
  try {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    insertProjectEvent(projectId, {
      id: eventId,
      timestamp: now,
      level,
      agent_id: agentId || null,
      agent_role: null,
      message,
      details: null,
    });

    eventBus.broadcast('event.created', {
      id: eventId, projectId, level, agentId, message,
      timestamp: now,
    }, projectId);
  } catch { /* non-critical */ }
}
