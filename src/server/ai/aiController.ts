import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { execute } from '@/server/game/actionHandler';
import { actionSchema } from '@/server/game/actionTypes';
import { logEvent } from '@/server/game/gameEvents';
import { buildStateFor } from '@/server/game/stateSerializer';
import type { ZoneState, GameStateView } from '@/types/game';
import { createGeminiDriver } from './geminiClient';
import { createGroqDriver } from './groqClient';
import type { AITurnDriver } from './aiDriver';

const MAX_ACTIONS_PER_TURN = 12;

type ProviderName = 'gemini' | 'groq';

function createDriver(provider: ProviderName): AITurnDriver {
  return provider === 'gemini' ? createGeminiDriver() : createGroqDriver();
}

// Gemini is tried first when both are configured — Groq is the fallback for
// when Gemini is down, rate-limited, or misconfigured, not a load-balanced
// peer, since its open models are less reliable at multi-step tool calling.
export async function maybeTakeAITurn(gameId: string, seat: number): Promise<void> {
  const providers: ProviderName[] = [];
  if (env.geminiApiKey) providers.push('gemini');
  if (env.groqApiKey) providers.push('groq');

  if (providers.length === 0) {
    await logEvent(gameId, 'AI_SKIPPED_NO_KEY', {}, { seat });
    await forcePass(gameId, seat);
    return;
  }

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      await takeTurn(gameId, seat, createDriver(provider));
      return;
    } catch (err) {
      console.error(`[aiController] ${provider} failed`, err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      const nextProvider = providers[i + 1];
      if (nextProvider) {
        await logEvent(gameId, 'AI_PROVIDER_FAILED', { provider, message, nextProvider }, { seat });
      } else {
        await logEvent(gameId, 'AI_ERROR', { provider, message }, { seat });
      }
    }
  }

  await forcePass(gameId, seat);
}

async function forcePass(gameId: string, seat: number) {
  try {
    await execute(gameId, { seat }, { type: 'PASS_TURN' });
  } catch (err) {
    console.error('[aiController] force pass failed', err);
  }
}

function buildPrompt(state: GameStateView, seat: number): string {
  const me = state.players.find((p) => p.seat === seat);
  const lines: string[] = [];
  lines.push(`Format: ${state.format}. Turn ${state.turnNumber}. You are seat ${seat} (${me?.displayName ?? 'AI'}).`);
  lines.push('');

  for (const p of state.players) {
    lines.push(
      `Seat ${p.seat} (${p.displayName})${p.seat === seat ? ' [you]' : ''}: life ${p.life}, library ${p.libraryCount}, hand ${p.handCount} card(s).`,
    );
    if (p.commandZone.length > 0) {
      lines.push(`  Command zone: ${p.commandZone.map((id) => state.cards[id]?.name ?? id).join(', ')}`);
    }
    if (p.battlefield.length > 0) {
      lines.push(
        '  Battlefield: ' +
          p.battlefield
            .map(
              (c) =>
                `${state.cards[c.scryfallId]?.name ?? c.scryfallId} (instanceId=${c.instanceId}${c.tapped ? ', tapped' : ''})`,
            )
            .join('; '),
      );
    }
    if (p.graveyard.length > 0) {
      lines.push(`  Graveyard: ${p.graveyard.map((id) => state.cards[id]?.name ?? id).join(', ')}`);
    }
  }

  lines.push('');
  if (me?.hand && me.hand.length > 0) {
    lines.push(
      'Your hand: ' +
        me.hand
          .map((id) => {
            const facts = state.cards[id];
            return `${facts?.name ?? id} [${facts?.typeLine ?? 'unknown type'}${facts?.manaCost ? `, ${facts.manaCost}` : ''}] (scryfallId=${id})`;
          })
          .join('; '),
    );
  } else {
    lines.push('Your hand is empty.');
  }

  return lines.join('\n');
}

