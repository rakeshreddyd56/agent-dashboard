/**
 * System Prompt Generator — Rataas generate per-agent system prompts
 * using SOUL files, project context, architecture, and task details.
 *
 * Each agent gets a unique system prompt that includes:
 * - Their SOUL personality (One Piece character traits)
 * - Project context (tech stack, git analysis)
 * - Architecture decisions from Usopp-Architect
 * - API contracts between Nami and Franky
 * - Their specific task/ticket details
 */

import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getSoulFile } from './memory';
import { AGENT_CHARACTERS } from '@/lib/constants';
import { callLLM } from './llm-client';
import type { AgentRole, GitProjectAnalysis, ResearchIdea } from '@/lib/types';

export interface PromptContext {
  projectId: string;
  projectName: string;
  gitAnalysis?: GitProjectAnalysis;
  ideationPlan?: string;
  selectedIdeas?: ResearchIdea[];
  architecturePlan?: string;
  apiContracts?: string;
  taskTitle?: string;
  taskDescription?: string;
  ticketDetails?: string;
  additionalContext?: string;
}

/**
 * Generate a system prompt for a specific agent role using their SOUL file + project context.
 * Called by Rataas (Nami, Franky) when delegating tasks to dev agents.
 */
export async function generateAgentSystemPrompt(
  agentRole: AgentRole,
  context: PromptContext,
  generatedBy: string,
): Promise<{ prompt: string; id: string }> {
  const character = AGENT_CHARACTERS[agentRole];
  const soulContent = getSoulFile(soulKeyForRole(agentRole));

  // Build the meta-prompt for the Rataa to generate the system prompt
  const metaPrompt = buildMetaPrompt(agentRole, character, soulContent, context);

  // Use the Rataa's model (opus) to generate the system prompt
  const result = await callLLM('openrouter', 'anthropic/claude-sonnet-4-6', [
    {
      role: 'system',
      content: `You are ${generatedBy}, a team lead generating a system prompt for one of your team members. Generate a complete, detailed system prompt that this agent will use for their coding session. The system prompt should include their personality, project context, specific instructions, and task details. Output ONLY the system prompt text — no meta-commentary.`,
    },
    { role: 'user', content: metaPrompt },
  ], { maxTokens: 4000 });

  const prompt = result.content || buildFallbackPrompt(agentRole, character, soulContent, context);

  // Save to DB
  const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  db.insert(schema.agentSystemPrompts).values({
    id,
    projectId: context.projectId,
    agentRole,
    prompt,
    missionGoal: context.taskTitle || null,
    generatedBy,
    createdAt: now,
  }).run();

  return { prompt, id };
}

/**
 * Generate system prompts for ALL dev agents on Floor 2.
 * Called by Nami-Frontend and Franky-Backend during the DELEGATING phase.
 */
