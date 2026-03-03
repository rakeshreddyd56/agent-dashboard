import { NextRequest } from 'next/server';
import { sseEmitter } from '@/lib/sse/emitter';
import { getProjectEvents } from '@/lib/db/project-queries';
import { projectTablesExist, createProjectTables } from '@/lib/db/dynamic-tables';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return new Response('projectId required', { status: 400 });
  }

  // If ?mode=json explicitly, return JSON. Otherwise default to SSE stream.
  const mode = searchParams.get('mode');
  if (mode === 'json') {
    if (!projectTablesExist(projectId)) {
      createProjectTables(projectId);
    }
    const events = getProjectEvents(projectId, { limit: 100 }).map((e) => ({
      id: e.id,
      projectId,
      timestamp: e.timestamp,
      level: e.level,
      agentId: e.agent_id,
      agentRole: e.agent_role,
      message: e.message,
      details: e.details,
    }));
    return Response.json({ events });
  }

  // SSE stream (default for EventSource connections)
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const stream = new ReadableStream({
    start(controller) {
      sseEmitter.addClient(clientId, controller, projectId);

      // Send initial ping
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`)
      );
    },
    cancel() {
      sseEmitter.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
