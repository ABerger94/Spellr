import Groq from 'groq-sdk';
import { env } from '@/lib/env';
import { AI_ACTIONS, AI_SYSTEM_INSTRUCTION } from './aiTools';
import type { AITurnDriver, AITurnStep } from './aiDriver';

type ChatCompletionMessageParam = Groq.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionTool = Groq.Chat.Completions.ChatCompletionTool;

const AI_TOOLS: ChatCompletionTool[] = AI_ACTIONS.map((action) => ({
  type: 'function',
  function: {
    name: action.name,
    description: action.description,
    parameters: action.parameters,
  },
}));

function getClient(): Groq {
  if (!env.groqApiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new Groq({ apiKey: env.groqApiKey });
}

export function createGroqDriver(): AITurnDriver {
  const client = getClient();
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: AI_SYSTEM_INSTRUCTION }];

  async function step(): Promise<AITurnStep> {
    const completion = await client.chat.completions.create({
      model: env.groqModel,
      messages,
      tools: AI_TOOLS,
      // The turn-taking loop only ever acts on the first tool call in a step
      // (matching the Gemini driver), so force at most one per response —
      // otherwise a multi-call response would leave later calls without a
      // matching tool-result message and the next request would 400.
      parallel_tool_calls: false,
    });
    const message = completion.choices[0]?.message;
    if (!message) {
      throw new Error('Groq returned no message');
    }
    messages.push(message);

    const toolCall = message.tool_calls?.[0];
    return {
      reasoningText: message.content?.trim() ?? '',
      toolCall: toolCall
        ? { id: toolCall.id, name: toolCall.function.name, args: JSON.parse(toolCall.function.arguments || '{}') }
        : null,
    };
  }

  return {
    async sendInitial(prompt) {
      messages.push({ role: 'user', content: prompt });
      return step();
    },
    async sendToolResult(toolCallId, _toolName, result) {
      messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(result) });
      return step();
    },
  };
}