export async function generateFloor2Prompts(context: PromptContext): Promise<{
  prompts: Record<string, { prompt: string; id: string }>;
  errors: string[];
}> {
  const prompts: Record<string, { prompt: string; id: string }> = {};
  const errors: string[] = [];

  // Nami generates prompts for frontend agents
  const frontendAgents: AgentRole[] = ['frontend'];
  for (const role of frontendAgents) {
    try {
      prompts[role] = await generateAgentSystemPrompt(role, context, 'Nami-Frontend');
    } catch (err) {
      errors.push(`Failed to generate prompt for ${role}: ${err instanceof Error ? err.message : String(err)}`);
      // Use fallback
      const character = AGENT_CHARACTERS[role];
      const soul = getSoulFile(soulKeyForRole(role));
      const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const prompt = buildFallbackPrompt(role, character, soul, context);
      db.insert(schema.agentSystemPrompts).values({
        id, projectId: context.projectId, agentRole: role, prompt,
        missionGoal: context.taskTitle || null, generatedBy: 'Nami-Frontend', createdAt: new Date().toISOString(),
      }).run();
      prompts[role] = { prompt, id };
    }
  }

  // Franky generates prompts for backend agents
  const backendAgents: AgentRole[] = ['backend-1', 'backend-2'];
  for (const role of backendAgents) {
    try {
      prompts[role] = await generateAgentSystemPrompt(role, context, 'Franky-Backend');
    } catch (err) {
      errors.push(`Failed to generate prompt for ${role}: ${err instanceof Error ? err.message : String(err)}`);
      const character = AGENT_CHARACTERS[role];
      const soul = getSoulFile(soulKeyForRole(role));
      const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const prompt = buildFallbackPrompt(role, character, soul, context);
      db.insert(schema.agentSystemPrompts).values({
        id, projectId: context.projectId, agentRole: role, prompt,
        missionGoal: context.taskTitle || null, generatedBy: 'Franky-Backend', createdAt: new Date().toISOString(),
      }).run();
      prompts[role] = { prompt, id };
    }
  }

  // Usopp-Architect gets a prompt from both Nami and Franky's context
  try {
    prompts['architect'] = await generateAgentSystemPrompt('architect', context, 'Nami-Frontend & Franky-Backend');
  } catch (err) {
    errors.push(`Failed to generate prompt for architect: ${err instanceof Error ? err.message : String(err)}`);
    const character = AGENT_CHARACTERS['architect'];
    const soul = getSoulFile('architect');
    const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const prompt = buildFallbackPrompt('architect', character, soul, context);
    db.insert(schema.agentSystemPrompts).values({
      id, projectId: context.projectId, agentRole: 'architect', prompt,
      missionGoal: context.taskTitle || null, generatedBy: 'Nami-Frontend & Franky-Backend', createdAt: new Date().toISOString(),
    }).run();
    prompts['architect'] = { prompt, id };
  }

  // Testers get prompts from both managers
  const testerAgents: AgentRole[] = ['tester-1', 'tester-2'];
  for (const role of testerAgents) {
    try {
      prompts[role] = await generateAgentSystemPrompt(role, context, 'Nami-Frontend & Franky-Backend');
    } catch (err) {
      errors.push(`Failed to generate prompt for ${role}: ${err instanceof Error ? err.message : String(err)}`);
      const character = AGENT_CHARACTERS[role];
      const soul = getSoulFile(soulKeyForRole(role));
      const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const prompt = buildFallbackPrompt(role, character, soul, context);
      db.insert(schema.agentSystemPrompts).values({
        id, projectId: context.projectId, agentRole: role, prompt,
        missionGoal: context.taskTitle || null, generatedBy: 'Nami-Frontend & Franky-Backend', createdAt: new Date().toISOString(),
      }).run();
      prompts[role] = { prompt, id };
    }
  }

  return { prompts, errors };
}

/**
 * Get the latest system prompt for an agent in a project.
 */
export function getLatestPrompt(projectId: string, agentRole: string): string | null {
  const row = db.select().from(schema.agentSystemPrompts)
    .where(and(
      eq(schema.agentSystemPrompts.projectId, projectId),
      eq(schema.agentSystemPrompts.agentRole, agentRole),
    ))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return row?.prompt || null;
}

// ─── Internal helpers ─────────────────────────────────────────

/** Map agent role to its SOUL file key (roles sharing a file) */
function soulKeyForRole(role: string): string {
  if (role.startsWith('backend-')) return 'backend';
  if (role.startsWith('tester-')) return 'tester';
  if (role.startsWith('researcher-')) return 'researcher';
  return role;
}

