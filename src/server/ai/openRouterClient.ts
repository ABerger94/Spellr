import { env } from '@/lib/env';
import { createOpenAICompatDriver } from './openAICompatClient';
import type { AITurnDriver } from './aiDriver';

export function createOpenRouterDriver(): AITurnDriver {
  if (!env.openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  return createOpenAICompatDriver({
    apiKey: env.openRouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    model: env.openRouterModel,
  });
}
