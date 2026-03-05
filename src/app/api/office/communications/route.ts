import { NextRequest, NextResponse } from 'next/server';
import type { FloorNumber, FloorMessageType } from '@/lib/types';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const floor = parseInt(req.nextUrl.searchParams.get('floor') || '0') as FloorNumber | 0;
  const date = req.nextUrl.searchParams.get('date');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

  try {
    const { getFloorMessages } = await import('@/lib/office/communication');

    const communications = getFloorMessages(projectId, {
      floor: floor || undefined,
      date: date || undefined,
      limit,
    });

    return NextResponse.json({ communications });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, fromFloor, toFloor, fromAgent, toAgent, messageType, content } = body;

    if (!projectId || !fromFloor || !toFloor || !fromAgent || !toAgent || !messageType || !content) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    const { sendFloorMessage } = await import('@/lib/office/communication');

    const comm = sendFloorMessage(
      projectId,
      { floor: fromFloor, agent: fromAgent },
      { floor: toFloor, agent: toAgent },
      messageType as FloorMessageType,
      content,
    );

    return NextResponse.json({ ok: true, communication: comm });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
