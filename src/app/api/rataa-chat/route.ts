import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { callLLM } from '@/lib/office/llm-client';
import { AGENT_CHARACTERS, OFFICE_CONFIG } from '@/lib/constants';
import { getProjectAgents, getProjectTasks } from '@/lib/db/project-queries';
import { projectTablesExist } from '@/lib/db/dynamic-tables';

type FloorId = 1 | 2 | 3;

const RATAA_MAP: Record<FloorId, { role: string; name: string; personality: string }> = {
  1: {
    role: 'rataa-research',
    name: 'Robin (Rataa-Research)',
    personality: `You are Nico Robin, the archaeologist and research lead. You speak thoughtfully, with calm wisdom and occasional dark humor. You oversee Floor 1: Research & Ideation, managing researchers Chopper, Brook, Jinbe, and Carrot. You run council deliberations, synthesize ideas, and hand off validated concepts to Floor 2.`,
  },
  2: {
    role: 'rataa-frontend',
    name: 'Nami & Franky (Rataa-Dev)',
    personality: `You represent both Nami (frontend lead) and Franky (backend lead) on Floor 2: Development. Nami is sharp, organized, and financially savvy. Franky is enthusiastic, inventive, and says "SUPER!" You manage architect Usopp, coder Sanji (frontend), Zoro & Law (backend), and testers Smoker & Tashigi. You coordinate architecture, implementation, and testing.`,
  },
  3: {
    role: 'rataa-ops',
    name: 'Luffy (Rataa-Ops)',
    personality: `You are Monkey D. Luffy, captain and ops commander on Floor 3: Operations Center. You're bold, direct, and action-oriented. You don't overthink — you do. You oversee CI/CD, deployments, and monitoring. You keep it simple and get things done. You receive build requests from Floor 2 and deploy with confidence.`,
  },
};

function buildFloorContext(
  floor: FloorId,
  projectId: string,
): string {
  let context = '';

  // Get agents on this floor
  if (projectTablesExist(projectId)) {
    const agents = getProjectAgents(projectId);
    const floorRoles = new Set(OFFICE_CONFIG.floorAgents[floor] || []);
    const floorAgents = agents.filter(a => floorRoles.has(a.role) || floorRoles.has(a.agent_id));

    if (floorAgents.length > 0) {
      context += '## Current Agent Status\n';
      for (const a of floorAgents) {
        const char = AGENT_CHARACTERS[a.role] || AGENT_CHARACTERS[a.agent_id];
        const name = char?.character || a.agent_id;
        context += `- **${name}** (${a.role}): ${a.status}`;
        if (a.current_task) context += ` — working on: ${a.current_task}`;
        context += '\n';
      }
      context += '\n';
    }

    // Get tasks
    const tasks = getProjectTasks(projectId);
    const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS');
    const todo = tasks.filter(t => t.status === 'TODO');
    const done = tasks.filter(t => t.status === 'DONE');

    context += '## Task Board Summary\n';
    context += `- In Progress: ${inProgress.length}\n`;
    context += `- To Do: ${todo.length}\n`;
    context += `- Done: ${done.length}\n`;

    if (inProgress.length > 0) {
      context += '\n### Active Tasks\n';
      for (const t of inProgress.slice(0, 8)) {
        context += `- ${t.external_id || t.id}: ${t.title}`;
        if (t.assigned_agent) context += ` (assigned: ${t.assigned_agent})`;
        context += '\n';
      }
    }
    context += '\n';
  }

  // Get recent floor communications
  try {
    const comms = db.select().from(schema.floorCommunications)
      .where(eq(schema.floorCommunications.projectId, projectId))
      .orderBy(desc(schema.floorCommunications.createdAt))
      .limit(10)
      .all()
      .filter(c => c.fromFloor === floor || c.toFloor === floor);

    if (comms.length > 0) {
      context += '## Recent Communications\n';
      for (const c of comms.slice(0, 5)) {
        context += `- [${c.messageType}] F${c.fromFloor}→F${c.toFloor}: ${c.content.slice(0, 120)}\n`;
      }
      context += '\n';
    }
  } catch { /* floorCommunications may not exist yet */ }

  // Get recent events
  try {
    const events = db.select().from(schema.events)
      .where(eq(schema.events.projectId, projectId))
      .orderBy(desc(schema.events.timestamp))
      .limit(8)
      .all();

    if (events.length > 0) {
      context += '## Recent Events\n';
      for (const e of events) {
        context += `- [${e.level}] ${e.agentId || 'system'}: ${e.message.slice(0, 100)}\n`;
      }
    }
  } catch { /* events table may not exist */ }

  return context;
}

// Store chat history per floor (in-memory, survives HMR via globalThis)
const gKey = '__rataa_chat_history__';
const g = globalThis as unknown as Record<string, Map<string, { role: string; content: string }[]>>;
if (!g[gKey]) g[gKey] = new Map();
const chatHistory = g[gKey];

