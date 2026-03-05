/**
 * LLM Client — Unified interface for OpenAI and OpenRouter API calls.
 * Uses native fetch(), no new dependencies.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  provider: string;
  error?: string;
}

interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

const OPENAI_BASE = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';

export async function callLLM(
  provider: 'openai' | 'openrouter',
  model: string,
  messages: LLMMessage[],
  options: CallOptions = {},
): Promise<LLMResponse> {
  const { temperature = 0.7, maxTokens = 4096, timeoutMs = 60_000 } = options;

  const apiKey = provider === 'openai'
    ? process.env.OPENAI_API_KEY
    : process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      content: '',
      model,
      tokensUsed: 0,
      provider,
      error: `Missing API key for ${provider}. Set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'} in .env.local`,
    };
  }

  const baseUrl = provider === 'openai' ? OPENAI_BASE : OPENROUTER_BASE;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:4000';
      headers['X-Title'] = 'Agent Dashboard Office';
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        content: '',
        model,
        tokensUsed: 0,
        provider,
        error: `API error ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      model: data.model || model,
      tokensUsed: (data.usage?.total_tokens) || 0,
      provider,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      content: '',
      model,
      tokensUsed: 0,
      provider,
      error: message.includes('abort') ? `Timeout after ${timeoutMs}ms` : message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
