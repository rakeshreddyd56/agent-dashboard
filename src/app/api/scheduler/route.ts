import { NextRequest, NextResponse } from 'next/server';
import { getSchedulerStatus, triggerTask } from '@/lib/scheduler';

export async function GET() {
  return NextResponse.json({ tasks: getSchedulerStatus() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { task } = body;

  if (!task) {
    return NextResponse.json({ error: 'task key required' }, { status: 400 });
  }

  const result = await triggerTask(task);
  return NextResponse.json(result);
}