function getHistory(key: string): { role: string; content: string }[] {
  if (!chatHistory.has(key)) chatHistory.set(key, []);
  return chatHistory.get(key)!;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, floor, message, action } = body as {
    projectId: string;
    floor: FloorId;
    message?: string;
    action?: 'summary' | 'status' | 'clear';
  };

  if (!projectId || !floor) {
    return NextResponse.json({ error: 'projectId and floor required' }, { status: 400 });
  }

  const rataa = RATAA_MAP[floor];
  if (!rataa) {
    return NextResponse.json({ error: 'Invalid floor (1-3)' }, { status: 400 });
  }

  const historyKey = `${projectId}:${floor}`;

  // Clear chat history
  if (action === 'clear') {
    chatHistory.delete(historyKey);
    return NextResponse.json({ ok: true, cleared: true });
  }

  // Build context
  const floorContext = buildFloorContext(floor, projectId);

  // Status/summary action — just return context with a brief LLM summary
  if (action === 'summary' || action === 'status') {
    const systemPrompt = `${rataa.personality}

You are providing a status update for your floor. Be concise and in-character. Use your One Piece personality. Respond in 3-5 bullet points covering: agent statuses, active work, any blockers or concerns.

${floorContext}`;

    const result = await callLLM('openrouter', 'anthropic/claude-sonnet-4-6', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: action === 'summary'
        ? 'Give me a summary of everything happening on your floor right now.'
        : 'What is the current status of your floor?' },
    ], { maxTokens: 1000, temperature: 0.6 });

    if (result.error) {
      return NextResponse.json({
        response: `[${rataa.name}] I'm having trouble connecting right now. Here's the raw status:\n\n${floorContext || 'No floor data available.'}`,
        floor,
        rataa: rataa.name,
        error: result.error,
      });
    }

    return NextResponse.json({
      response: result.content,
      floor,
      rataa: rataa.name,
      tokensUsed: result.tokensUsed,
    });
  }

  // Chat message
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required for chat' }, { status: 400 });
  }

  const history = getHistory(historyKey);

  const systemPrompt = `${rataa.personality}

You are chatting with the project manager (the human user) who oversees all three floors. Answer their questions about your floor's progress, agents, tasks, and status. Stay in character. Be helpful and informative but concise. If they ask about other floors, tell them what you know from inter-floor communications but suggest they talk to that floor's Rataa directly.

## Current Floor Context
${floorContext}`;

  // Build messages: system + recent history + new message
  const llmMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message.trim() },
  ];

  const result = await callLLM('openrouter', 'anthropic/claude-sonnet-4-6', llmMessages, {
    maxTokens: 1500,
    temperature: 0.7,
  });

  if (result.error) {
    return NextResponse.json({
      response: `[Connection issue] ${result.error}`,
      floor,
      rataa: rataa.name,
      error: result.error,
    });
  }

  // Save to history
  history.push({ role: 'user', content: message.trim() });
  history.push({ role: 'assistant', content: result.content });

  // Cap history at 30 messages
  if (history.length > 30) {
    history.splice(0, history.length - 30);
  }

  // Also save to messages DB for persistence
  try {
    const now = new Date().toISOString();
    const convId = `rataa-chat:floor-${floor}`;

    const existingConv = db.select().from(schema.conversations)
      .where(eq(schema.conversations.id, convId)).get();

    if (!existingConv) {
      db.insert(schema.conversations).values({
        id: convId,
        projectId,
        name: `Chat with ${rataa.name}`,
        participants: JSON.stringify(['dashboard', rataa.role]),
        lastMessageAt: now,
        createdAt: now,
      }).run();
    } else {
      db.update(schema.conversations)
        .set({ lastMessageAt: now })
        .where(eq(schema.conversations.id, convId)).run();
    }

    // Save user message
    db.insert(schema.messages).values({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId, conversationId: convId,
      fromAgent: 'dashboard', toAgent: rataa.role,
      content: message.trim(), messageType: 'text',
      metadata: null, readAt: null, createdAt: now,
    }).run();

    // Save Rataa response
    db.insert(schema.messages).values({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId, conversationId: convId,
      fromAgent: rataa.role, toAgent: 'dashboard',
      content: result.content, messageType: 'text',
      metadata: JSON.stringify({ tokensUsed: result.tokensUsed, model: result.model }),
      readAt: null, createdAt: new Date(Date.now() + 1).toISOString(),
    }).run();
  } catch { /* DB save is best-effort */ }

  return NextResponse.json({
    response: result.content,
    floor,
    rataa: rataa.name,
    tokensUsed: result.tokensUsed,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const floor = parseInt(searchParams.get('floor') || '0') as FloorId;

  if (!projectId || !floor) {
    return NextResponse.json({ error: 'projectId and floor required' }, { status: 400 });
  }

  // Return chat history from DB
  const convId = `rataa-chat:floor-${floor}`;
  const messages = db.select().from(schema.messages)
    .where(and(
      eq(schema.messages.projectId, projectId),
      eq(schema.messages.conversationId, convId),
    ))
    .orderBy(desc(schema.messages.createdAt))
    .limit(50)
    .all()
    .reverse();

  const rataa = RATAA_MAP[floor];

  return NextResponse.json({
    messages: messages.map(m => ({
      id: m.id,
      role: m.fromAgent === 'dashboard' ? 'user' : 'assistant',
      content: m.content,
      from: m.fromAgent,
      createdAt: m.createdAt,
    })),
    rataa: rataa?.name || `Floor ${floor} Rataa`,
  });
}
