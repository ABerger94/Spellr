import { createClient } from '@base44/sdk';
import { env } from '@/lib/env';
import { AI_ACTIONS, AI_SYSTEM_INSTRUCTION } from './aiTools';
import type { AITurnDriver, AITurnStep } from './aiDriver';

interface FunctionResponse {
  reasoning?: string;
  function?: string;
  arguments?: Record<string, unknown>;
}

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reasoning: { type: 'string', description: 'Brief explanation of what you are doing and why, or why you are done.' },
    function: {
      type: 'string',
      description: 'The name of exactly one function to call next (see the function list above), or "none" if you have nothing left to do this turn.',
    },
    arguments: {
      type: 'object',
      description: "The arguments object for the chosen function, matching its parameter schema from the function list. Use {} if function is \"none\".",
    },
  },
  required: ['reasoning', 'function', 'arguments'],
};

function describeTools(): string {
  return AI_ACTIONS.map((a) => `- ${a.name}: ${a.description}\n  Parameters (JSON schema): ${JSON.stringify(a.parameters)}`).join('\n');
}

/** Base44's InvokeLLM (https://base44.com) is a stateless prompt-in/JSON-out
 * call with no native multi-turn tool-calling or conversation memory, unlike
 * every other provider here — so this driver keeps its own running
 * transcript and re-sends the whole thing (system instruction + tool
 * catalog + history so far) on every step, asking for exactly one action
 * back via response_json_schema each time. */
export function createBase44Driver(): AITurnDriver {
  if (!env.base44AppId) {
    throw new Error('BASE44_APP_ID is not configured');
  }
  const base44 = createClient({ appId: env.base44AppId });

  const transcript: string[] = [
    AI_SYSTEM_INSTRUCTION,
    '',
    'Available functions — respond with exactly one per turn-step, using the "function" and "arguments" fields of your JSON response:',
    describeTools(),
  ];

  async function step(): Promise<AITurnStep> {
    const prompt = transcript.join('\n');
    const raw = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: RESPONSE_JSON_SCHEMA,
    });

    const parsed: FunctionResponse = typeof raw === 'string' ? JSON.parse(raw) : ((raw ?? {}) as FunctionResponse);
    const reasoningText = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
    const functionName = typeof parsed.function === 'string' ? parsed.function : 'none';
    const args = parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {};

    transcript.push('', `You responded: ${JSON.stringify({ reasoning: reasoningText, function: functionName, arguments: args })}`);

    if (!functionName || functionName === 'none') {
      return { reasoningText, toolCall: null };
    }
    return { reasoningText, toolCall: { id: 'base44-call', name: functionName, args } };
  }

  return {
    async sendInitial(prompt) {
      transcript.push('', prompt);
      return step();
    },
    async sendToolResult(_toolCallId, toolName, result) {
      transcript.push(
        '',
        `Result of ${toolName}: ${JSON.stringify(result)}. Continue your turn if anything is still left to do (call pass_turn, or respond with function "none" once you're done).`,
      );
      return step();
    },
  };
}
