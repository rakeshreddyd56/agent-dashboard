/**
 * Research Council — 3-stage LLM deliberation pipeline.
 * Inspired by Karpathy's llm-council.
 */

import { callLLM, type LLMMessage } from './llm-client';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { OFFICE_CONFIG } from '@/lib/constants';
import type { CouncilMember, GitProjectAnalysis, ResearchIdea, CouncilVote } from '@/lib/types';

export interface CouncilConfig {
  members: CouncilMember[];
  projectId: string;
  gitAnalysis: GitProjectAnalysis;
  previousIdeas: ResearchIdea[];
}

interface StageResult<T> {
  memberId: string;
  memberName: string;
  data: T;
  error?: string;
}

// ─── Stage 1: Individual Brainstorming ────────────────────────────

export async function runIndividualResponses(config: CouncilConfig): Promise<StageResult<ResearchIdea[]>[]> {
  const systemPrompt = `You are a creative product researcher. Analyze the project and propose 2-3 viral, MVP-shaped features.

For each feature, respond in this JSON format:
{
  "ideas": [
    {
      "title": "Feature Name",
      "description": "What it does and why users would love it",
      "viralPotential": "Why users would share/recommend this",
      "mvpScope": "Smallest shippable version (1-2 week timeline)",
      "uiScreens": ["Screen 1: description", "Screen 2: description"]
    }
  ]
}`;

  const projectContext = `## Project: ${config.gitAnalysis.repoName}
${config.gitAnalysis.description}

**Tech Stack:** ${config.gitAnalysis.techStack.join(', ')}
**Version:** ${config.gitAnalysis.currentVersion}

**Recent Activity:**
${config.gitAnalysis.recentCommits.slice(0, 10).join('\n')}

**File Structure:**
${config.gitAnalysis.fileStructure.slice(0, 2000)}

${config.previousIdeas.length > 0 ? `\n**Previously proposed ideas (avoid duplicates):**\n${config.previousIdeas.map(i => `- ${i.title}`).join('\n')}` : ''}`;

  const results = await Promise.allSettled(
    config.members.map(async (member): Promise<StageResult<ResearchIdea[]>> => {
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: projectContext },
      ];

      const response = await callLLM(
        member.provider as 'openai' | 'openrouter',
        member.model,
        messages,
        { temperature: 0.9, timeoutMs: OFFICE_CONFIG.councilTimeoutMs },
      );

      if (response.error) {
        return { memberId: member.id, memberName: member.name, data: [], error: response.error };
      }

      // Parse JSON from response
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { ideas: [] };
        const ideas: ResearchIdea[] = (parsed.ideas || []).map((idea: Record<string, unknown>) => ({
          ...idea,
          proposedBy: member.name,
          uiScreens: idea.uiScreens || [],
        }));
        return { memberId: member.id, memberName: member.name, data: ideas };
      } catch {
        return { memberId: member.id, memberName: member.name, data: [], error: 'Failed to parse response' };
      }
    })
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { memberId: config.members[i].id, memberName: config.members[i].name, data: [] as ResearchIdea[], error: String(r.reason) }
  );
}

// ─── Stage 2: Peer Review (Anonymized) ────────────────────────────

