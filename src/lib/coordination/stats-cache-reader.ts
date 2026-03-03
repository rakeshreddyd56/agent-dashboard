import fs from 'fs';
import path from 'path';
import { MODEL_COSTS } from '@/lib/constants';

export interface DayCost {
  date: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
  byModel: Record<string, { tokens: number }>;
}

const STATS_CACHE_PATH = path.join(process.env.HOME || '~', '.claude', 'stats-cache.json');

/**
 * Reads ~/.claude/stats-cache.json which has format:
 * {
 *   version: 2,
 *   dailyActivity: [{ date, messageCount, sessionCount, toolCallCount }],
 *   dailyModelTokens: [{ date, tokensByModel: { "claude-opus-4-6": N } }],
 *   modelUsage: { "claude-opus-4-6": { inputTokens, outputTokens, cacheReadInputTokens, costUSD } }
 * }
 */
export function readStatsCache(): { days: DayCost[]; totalCost: number; modelUsage: Record<string, ModelUsage> } {
  try {
    if (!fs.existsSync(STATS_CACHE_PATH)) return { days: [], totalCost: 0, modelUsage: {} };

    const content = fs.readFileSync(STATS_CACHE_PATH, 'utf-8').trim();
    if (!content) return { days: [], totalCost: 0, modelUsage: {} };

    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return { days: [], totalCost: 0, modelUsage: {} };

    // Build per-day activity map
    const activityByDate = new Map<string, { messageCount: number; sessionCount: number; toolCallCount: number }>();
    if (Array.isArray(data.dailyActivity)) {
      for (const entry of data.dailyActivity) {
        if (entry?.date) {
          activityByDate.set(entry.date, {
            messageCount: entry.messageCount || 0,
            sessionCount: entry.sessionCount || 0,
            toolCallCount: entry.toolCallCount || 0,
          });
        }
      }
    }

    // Build per-day token map
    const tokensByDate = new Map<string, Record<string, number>>();
    if (Array.isArray(data.dailyModelTokens)) {
      for (const entry of data.dailyModelTokens) {
        if (entry?.date && entry?.tokensByModel) {
          tokensByDate.set(entry.date, entry.tokensByModel);
        }
      }
    }

    // Merge into day costs
    const allDates = new Set([...activityByDate.keys(), ...tokensByDate.keys()]);
    const days: DayCost[] = [];

    for (const date of allDates) {
      const activity = activityByDate.get(date);
      const tokens = tokensByDate.get(date);

      let totalTokens = 0;
      let estimatedCost = 0;
      const byModel: Record<string, { tokens: number }> = {};

      if (tokens) {
        for (const [model, count] of Object.entries(tokens)) {
          const t = Number(count) || 0;
          totalTokens += t;
          byModel[model] = { tokens: t };

          // Estimate cost from tokens: use per-1M-token output pricing as rough estimate
          const costPerMillion = MODEL_COSTS[model] || MODEL_COSTS[model.split('-').slice(0, -1).join('-')] || 3;
          estimatedCost += (t / 1_000_000) * costPerMillion;
        }
      }

      days.push({
        date,
        cost: Math.round(estimatedCost * 100) / 100,
        inputTokens: 0, // Not available per-day in this format
        outputTokens: totalTokens,
        cacheReadTokens: 0,
        messageCount: activity?.messageCount || 0,
        sessionCount: activity?.sessionCount || 0,
        toolCallCount: activity?.toolCallCount || 0,
        byModel,
      });
    }

    days.sort((a, b) => a.date.localeCompare(b.date));

    // Parse aggregate model usage
    const modelUsage: Record<string, ModelUsage> = {};
    let totalCost = 0;
    if (data.modelUsage && typeof data.modelUsage === 'object') {
      for (const [model, usage] of Object.entries(data.modelUsage)) {
        if (!usage || typeof usage !== 'object') continue;
        const u = usage as Record<string, unknown>;
        const mu: ModelUsage = {
          inputTokens: Number(u.inputTokens || 0),
          outputTokens: Number(u.outputTokens || 0),
          cacheReadInputTokens: Number(u.cacheReadInputTokens || 0),
          cacheCreationInputTokens: Number(u.cacheCreationInputTokens || 0),
          costUSD: Number(u.costUSD || 0),
        };
        modelUsage[model] = mu;
        totalCost += mu.costUSD;
      }
    }

    return { days, totalCost, modelUsage };
  } catch {
    return { days: [], totalCost: 0, modelUsage: {} };
  }
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}
