import { NextRequest, NextResponse } from 'next/server';
import type { FloorNumber, MemoryType } from '@/lib/types';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const role = req.nextUrl.searchParams.get('role');
  const agentPrompt = req.nextUrl.searchParams.get('prompt');

  // Soul file and prompt lookups don't require projectId
  try {
    const memory = await import('@/lib/office/memory');

    // Read soul file (no projectId needed — soul files are global per role)
    if (role) {
      const soul = memory.getSoulFile(role);
      return NextResponse.json({ soul, role });
    }

    // Get system prompt for an agent
    if (agentPrompt && projectId) {
      const { getLatestPrompt } = await import('@/lib/office/prompt-generator');
      const prompt = getLatestPrompt(projectId, agentPrompt);
      return NextResponse.json({ prompt, agentRole: agentPrompt });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const floor = parseInt(req.nextUrl.searchParams.get('floor') || '0') as FloorNumber;
    const type = req.nextUrl.searchParams.get('type') as MemoryType | null;
    const date = req.nextUrl.searchParams.get('date');
    const query = req.nextUrl.searchParams.get('search');

    // Read daily log
    if (type === 'daily_log' && floor) {
      const log = memory.getDailyLog(floor, date || undefined);
      return NextResponse.json({ log, floor, date });
    }

    // Read long-term memory
    if (type === 'long_term' && floor) {
      const content = memory.getLongTermMemory(floor);
      return NextResponse.json({ content, floor });
    }

    // Search
    if (query) {
      const results = memory.searchMemory(projectId, {
        query,
        floor: floor || undefined,
        type: type || undefined,
      });
      return NextResponse.json({ results });
    }

    // Default: recent insights
    const insights = memory.getRecentInsights(projectId);
    return NextResponse.json({ insights });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, floor, title, content, tags, importance, type } = body;

    if (!projectId || !floor || !title || !content) {
      return NextResponse.json({ error: 'projectId, floor, title, content required' }, { status: 400 });
    }

    const memory = await import('@/lib/office/memory');

    if (type === 'long_term') {
      memory.addToLongTermMemory(projectId, floor, { title, content, tags, importance });
    } else {
      memory.appendDailyLog(projectId, floor, { title, content, source: 'manual', tags });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
