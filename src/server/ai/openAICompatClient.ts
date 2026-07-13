import { AI_ACTIONS, AI_SYSTEM_INSTRUCTION } from './aiTools';
import type { AITurnDriver, AITurnStep } from './aiDriver';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

const AI_TOOLS = AI_ACTIONS.map((action) => ({
  type: 'function' as const,
  function: { name: action.name, description: action.description, parameters: action.parameters },
}));

/** A minimal OpenAI-compatible chat-completions client, good enough for the
 * handful of providers (Groq, Cerebras, OpenRouter, ...) that all speak the
 * same request/response shape at POST {baseURL}/chat/completions. Deliberately
 * plain fetch rather than the groq-sdk package: that SDK hardcodes its POST
 * path as `/openai/v1/chat/completions`, which is only correct because it's
 * paired with Groq's own baseURL (https://api.groq.com) — pointed at a
 * different provider's baseURL (which already ends in its own /v1), that
 * hardcoded path silently produces the wrong URL and every request 404s. */
export function createOpenAICompatDriver(opts: { apiKey: string; baseURL: string; model: string }): AITurnDriver {
  const endpoint = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;
  const messages: ChatMessage[] = [{ role: 'system', content: AI_SYSTEM_INSTRUCTION }];

  async function step(): Promise<AITurnStep> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        tools: AI_TOOLS,
        // The turn-taking loop only ever acts on the first tool call in a step,
        // so force at most one per response — otherwise a multi-call response
        // would leave later calls without a matching tool-result message and
        // the next request would 400. Providers that ignore this field simply
        // fall back to the loop only consuming the first call anyway.
        parallel_tool_calls: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${body.slice(0, 500)}`);
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error('Model returned no message');
    }
    messages.push(message);

    const toolCall = message.tool_calls?.[0];
    return {
      reasoningText: (message.content ?? '').trim(),
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