export async function runPeerReview(
  allIdeas: ResearchIdea[],
  config: CouncilConfig,
): Promise<StageResult<{ ideaIndex: number; score: number; feedback: string }[]>[]> {
  if (allIdeas.length === 0) return [];

  // Anonymize ideas
  const anonymizedIdeas = allIdeas.map((idea, i) => ({
    label: String.fromCharCode(65 + i), // A, B, C, D...
    title: idea.title,
    description: idea.description,
    viralPotential: idea.viralPotential,
    mvpScope: idea.mvpScope,
  }));

  const systemPrompt = `You are evaluating product feature proposals. Score each idea 1-10 on: viral potential, MVP feasibility, implementation effort (lower is better), project fit.

Respond in JSON:
{
  "reviews": [
    { "label": "A", "score": 8, "feedback": "Why this score" }
  ]
}`;

  const ideasText = anonymizedIdeas.map(i =>
    `**Idea ${i.label}: ${i.title}**\n${i.description}\nViral: ${i.viralPotential}\nMVP: ${i.mvpScope}`
  ).join('\n\n');

  const results = await Promise.allSettled(
    config.members.map(async (member): Promise<StageResult<{ ideaIndex: number; score: number; feedback: string }[]>> => {
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Review these feature proposals:\n\n${ideasText}` },
      ];

      const response = await callLLM(
        member.provider as 'openai' | 'openrouter',
        member.model,
        messages,
        { temperature: 0.3, timeoutMs: OFFICE_CONFIG.councilTimeoutMs },
      );

      if (response.error) {
        return { memberId: member.id, memberName: member.name, data: [], error: response.error };
      }

      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { reviews: [] };
        const reviews = (parsed.reviews || []).map((r: { label: string; score: number; feedback: string }) => ({
          ideaIndex: r.label.charCodeAt(0) - 65,
          score: Math.min(10, Math.max(1, r.score)),
          feedback: r.feedback || '',
        }));
        return { memberId: member.id, memberName: member.name, data: reviews };
      } catch {
        return { memberId: member.id, memberName: member.name, data: [], error: 'Failed to parse reviews' };
      }
    })
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { memberId: config.members[i].id, memberName: config.members[i].name, data: [], error: String(r.reason) }
  );
}

// ─── Stage 3: Chairman Synthesis ──────────────────────────────────

export async function runChairmanSynthesis(
  allIdeas: ResearchIdea[],
  reviews: StageResult<{ ideaIndex: number; score: number; feedback: string }[]>[],
  config: CouncilConfig,
): Promise<{
  selectedIdeas: ResearchIdea[];
  ideationPlan: string;
  votes: CouncilVote[];
  reasoning: string;
}> {
  // Find chairman
  const chairman = config.members.find(m => m.role === 'chairman') || config.members[0];
  if (!chairman) {
    return { selectedIdeas: [], ideationPlan: '', votes: [], reasoning: 'No chairman available' };
  }

  // Aggregate scores
  const scoreMap = new Map<number, { total: number; count: number; feedbacks: string[] }>();
  const votes: CouncilVote[] = [];

  for (const review of reviews) {
    for (const r of review.data) {
      const entry = scoreMap.get(r.ideaIndex) || { total: 0, count: 0, feedbacks: [] };
      entry.total += r.score;
      entry.count += 1;
      entry.feedbacks.push(`${review.memberName}: ${r.feedback}`);
      scoreMap.set(r.ideaIndex, entry);

      votes.push({
        memberId: review.memberId,
        memberName: review.memberName,
        ideaIndex: r.ideaIndex,
        score: r.score,
        reasoning: r.feedback,
      });
    }
  }

  // Build scored ideas text
  const scoredIdeas = allIdeas.map((idea, i) => {
    const scores = scoreMap.get(i);
    const avg = scores ? (scores.total / scores.count).toFixed(1) : 'N/A';
    idea.averageScore = scores ? scores.total / scores.count : 0;
    return `**${idea.title}** (Avg Score: ${avg}/10, by: ${idea.proposedBy})\n${idea.description}\nFeedback: ${scores?.feedbacks.join(' | ') || 'None'}`;
  }).join('\n\n');

  const systemPrompt = `You are the Chairman of a product research council. Based on all ideas and peer reviews, select the top 3-5 features for an MVP and create an actionable ideation plan.

Respond in JSON:
{
  "selectedFeatures": ["title1", "title2", "title3"],
  "ideationPlan": "Detailed plan with feature prioritization, implementation order, and UI/UX flow",
  "reasoning": "Why these features were selected"
}`;

  const response = await callLLM(
    chairman.provider as 'openai' | 'openrouter',
    chairman.model,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Select and synthesize from these reviewed proposals:\n\n${scoredIdeas}` },
    ],
    { temperature: 0.4, timeoutMs: OFFICE_CONFIG.councilTimeoutMs },
  );

  if (response.error) {
    // Fallback: select top ideas by score
    const sorted = allIdeas.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));
    return {
      selectedIdeas: sorted.slice(0, 3),
      ideationPlan: 'Chairman synthesis failed. Top ideas selected by score.',
      votes,
      reasoning: response.error,
    };
  }

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const selectedTitles: string[] = parsed.selectedFeatures || [];
    const selectedIdeas = selectedTitles
      .map(title => allIdeas.find(i => i.title === title))
      .filter(Boolean) as ResearchIdea[];

    // If no exact matches, take top scored
    const finalIdeas = selectedIdeas.length > 0
      ? selectedIdeas
      : allIdeas.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0)).slice(0, 3);

    return {
      selectedIdeas: finalIdeas,
      ideationPlan: parsed.ideationPlan || response.content,
      votes,
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return {
      selectedIdeas: allIdeas.slice(0, 3),
      ideationPlan: response.content,
      votes,
      reasoning: 'Parsed from raw response',
    };
  }
}

// ─── Full Pipeline ────────────────────────────────────────────────

export async function runResearchCouncil(config: CouncilConfig): Promise<{
  allIdeas: ResearchIdea[];
  selectedIdeas: ResearchIdea[];
  ideationPlan: string;
  votes: CouncilVote[];
  councilResponses: string;
  peerReviews: string;
}> {
  // Stage 1
  const stage1 = await runIndividualResponses(config);
  const allIdeas = stage1.flatMap(r => r.data);

  if (allIdeas.length === 0) {
    return {
      allIdeas: [],
      selectedIdeas: [],
      ideationPlan: 'No ideas generated by council',
      votes: [],
      councilResponses: JSON.stringify(stage1),
      peerReviews: '[]',
    };
  }

  // Stage 2
  const stage2 = await runPeerReview(allIdeas, config);

  // Stage 3
  const synthesis = await runChairmanSynthesis(allIdeas, stage2, config);

  return {
    allIdeas,
    selectedIdeas: synthesis.selectedIdeas,
    ideationPlan: synthesis.ideationPlan,
    votes: synthesis.votes,
    councilResponses: JSON.stringify(stage1),
    peerReviews: JSON.stringify(stage2),
  };
}
