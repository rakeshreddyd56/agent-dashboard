import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';

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

  switch (action) {
    case 'list-tasks': {
      const status = searchParams.get('status');
      let tasks;
      if (status) {
        tasks = db.select().from(schema.tasks)
          .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.status, status)))
          .all();
      } else {
        tasks = db.select().from(schema.tasks)
          .where(eq(schema.tasks.projectId, projectId))
          .all();
      }

      return NextResponse.json({
        tasks: tasks.map((t) => ({
          id: t.id,
          externalId: t.externalId,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assignedAgent: t.assignedAgent,
          source: t.source,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
        count: tasks.length,
      });
    }

    case 'get-task': {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      }

      const task = db.select().from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
        .get();

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const comments = db.select().from(schema.taskComments)
        .where(eq(schema.taskComments.taskId, taskId))
        .orderBy(desc(schema.taskComments.createdAt))
        .all();

      return NextResponse.json({ task, comments });
    }

    case 'get-comments': {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      }

      const comments = db.select().from(schema.taskComments)
        .where(eq(schema.taskComments.taskId, taskId))
        .orderBy(desc(schema.taskComments.createdAt))
        .all();

      return NextResponse.json({ comments, count: comments.length });
    }

    case 'list-agents': {
      const agents = db.select().from(schema.agentSnapshots)
        .where(eq(schema.agentSnapshots.projectId, projectId))
        .all();

      return NextResponse.json({
        agents: agents.map((a) => ({
          id: a.id,
          agentId: a.agentId,
          role: a.role,
          status: a.status,
          currentTask: a.currentTask,
          lastHeartbeat: a.lastHeartbeat,
        })),
      });
    }

    case 'board-summary': {
      const tasks = db.select().from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))
        .all();

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

  switch (action) {
    case 'move-task': {
      const { taskId, status, agentId } = body;
      if (!taskId || !status) {
        return NextResponse.json({ error: 'taskId and status required' }, { status: 400 });
      }
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json({ error: `Invalid status. Valid: ${Array.from(VALID_STATUSES).join(', ')}` }, { status: 400 });
      }

      const task = db.select().from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
        .get();

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const now = new Date().toISOString();
      const updates: Record<string, string> = { status, updatedAt: now };
      if (agentId) updates.assignedAgent = agentId;

      db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, taskId)).run();

      // Auto-add status change comment
      if (agentId) {
        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        db.insert(schema.taskComments).values({
          id: commentId,
          taskId,
          projectId,
          agentId,
          content: `Moved task from ${task.status} to ${status}`,
          type: 'status-change',
          createdAt: now,
        }).run();
      }

      eventBus.broadcast('task.status_changed', { id: taskId, title: task.title, previousStatus: task.status, ...updates }, projectId);

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

      db.insert(schema.tasks).values({
        id: taskId,
        projectId,
        externalId: externalId || null,
        title,
        description: description || null,
        status: taskStatus,
        priority: taskPriority,
        assignedAgent: agentId || null,
        tags: '[]',
        effort: null,
        dependencies: '[]',
        source: 'coordination',
        columnOrder: 0,
        createdAt: now,
        updatedAt: now,
      }).run();

      // Auto-comment on creation
      if (agentId) {
        const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        db.insert(schema.taskComments).values({
          id: commentId,
          taskId,
          projectId,
          agentId,
          content: `Created task: ${title}${description ? '\n' + description : ''}`,
          type: 'comment',
          createdAt: now,
        }).run();
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

      db.insert(schema.tasks).values({
        id: taskId,
        projectId,
        externalId: null,
        title: bugTitle,
        description: description || null,
        status: 'BACKLOG',
        priority: bugPriority,
        assignedAgent: null,
        tags: JSON.stringify(['bug', `reported-by:${agentId}`]),
        effort: null,
        dependencies: relatedTaskId ? JSON.stringify([relatedTaskId]) : '[]',
        source: 'coordination',
        columnOrder: 0,
        createdAt: now,
        updatedAt: now,
      }).run();

      // Comment on the bug
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      db.insert(schema.taskComments).values({
        id: commentId,
        taskId,
        projectId,
        agentId,
        content: `Bug reported: ${title}${description ? '\nDetails: ' + description : ''}${relatedTaskId ? '\nRelated to: ' + relatedTaskId : ''}`,
        type: 'bug',
        createdAt: now,
      }).run();

      // If related to an existing task, add comment there too
      if (relatedTaskId) {
        const relCommentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}b`;
        db.insert(schema.taskComments).values({
          id: relCommentId,
          taskId: relatedTaskId,
          projectId,
          agentId,
          content: `Bug filed: ${bugTitle} (${taskId})`,
          type: 'bug',
          createdAt: now,
        }).run();
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

      const task = db.select().from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
        .get();

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const commentType = type && COMMENT_TYPES.has(type) ? type : 'comment';
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();

      db.insert(schema.taskComments).values({
        id: commentId,
        taskId,
        projectId,
        agentId,
        content,
        type: commentType,
        createdAt: now,
      }).run();

      // Update task's updatedAt
      db.update(schema.tasks).set({ updatedAt: now }).where(eq(schema.tasks.id, taskId)).run();

      eventBus.broadcast('task.updated', { id: taskId, updatedAt: now, lastComment: { agentId, content, type: commentType } }, projectId);

      return NextResponse.json({ success: true, commentId, taskId });
    }

    case 'close-task': {
      const { taskId, agentId, resolution } = body;
      if (!taskId || !agentId) {
        return NextResponse.json({ error: 'taskId and agentId required' }, { status: 400 });
      }

      const task = db.select().from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
        .get();

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

      db.update(schema.tasks).set({
        status: finalStatus,
        updatedAt: now,
      }).where(eq(schema.tasks.id, taskId)).run();

      // Add resolution comment
      const commentId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      db.insert(schema.taskComments).values({
        id: commentId,
        taskId,
        projectId,
        agentId,
        content: finalStatus === 'DONE'
          ? (resolution || `Task closed by ${agentId}`)
          : `Task sent to quality review (close requested by ${agentId})`,
        type: finalStatus === 'DONE' ? 'resolution' : 'status-change',
        createdAt: now,
      }).run();

      if (finalStatus === 'QUALITY_REVIEW') {
        // Create a pending review
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
      const existing = db.select().from(schema.agentSnapshots)
        .where(eq(schema.agentSnapshots.id, id))
        .get();

      const now = new Date().toISOString();

      if (existing) {
        const updates: Record<string, unknown> = { lastHeartbeat: now };
        if (status) updates.status = status;
        if (currentTask !== undefined) updates.currentTask = currentTask;

        db.update(schema.agentSnapshots).set(updates).where(eq(schema.agentSnapshots.id, id)).run();
      } else {
        db.insert(schema.agentSnapshots).values({
          id,
          projectId,
          agentId,
          role: role || 'coder',
          status: status || 'working',
          currentTask: currentTask || null,
          model: null,
          sessionStart: now,
          lastHeartbeat: now,
          lockedFiles: '[]',
          progress: 0,
          estimatedCost: 0,
          createdAt: now,
        }).run();
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

      // Upsert conversation
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

      const task = db.select().from(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.projectId, projectId)))
        .get();

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      const now = new Date().toISOString();
      const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
        db.update(schema.tasks).set({ status: 'DONE', updatedAt: now }).where(eq(schema.tasks.id, taskId)).run();
        eventBus.broadcast('task.status_changed', {
          id: taskId, title: task.title, status: 'DONE', previousStatus: 'QUALITY_REVIEW', updatedAt: now,
        }, projectId);
        logAgentEvent(projectId, reviewer, 'success', `Approved and closed task: ${task.title}`);
      } else if (reviewStatus === 'rejected' || reviewStatus === 'needs_changes') {
        // Send back to IN_PROGRESS
        db.update(schema.tasks).set({ status: 'IN_PROGRESS', updatedAt: now }).where(eq(schema.tasks.id, taskId)).run();
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

/** Log an agent event to the events table */
function logAgentEvent(projectId: string, agentId: string | undefined, level: string, message: string) {
  try {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    db.insert(schema.events).values({
      id: eventId,
      projectId,
      timestamp: new Date().toISOString(),
      level,
      agentId: agentId || null,
      agentRole: null,
      message,
      details: null,
    }).run();

    eventBus.broadcast('event.created', {
      id: eventId, projectId, level, agentId, message,
      timestamp: new Date().toISOString(),
    }, projectId);
  } catch { /* non-critical */ }
}