async function resolveHandOrCommandZone(gameId: string, seat: number, scryfallId: string): Promise<'hand' | 'commandZone'> {
  const player = await prisma.gamePlayer.findFirstOrThrow({ where: { gameId, seat } });
  const zones = player.zones as unknown as ZoneState;
  if (zones.hand.includes(scryfallId)) return 'hand';
  if (zones.commandZone.includes(scryfallId)) return 'commandZone';
  throw new Error(`Card ${scryfallId} is not in your hand or command zone`);
}

async function isInstantOrSorcery(scryfallId: string): Promise<boolean> {
  const card = await prisma.cardCache.findUnique({ where: { scryfallId } });
  return /instant|sorcery/i.test(card?.typeLine ?? '');
}

async function mapFunctionCallToAction(
  gameId: string,
  seat: number,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'play_card': {
      const scryfallId = String(args.scryfallId);
      const fromZone = await resolveHandOrCommandZone(gameId, seat, scryfallId);
      return { type: 'PLAY_CARD', scryfallId, fromZone };
    }
    case 'cast_spell': {
      const scryfallId = String(args.scryfallId);
      if (await isInstantOrSorcery(scryfallId)) {
        return { type: 'MOVE_CARD', fromZone: 'hand', toZone: 'graveyard', scryfallId };
      }
      const fromZone = await resolveHandOrCommandZone(gameId, seat, scryfallId);
      return { type: 'PLAY_CARD', scryfallId, fromZone };
    }
    case 'attack_with': {
      const instanceId = String(args.instanceId);
      await logEvent(gameId, 'ATTACK_DECLARED', { instanceId }, { seat });
      return { type: 'TAP_CARD', instanceId };
    }
    case 'move_card_zone':
      return {
        type: 'MOVE_CARD',
        fromZone: args.fromZone,
        toZone: args.toZone,
        instanceId: args.instanceId ? String(args.instanceId) : undefined,
        scryfallId: args.scryfallId ? String(args.scryfallId) : undefined,
      };
    case 'adjust_life':
      return { type: 'ADJUST_LIFE', seat: Number(args.seat), delta: Number(args.delta) };
    case 'draw_card':
      return { type: 'DRAW_CARD' };
    case 'pass_turn':
      return { type: 'PASS_TURN' };
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

// Provider-agnostic turn loop — driver hides whether it's talking to Gemini
// or Groq, so a mid-turn failure and fallback to the next provider just
// means a fresh driver picks up from whatever the live game state now is.
async function takeTurn(gameId: string, seat: number, driver: AITurnDriver): Promise<void> {
  const state = await buildStateFor(gameId, seat);
  let step = await driver.sendInitial(buildPrompt(state, seat));
  let actionsTaken = 0;

  while (actionsTaken < MAX_ACTIONS_PER_TURN) {
    if (step.reasoningText) {
      await logEvent(gameId, 'AI_REASONING', { text: step.reasoningText }, { seat });
    }

    if (!step.toolCall) {
      // The model stopped calling functions without explicitly passing — end its turn here.
      break;
    }

    const { id: toolCallId, name, args } = step.toolCall;
    if (name === 'pass_turn') {
      await execute(gameId, { seat }, { type: 'PASS_TURN' });
      return;
    }

    let resultPayload: Record<string, unknown>;
    try {
      const rawAction = await mapFunctionCallToAction(gameId, seat, name, args);
      const action = actionSchema.parse(rawAction);
      await execute(gameId, { seat }, action);
      actionsTaken += 1;
      resultPayload = { ok: true };
    } catch (err) {
      resultPayload = { ok: false, error: err instanceof Error ? err.message : 'Action failed' };
    }

    step = await driver.sendToolResult(toolCallId, name, resultPayload);
  }

  if (actionsTaken >= MAX_ACTIONS_PER_TURN) {
    await logEvent(gameId, 'AI_TURN_CAPPED', {}, { seat });
  }
  await forcePass(gameId, seat);
}
