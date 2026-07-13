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

/** Sentinel id for a tool call recovered from free-form text (see below) —
 * there's no real tool_calls entry backing it, so sendToolResult knows not
 * to attach a role:'tool' reply to a call the provider never actually made. */
const FALLBACK_TOOL_CALL_ID = 'fallback-text-call';

/** Some weaker/less-instruction-following models occasionally answer with
 * the function call spelled out as fenced JSON in the message text instead
 * of a real structured tool_calls entry (observed in practice on Cerebras) —
 * this pulls the first one out so the turn doesn't just silently stall with
 * the model "describing" actions that never happen. */
function extractFallbackToolCall(content: string): { name: string; args: Record<string, unknown> } | null {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed.function === 'string') {
        const args = parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {};
        return { name: parsed.function, args };
      }
    } catch {
      // Not a JSON fence (e.g. plain commentary) — keep looking at the next one.
    }
  }
  return null;
}

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
  // True when the most recently returned toolCall was recovered from text
  // rather than a real tool_calls entry — sendToolResult reads this to pick
  // the right reply shape for whichever one just happened.
  let lastToolCallWasFallback = false;

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

    const realToolCall = message.tool_calls?.[0];
    if (realToolCall) {
      lastToolCallWasFallback = false;
      return {
        reasoningText: (message.content ?? '').trim(),
        toolCall: {
          id: realToolCall.id,
          name: realToolCall.function.name,
          args: JSON.parse(realToolCall.function.arguments || '{}'),
        },
      };
    }

    const fallback = message.content ? extractFallbackToolCall(message.content) : null;
    lastToolCallWasFallback = !!fallback;
    return {
      reasoningText: (message.content ?? '').trim(),
      toolCall: fallback ? { id: FALLBACK_TOOL_CALL_ID, name: fallback.name, args: fallback.args } : null,
    };
  }

  return {
    async sendInitial(prompt) {
      messages.push({ role: 'user', content: prompt });
      return step();
    },
    async sendToolResult(toolCallId, toolName, result) {
      if (lastToolCallWasFallback) {
        // No real tool_calls entry exists on the preceding assistant message
        // to attach a role:'tool' reply to — describe the result in plain
        // text instead so the conversation stays well-formed.
        messages.push({ role: 'user', content: `Result of ${toolName}: ${JSON.stringify(result)}` });
      } else {
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(result) });
      }
      return step();
    },
  };
}
