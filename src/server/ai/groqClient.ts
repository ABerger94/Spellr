import { env } from '@/lib/env';
import { createOpenAICompatDriver } from './openAICompatClient';
import type { AITurnDriver } from './aiDriver';

export function createGroqDriver(): AITurnDriver {
  if (!env.groqApiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return createOpenAICompatDriver({ apiKey: env.groqApiKey, baseURL: 'https://api.groq.com/openai/v1', model: env.groqModel });
}
