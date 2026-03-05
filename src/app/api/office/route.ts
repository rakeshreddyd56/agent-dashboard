import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { OFFICE_CONFIG } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  try {
    const { getProjectOfficeState } = await import('@/lib/office/idle-detector');
    const { getOfficeState } = await import('@/lib/office/floor-managers');

    const officeState = getProjectOfficeState(projectId);
    const managerState = getOfficeState(projectId);

    // Today's session
    const today = new Date().toISOString().split('T')[0];
    const currentSession = db.select().from(schema.researchSessions)
      .where(and(
        eq(schema.researchSessions.projectId, projectId),
        eq(schema.researchSessions.date, today),
      ))
      .get();

    // Recent sessions
    const recentSessions = db.select().from(schema.researchSessions)
      .where(eq(schema.researchSessions.projectId, projectId))
      .orderBy(desc(schema.researchSessions.createdAt))
      .limit(10)
      .all();

    // Council members
    const councilMembers = db.select().from(schema.councilMembers)
      .where(eq(schema.councilMembers.projectId, projectId))
      .all();

    return NextResponse.json({
      state: officeState.state,
      activeFloor: officeState.activeFloor,
      floorStatuses: officeState.floorStatuses,
      managerState: managerState.state,
      currentSession,
      recentSessions,
      councilMembers,
      config: {
        enabled: OFFICE_CONFIG.enabled,
        floors: OFFICE_CONFIG.floors,
        eodCommunicationHour: OFFICE_CONFIG.eodCommunicationHour,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, action } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    switch (action) {
      case 'start_ideation':
      case 'trigger_research': {
        const { triggerResearch } = await import('@/lib/office/floor-managers');
        const result = await triggerResearch(projectId);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
