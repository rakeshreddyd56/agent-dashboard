import { NextRequest, NextResponse } from 'next/server';
import { getProjectSessions, getAllSessions } from '@/lib/coordination/jsonl-reader';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectPath = searchParams.get('projectPath');

  try {
    const sessions = projectPath
      ? getProjectSessions(projectPath)
      : getAllSessions();

    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ sessions: [], error: 'Failed to read sessions' });
  }
}
