/**
 * Communication Protocol — Floor-to-floor messaging between Rataas.
 */

import fs from 'fs';
import path from 'path';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';
import type { FloorNumber, FloorMessageType, FloorCommunication } from '@/lib/types';

const OFFICE_DIR = path.resolve('./data/office');

function genId(): string {
  return `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Send a message between floors.
 */
export function sendFloorMessage(
  projectId: string,
  from: { floor: FloorNumber; agent: string },
  to: { floor: FloorNumber; agent: string },
  messageType: FloorMessageType,
  content: unknown,
  metadata?: unknown,
): FloorCommunication {
  const date = today();
  const id = genId();
  const now = nowISO();

  const comm: FloorCommunication = {
    id,
    projectId,
    date,
    fromFloor: from.floor,
    toFloor: to.floor,
    fromAgent: from.agent,
    toAgent: to.agent,
    messageType,
    content: JSON.stringify(content),
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    acknowledged: false,
    createdAt: now,
  };

  // Insert to DB
  db.insert(schema.floorCommunications).values({
    id,
    projectId,
    date,
    fromFloor: from.floor,
    toFloor: to.floor,
    fromAgent: from.agent,
    toAgent: to.agent,
    messageType,
    content: JSON.stringify(content),
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    acknowledged: false,
    createdAt: now,
  }).run();

  // Write to filesystem
  const commDir = path.join(OFFICE_DIR, `floor-${to.floor}`, 'communications');
  if (!fs.existsSync(commDir)) {
    fs.mkdirSync(commDir, { recursive: true });
  }
  const filePath = path.join(commDir, `${date}.json`);

  let existing: FloorCommunication[] = [];
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* start fresh */ }
  }
  existing.push(comm);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');

  // Broadcast SSE
  eventBus.broadcast('office.communication' as any, comm, projectId);

  return comm;
}

/**
 * Acknowledge a message.
 */
export function acknowledgeMessage(id: string) {
  db.update(schema.floorCommunications)
    .set({ acknowledged: true })
    .where(eq(schema.floorCommunications.id, id))
    .run();
}

/**
 * Get floor messages with filters.
 */
export function getFloorMessages(
  projectId: string,
  opts?: { floor?: FloorNumber; date?: string; type?: FloorMessageType; limit?: number },
): FloorCommunication[] {
  const limit = opts?.limit || 50;
  const rows = db.select().from(schema.floorCommunications)
    .where(eq(schema.floorCommunications.projectId, projectId))
    .orderBy(desc(schema.floorCommunications.createdAt))
    .limit(limit)
    .all();

  let results = rows as unknown as FloorCommunication[];

  if (opts?.floor) {
    results = results.filter(r => r.fromFloor === opts.floor || r.toFloor === opts.floor);
  }
  if (opts?.date) {
    results = results.filter(r => r.date === opts.date);
  }
  if (opts?.type) {
    results = results.filter(r => r.messageType === opts.type);
  }

  return results;
}

/**
 * Send daily summaries between all Rataas.
 */
export function sendDailySummaries(projectId: string, summaries: {
  floor1?: string;
  floor2?: string;
  floor3?: string;
}) {
  const date = today();

  if (summaries.floor1) {
    sendFloorMessage(
      projectId,
      { floor: 1, agent: 'rataa-research' },
      { floor: 2, agent: 'rataa-frontend' },
      'daily_summary',
      { summary: summaries.floor1, date },
    );
    sendFloorMessage(
      projectId,
      { floor: 1, agent: 'rataa-research' },
      { floor: 2, agent: 'rataa-backend' },
      'daily_summary',
      { summary: summaries.floor1, date },
    );
  }

  if (summaries.floor2) {
    sendFloorMessage(
      projectId,
      { floor: 2, agent: 'rataa-frontend' },
      { floor: 1, agent: 'rataa-research' },
      'daily_summary',
      { summary: summaries.floor2, date },
    );
    sendFloorMessage(
      projectId,
      { floor: 2, agent: 'rataa-backend' },
      { floor: 3, agent: 'rataa-ops' },
      'daily_summary',
      { summary: summaries.floor2, date },
    );
  }

  if (summaries.floor3) {
    sendFloorMessage(
      projectId,
      { floor: 3, agent: 'rataa-ops' },
      { floor: 2, agent: 'rataa-frontend' },
      'daily_summary',
      { summary: summaries.floor3, date },
    );
    sendFloorMessage(
      projectId,
      { floor: 3, agent: 'rataa-ops' },
      { floor: 2, agent: 'rataa-backend' },
      'daily_summary',
      { summary: summaries.floor3, date },
    );
  }
}
