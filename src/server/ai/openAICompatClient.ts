import { AI_ACTIONS, AI_SYSTEM_INSTRUCTION } from './aiTools';
import type { AITurnDriver, AITurnStep } from './aiDriver';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface FallbackCall {
  name: string;
  args: Record<string, unknown>;
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
 * its whole turn plan spelled out as several fenced JSON function calls in
 * the message text instead of real structured tool_calls entries (observed
 * in practice on Cerebras) — this pulls every one of them out, in order, so
 * the turn doesn't stall after only the first ever actually executes. */
function extractAllFallbackToolCalls(content: string): FallbackCall[] {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  const calls: FallbackCall[] = [];
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(content))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed.function === 'string') {
        const args = parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {};
        calls.push({ name: parsed.function, args });
      }
    } catch {
      // Not a JSON fence (e.g. plain commentary) — skip it and keep looking.
    }
  }
  return calls;
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
  // True while we're still working through a batch of fallback calls
  // recovered from one text response — sendToolResult reads this to decide
  // whether to reply for real or just hand out the next queued call.
  let lastToolCallWasFallback = false;
  // Extra calls recovered from the same text dump as the one just returned,
  // still waiting to be handed out — dispensed locally, with no network
  // round-trip, so the model doesn't get a chance to "forget" the rest of
  // its own stated plan once it moves on to a later action.
  let fallbackQueue: FallbackCall[] = [];
  // Results collected for calls served out of fallbackQueue, flushed into
  // the conversation as one message once the queue drains and we go back
  // to asking the model for real.
  let queuedResults: { name: string; result: Record<string, unknown> }[] = [];

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

    const fallbackCalls = message.content ? extractAllFallbackToolCalls(message.content) : [];
    lastToolCallWasFallback = fallbackCalls.length > 0;
    if (fallbackCalls.length > 0) {
      const [first, ...rest] = fallbackCalls;
      fallbackQueue = rest;
      return {
        reasoningText: (message.content ?? '').trim(),
        toolCall: { id: FALLBACK_TOOL_CALL_ID, name: first.name, args: first.args },
      };
    }

    return { reasoningText: (message.content ?? '').trim(), toolCall: null };
  }

  return {
    async sendInitial(prompt) {
      messages.push({ role: 'user', content: prompt });
      return step();
    },
    async sendToolResult(toolCallId, toolName, result) {
      if (!lastToolCallWasFallback) {
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(result) });
        return step();
      }

      queuedResults.push({ name: toolName, result });

      if (fallbackQueue.length > 0) {
        const next = fallbackQueue.shift()!;
        return { reasoningText: '', toolCall: { id: FALLBACK_TOOL_CALL_ID, name: next.name, args: next.args } };
      }

      // The whole batch from that one text dump has now actually run — tell
      // the model everything that happened (not just the last call) and
      // let it decide for real whether anything is still left to do. No
      // real tool_calls entry ever existed for these, so this goes back as
      // a plain user message rather than a role:'tool' reply.
      const summary = queuedResults.map((r) => `${r.name} -> ${JSON.stringify(r.result)}`).join('; ');
      queuedResults = [];
      messages.push({
        role: 'user',
        content: `Results of your planned actions, in order: ${summary}. Continue your turn if anything is still left to do, otherwise call pass_turn.`,
      });
      return step();
    },
  };
}