function buildMetaPrompt(
  agentRole: AgentRole,
  character: { character: string; fullName: string; epithet: string; model: string } | undefined,
  soulContent: string | null,
  context: PromptContext,
): string {
  const charName = character?.character || agentRole;
  const charFull = character?.fullName || agentRole;
  const epithet = character?.epithet || '';

  let prompt = `Generate a system prompt for **${charName}** (${charFull} — "${epithet}"), role: ${agentRole}.\n\n`;

  if (soulContent) {
    prompt += `## SOUL File (personality & behavior rules)\n\`\`\`\n${soulContent.slice(0, 2000)}\n\`\`\`\n\n`;
  }

  prompt += `## Project Context\n`;
  prompt += `- **Project:** ${context.projectName}\n`;
  prompt += `- **Project ID:** ${context.projectId}\n`;

  if (context.gitAnalysis) {
    const ga = context.gitAnalysis;
    prompt += `- **Repo:** ${ga.repoName || 'local project'}\n`;
    prompt += `- **Tech Stack:** ${ga.techStack?.join(', ') || 'unknown'}\n`;
    if (ga.description) prompt += `- **Description:** ${ga.description}\n`;
    if (ga.fileStructure) prompt += `- **File structure (top-level):**\n\`\`\`\n${ga.fileStructure.slice(0, 500)}\n\`\`\`\n`;
  }

  if (context.ideationPlan) {
    prompt += `\n## Ideation Plan (from Robin-Research)\n${context.ideationPlan.slice(0, 1500)}\n`;
  }

  if (context.selectedIdeas?.length) {
    prompt += `\n## Selected MVP Features\n`;
    for (const idea of context.selectedIdeas.slice(0, 5)) {
      prompt += `- **${idea.title}**: ${idea.description?.slice(0, 200) || ''}\n`;
    }
  }

  if (context.architecturePlan) {
    prompt += `\n## Architecture Plan (from Usopp-Architect)\n${context.architecturePlan.slice(0, 1500)}\n`;
  }

  if (context.apiContracts) {
    prompt += `\n## API Contracts (Nami + Franky)\n${context.apiContracts.slice(0, 1000)}\n`;
  }

  if (context.taskTitle) {
    prompt += `\n## Current Task\n**Title:** ${context.taskTitle}\n`;
    if (context.taskDescription) prompt += `**Description:** ${context.taskDescription}\n`;
  }

  if (context.ticketDetails) {
    prompt += `\n## Ticket Details\n${context.ticketDetails.slice(0, 1000)}\n`;
  }

  if (context.additionalContext) {
    prompt += `\n## Additional Context\n${context.additionalContext.slice(0, 500)}\n`;
  }

  prompt += `\n## Instructions\n`;
  prompt += `Generate a complete system prompt for ${charName} that:\n`;
  prompt += `1. Opens with their One Piece character identity and personality traits\n`;
  prompt += `2. Includes all relevant project context and tech stack\n`;
  prompt += `3. Specifies their exact task and acceptance criteria\n`;
  prompt += `4. Defines coding standards and patterns to follow\n`;
  prompt += `5. Sets communication rules (who to report to, how to flag blockers)\n`;
  prompt += `6. Is self-contained — the agent should be able to work from this prompt alone\n`;

  return prompt;
}

/**
 * Build a fallback prompt without LLM generation (used when API calls fail).
 */
function buildFallbackPrompt(
  agentRole: AgentRole,
  character: { character: string; fullName: string; epithet: string } | undefined,
  soulContent: string | null,
  context: PromptContext,
): string {
  const charName = character?.character || agentRole;
  const charFull = character?.fullName || agentRole;

  let prompt = `# System Prompt — ${charName} (${charFull})\n\n`;
  prompt += `You are ${charName}, working on the project "${context.projectName}".\n\n`;

  if (soulContent) {
    prompt += `## Your SOUL\n${soulContent.slice(0, 1500)}\n\n`;
  }

  if (context.gitAnalysis) {
    prompt += `## Project\n`;
    prompt += `- Tech Stack: ${context.gitAnalysis.techStack?.join(', ') || 'unknown'}\n`;
    if (context.gitAnalysis.description) prompt += `- ${context.gitAnalysis.description}\n`;
    prompt += '\n';
  }

  if (context.ideationPlan) {
    prompt += `## Ideation\n${context.ideationPlan.slice(0, 800)}\n\n`;
  }

  if (context.architecturePlan) {
    prompt += `## Architecture\n${context.architecturePlan.slice(0, 800)}\n\n`;
  }

  if (context.taskTitle) {
    prompt += `## Your Task\n**${context.taskTitle}**\n`;
    if (context.taskDescription) prompt += `${context.taskDescription}\n`;
    prompt += '\n';
  }

  if (context.ticketDetails) {
    prompt += `## Ticket\n${context.ticketDetails}\n\n`;
  }

  prompt += `## Rules\n`;
  prompt += `- Follow existing codebase patterns\n`;
  prompt += `- TypeScript strict mode\n`;
  prompt += `- Self-review before marking done\n`;
  prompt += `- Report blockers immediately to your team lead\n`;

  return prompt;
}
