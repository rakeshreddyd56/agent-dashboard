/**
 * Floor Managers — State machine orchestrating the 3-floor office pipeline.
 *
 * State flow:
 * IDLE → CLONING → ANALYZING → RESEARCHING → REVIEWING → SYNTHESIZING → PLANNING
 *      → DELEGATING → DEVELOPING → TESTING
 *      → BUILDING → DEPLOYING → COMPLETE
 */

import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { eventBus } from '@/lib/events/event-bus';
import { OFFICE_CONFIG } from '@/lib/constants';
import { cloneAndAnalyze, analyzeLocalProject } from './git-analyzer';
import { runResearchCouncil } from './council';
import { appendDailyLog, addToLongTermMemory, flushKeyInsights } from './memory';
import { sendFloorMessage, sendDailySummaries } from './communication';
import { isFloorIdle, shouldActivateFloor } from './idle-detector';
import { generateFloor2Prompts } from './prompt-generator';
import type { OfficeState, CouncilMember, ResearchIdea, FloorNumber } from '@/lib/types';

// In-memory state tracking
const projectStates = new Map<string, { state: OfficeState; sessionId: string | null }>();

function getState(projectId: string): { state: OfficeState; sessionId: string | null } {
  return projectStates.get(projectId) || { state: 'IDLE', sessionId: null };
}

