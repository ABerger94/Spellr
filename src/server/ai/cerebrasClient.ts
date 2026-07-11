import { env } from '@/lib/env';
import { createOpenAICompatDriver } from './openAICompatClient';
import type { AITurnDriver } from './aiDriver';

export function createCerebrasDriver(): AITurnDriver {
  if (!env.cerebrasApiKey) {
    throw new Error('CEREBRAS_API_KEY is not configured');
  }
  return createOpenAICompatDriver({
    apiKey: env.cerebrasApiKey,
    baseURL: 'https://api.cerebras.ai/v1',
    model: env.cerebrasModel,
  });
}
