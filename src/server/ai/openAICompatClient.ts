import Groq from 'groq-sdk';
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

/** Groq's SDK is a standard OpenAI-compatible chat-completions client, so it
 * doubles as a generic client for any other OpenAI-compatible provider
 * (Cerebras, OpenRouter, ...) by pointing it at a different baseURL — no
 * need for a separate SDK per provider. */
export function createOpenAICompatDriver(opts: { apiKey: string; baseURL?: string; model: string }): AITurnDriver {
  const client = new Groq({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: AI_SYSTEM_INSTRUCTION }];

  async function step(): Promise<AITurnStep> {
    const completion = await client.chat.completions.create({
      model: opts.model,
      messages,
      tools: AI_TOOLS,
      // The turn-taking loop only ever acts on the first tool call in a step,
      // so force at most one per response — otherwise a multi-call response
      // would leave later calls without a matching tool-result message and
      // the next request would 400. Providers that ignore this field simply
      // fall back to the loop only consuming the first call anyway.
      parallel_tool_calls: false,
    });
    const message = completion.choices[0]?.message;
    if (!message) {
      throw new Error('Model returned no message');
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