function genId(): string {
  return `rs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function nowISO(): string {
  return new Date().toISOString();
}

function transitionState(projectId: string, from: OfficeState, to: OfficeState, sessionId: string) {
  projectStates.set(projectId, { state: to, sessionId });

  // Update DB
  const now = nowISO();
  db.update(schema.researchSessions)
    .set({ state: to, updatedAt: now })
    .where(eq(schema.researchSessions.id, sessionId))
    .run();

  // Broadcast SSE
  eventBus.broadcast('office.state_changed' as any, { from, to, sessionId, projectId }, projectId);

  // Log to memory
  const activeFloor: FloorNumber =
    ['CLONING', 'ANALYZING', 'RESEARCHING', 'REVIEWING', 'SYNTHESIZING', 'PLANNING'].includes(to) ? 1 :
    ['DELEGATING', 'DEVELOPING', 'TESTING'].includes(to) ? 2 : 3;

  appendDailyLog(projectId, activeFloor, {
    title: `State: ${from} → ${to}`,
    content: `Office transitioned from ${from} to ${to}`,
    source: 'floor-manager',
  });
}

// ─── Floor 1: Research & Ideation ─────────────────────────────────

async function runFloor1(projectId: string, sessionId: string): Promise<void> {
  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get();

  if (!project) return;

  // CLONING
  transitionState(projectId, 'IDLE', 'CLONING', sessionId);
  let analysis;
  if (project.gitUrl) {
    analysis = await cloneAndAnalyze(project.gitUrl, projectId);
  } else {
    analysis = await analyzeLocalProject(project.path);
  }

  db.update(schema.researchSessions)
    .set({ gitAnalysis: JSON.stringify(analysis), updatedAt: nowISO() })
    .where(eq(schema.researchSessions.id, sessionId))
    .run();

  // ANALYZING → RESEARCHING
  transitionState(projectId, 'CLONING', 'ANALYZING', sessionId);
  transitionState(projectId, 'ANALYZING', 'RESEARCHING', sessionId);

  // Get council members
  const members = db.select().from(schema.councilMembers)
    .where(and(
      eq(schema.councilMembers.projectId, projectId),
      eq(schema.councilMembers.isActive, true),
    ))
    .all() as unknown as CouncilMember[];

  if (members.length === 0) {
    // Seed default council
    for (const def of OFFICE_CONFIG.defaultCouncil) {
      db.insert(schema.councilMembers).values({
        id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        projectId,
        name: def.name,
        provider: def.provider,
        model: def.model,
        role: def.role,
        isActive: true,
        totalVotes: 0,
        createdAt: nowISO(),
      }).run();
    }
    members.push(...db.select().from(schema.councilMembers)
      .where(eq(schema.councilMembers.projectId, projectId))
      .all() as unknown as CouncilMember[]);
  }

  // Get previous ideas to avoid duplicates
  const previousSessions = db.select().from(schema.researchSessions)
    .where(eq(schema.researchSessions.projectId, projectId))
    .all();

  const previousIdeas: ResearchIdea[] = previousSessions
    .filter(s => s.selectedIdea)
    .flatMap(s => {
      try { return JSON.parse(s.selectedIdea!); } catch { return []; }
    });

  // Run council
  const result = await runResearchCouncil({
    members,
    projectId,
    gitAnalysis: analysis,
    previousIdeas,
  });

  // Save results
  transitionState(projectId, 'RESEARCHING', 'REVIEWING', sessionId);

  db.update(schema.researchSessions).set({
    councilResponses: result.councilResponses,
    updatedAt: nowISO(),
  }).where(eq(schema.researchSessions.id, sessionId)).run();

  transitionState(projectId, 'REVIEWING', 'SYNTHESIZING', sessionId);

  db.update(schema.researchSessions).set({
    peerReviews: result.peerReviews,
    synthesis: result.ideationPlan,
    selectedIdea: JSON.stringify(result.selectedIdeas),
    votes: JSON.stringify(result.votes),
    ideationPlan: result.ideationPlan,
    updatedAt: nowISO(),
  }).where(eq(schema.researchSessions.id, sessionId)).run();

  // PLANNING
  transitionState(projectId, 'SYNTHESIZING', 'PLANNING', sessionId);

  // Save to long-term memory
  addToLongTermMemory(projectId, 1, {
    title: `Ideation: ${result.selectedIdeas.map(i => i.title).join(', ')}`,
    content: result.ideationPlan,
    tags: ['ideation', 'council-result'],
    importance: 9,
  });

  // Hand off to 2nd floor
  sendFloorMessage(
    projectId,
    { floor: 1, agent: 'rataa-research' },
    { floor: 2, agent: 'rataa-frontend' },
    'ideation_handoff',
    {
      selectedIdeas: result.selectedIdeas,
      ideationPlan: result.ideationPlan,
      gitAnalysis: analysis,
    },
  );

  sendFloorMessage(
    projectId,
    { floor: 1, agent: 'rataa-research' },
    { floor: 2, agent: 'rataa-backend' },
    'ideation_handoff',
    {
      selectedIdeas: result.selectedIdeas,
      ideationPlan: result.ideationPlan,
      gitAnalysis: analysis,
    },
  );

  // Transition to DELEGATING (floor 2 takes over)
  transitionState(projectId, 'PLANNING', 'DELEGATING', sessionId);

  // Generate system prompts for all Floor 2 dev agents
  const promptContext = {
    projectId,
    projectName: project.name,
    gitAnalysis: analysis,
    ideationPlan: result.ideationPlan,
    selectedIdeas: result.selectedIdeas,
  };

  const promptResult = await generateFloor2Prompts(promptContext);

  appendDailyLog(projectId, 2, {
    title: 'System Prompts Generated',
    content: `Generated prompts for ${Object.keys(promptResult.prompts).length} agents. ${
      promptResult.errors.length ? `Errors: ${promptResult.errors.join('; ')}` : 'All successful.'
    }`,
    source: 'floor-manager',
  });

  eventBus.broadcast('office.research_complete' as any, {
    sessionId,
    selectedIdeas: result.selectedIdeas,
    ideationPlan: result.ideationPlan,
    generatedPrompts: Object.keys(promptResult.prompts),
  }, projectId);
}

// ─── Main Orchestration ───────────────────────────────────────────

export async function runOfficeCycle(projectId: string): Promise<{
  ok: boolean;
  message: string;
  stateTransition?: { from: OfficeState; to: OfficeState };
}> {
  const current = getState(projectId);

  // If already running, skip
  if (current.state !== 'IDLE' && current.state !== 'COMPLETE') {
    // Check if we should advance to next floor
    if (current.state === 'DELEGATING' && isFloorIdle(projectId, 2)) {
      // Floor 2 is done, move to building
      if (current.sessionId) {
        transitionState(projectId, 'DELEGATING', 'DEVELOPING', current.sessionId);
        return { ok: true, message: 'Floor 2 activated', stateTransition: { from: 'DELEGATING', to: 'DEVELOPING' } };
      }
    }
    return { ok: true, message: `Already in state: ${current.state}` };
  }

  // Check if we should start
  if (!shouldActivateFloor(projectId, 1)) {
    return { ok: true, message: 'Floor 1 activation conditions not met' };
  }

  // Check enabled
  if (!OFFICE_CONFIG.enabled || process.env.OFFICE_ENABLED === 'false') {
    return { ok: true, message: 'Office disabled' };
  }

  // Create session
  const sessionId = genId();
  const date = today();
  const now = nowISO();

  db.insert(schema.researchSessions).values({
    id: sessionId,
    projectId,
    date,
    state: 'IDLE',
    triggeredAt: now,
    createdAt: now,
    updatedAt: now,
  }).run();

  projectStates.set(projectId, { state: 'IDLE', sessionId });

  // Run floor 1 (async, non-blocking)
  runFloor1(projectId, sessionId).catch(err => {
    console.error('[office] Floor 1 error:', err);
    appendDailyLog(projectId, 1, {
      title: 'Floor 1 Error',
      content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      source: 'floor-manager',
    });
  });

  return {
    ok: true,
    message: 'Office cycle started',
    stateTransition: { from: 'IDLE', to: 'CLONING' },
  };
}

/**
 * Run daily EOD communication between all Rataas.
 */
export async function runDailyCommunication(projectId: string): Promise<{ ok: boolean; message: string }> {
  const floor1Memory = (await import('./memory')).getDailyLog(1);
  const floor2Memory = (await import('./memory')).getDailyLog(2);
  const floor3Memory = (await import('./memory')).getDailyLog(3);

  sendDailySummaries(projectId, {
    floor1: floor1Memory || 'No activity on Floor 1 today.',
    floor2: floor2Memory || 'No activity on Floor 2 today.',
    floor3: floor3Memory || 'No activity on Floor 3 today.',
  });

  // Flush key insights to long-term memory
  for (const floor of [1, 2, 3] as FloorNumber[]) {
    flushKeyInsights(projectId, floor, [
      { title: `EOD Summary - ${today()}`, content: `Daily communication completed`, importance: 5 },
    ]);
  }

  return { ok: true, message: 'Daily communication sent between all Rataas' };
}

/**
 * Restore state from DB on server restart.
 */
export function restoreOfficeState(projectId: string) {
  const date = today();
  const session = db.select().from(schema.researchSessions)
    .where(and(
      eq(schema.researchSessions.projectId, projectId),
      eq(schema.researchSessions.date, date),
    ))
    .get();

  if (session && session.state !== 'COMPLETE' && session.state !== 'IDLE') {
    projectStates.set(projectId, {
      state: session.state as OfficeState,
      sessionId: session.id,
    });
  }
}

/**
 * Get current office state for a project.
 */
export function getOfficeState(projectId: string): { state: OfficeState; sessionId: string | null } {
  return getState(projectId);
}

/**
 * Manually trigger research for a project.
 */
export async function triggerResearch(projectId: string): Promise<{ ok: boolean; message: string }> {
  const current = getState(projectId);
  if (current.state !== 'IDLE' && current.state !== 'COMPLETE') {
    return { ok: false, message: `Cannot trigger: office is in state ${current.state}` };
  }

  // Reset state
  projectStates.set(projectId, { state: 'IDLE', sessionId: null });
  return runOfficeCycle(projectId);
}
