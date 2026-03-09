import { NextRequest, NextResponse } from 'next/server';
import { getSchedulerStatus, triggerTask, initScheduler } from '@/lib/scheduler';
import { validateAuth } from '@/lib/auth';

export async function GET() {
  initScheduler(); // Ensure scheduler is initialized in this module context
  return NextResponse.json({ tasks: getSchedulerStatus() });
}

export async function POST(req: NextRequest) {
  const authError = validateAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { task } = body;

  if (!task) {
    return NextResponse.json({ error: 'task key required' }, { status: 400 });
  }

  const result = await triggerTask(task);
  return NextResponse.json(result);
}
