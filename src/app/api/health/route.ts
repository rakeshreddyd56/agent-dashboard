import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/scheduler';

const startTime = Date.now();

export async function GET() {
  try {
    // Check DB connectivity
    let dbConnected = false;
    try {
      db.select().from(schema.projects).limit(1).all();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    let schedulerStatus;
    try {
      schedulerStatus = getSchedulerStatus();
    } catch {
      schedulerStatus = null;
    }

    return NextResponse.json({
      status: dbConnected ? 'ok' : 'degraded',
      uptime: uptimeSeconds,
      dbConnected,
      version: process.env.npm_package_version || '0.1.0',
      scheduler: schedulerStatus,
    });
  } catch (err) {
    console.error('GET /api/health error:', err);
    return NextResponse.json({ status: 'error', error: 'Health check failed' }, { status: 500 });
  }
}
