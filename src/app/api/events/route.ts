import { NextRequest } from 'next/server';
import { sseEmitter } from '@/lib/sse/emitter';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return new Response('projectId required', { status: 400 });
  }

  // If ?mode=json explicitly, return JSON. Otherwise default to SSE stream.
  const mode = searchParams.get('mode');
  if (mode === 'json') {
    const events = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.projectId, projectId))
      .orderBy(desc(schema.events.timestamp))
      .limit(100)
      .all();
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
