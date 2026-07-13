import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { execute } from '@/server/game/actionHandler';
import { actionSchema } from '@/server/game/actionTypes';
import { logEvent } from '@/server/game/gameEvents';
import { buildStateFor } from '@/server/game/stateSerializer';
import { mulliganCardsOwed, type ZoneState, type GameStateView, type PlayerStateView } from '@/types/game';
import { createGeminiDriver } from './geminiClient';
import { createGroqDriver } from './groqClient';
import { createCerebrasDriver } from './cerebrasClient';
import { createOpenRouterDriver } from './openRouterClient';
import { createBase44Driver } from './base44Client';
import type { AITurnDriver } from './aiDriver';

const MAX_ACTIONS_PER_TURN = 12;

type ProviderName = 'gemini' | 'groq' | 'cerebras' | 'openrouter' | 'base44';

const DRIVER_FACTORIES: Record<ProviderName, () => AITurnDriver> = {
  gemini: createGeminiDriver,
  groq: createGroqDriver,
  cerebras: createCerebrasDriver,
  openrouter: createOpenRouterDriver,
  base44: createBase44Driver,
};

function createDriver(provider: ProviderName): AITurnDriver {
  return DRIVER_FACTORIES[provider]();
}

// Guards against two concurrent requests (e.g. two connected players' clients
// both noticing it's the AI's turn at once) triggering the same seat's turn
// twice — a second call for a key already in flight just piggybacks on the
// first's promise instead of starting a redundant one.
const aiTurnLocks = new Map<string, Promise<void>>();

export function runAITurnOnce(gameId: string, seat: number): Promise<void> {
  const key = `${gameId}:${seat}`;
  const existing = aiTurnLocks.get(key);
  if (existing) return existing;

  const run = maybeTakeAITurn(gameId, seat).finally(() => {
    aiTurnLocks.delete(key);
  });
  aiTurnLocks.set(key, run);
  return run;
}

// Separate lock namespace from aiTurnLocks — an AI seat can need a block
// reaction while it's *not* its turn (during an opponent's attack), so this
// must be able to run concurrently with, not compete with, aiTurnLocks.
const aiBlockLocks = new Map<string, Promise<void>>();

/** Entry point for reacting to attacks declared against an AI seat. This is
 * deliberately NOT part of runAITurnOnce/takeTurn: combat declarations are
 * cleared the instant the attacking player passes their turn (see
 * actionHandler.ts's PASS_TURN case), which happens well before this AI
 * seat would ever become the active player and get a chance to see them via
 * its normal turn prompt. A connected client calls this as soon as it
 * notices an AI seat has an unresolved attacker, the same way it notices
 * and triggers a normal AI turn. */
export function runAIBlockCheckOnce(gameId: string, seat: number): Promise<void> {
  const key = `${gameId}:${seat}`;
  const existing = aiBlockLocks.get(key);
  if (existing) return existing;

  const run = maybeTakeAIBlocks(gameId, seat).finally(() => {
    aiBlockLocks.delete(key);
  });
  aiBlockLocks.set(key, run);
  return run;
}

async function maybeTakeAIBlocks(gameId: string, seat: number): Promise<void> {
  const providers = listConfiguredProviders();
  for (const provider of providers) {
    try {
      await takeBlockReaction(gameId, seat, createDriver(provider));
      return;
    } catch (err) {
      // Unlike a missed turn, a missed block just means the attack goes
      // through undefended — not a broken game state — so this falls
      // through to the next provider silently rather than logging a
      // table-visible error for every attack declared against an AI seat.
      console.error(`[aiController] block reaction (${provider}) failed`, err);
    }
  }
}

// Tried in order of preference, falling through to the next only when the
// current one is down, rate-limited, or misconfigured — not load-balanced
// peers, since the open fallback models are less reliable at multi-step tool
// calling than Gemini.
function listConfiguredProviders(): ProviderName[] {
  const providers: ProviderName[] = [];
  if (env.geminiApiKey) providers.push('gemini');
  if (env.groqApiKey) providers.push('groq');
  if (env.cerebrasApiKey) providers.push('cerebras');
  if (env.openRouterApiKey) providers.push('openrouter');
  if (env.base44AppId) providers.push('base44');
  return providers;
}

async function maybeTakeAITurn(gameId: string, seat: number): Promise<void> {
  const providers = listConfiguredProviders();

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

/** Oracle text is included for the AI's own cards (it needs the real rules
 * text to know when a land enters tapped is its own business vs. already
 * handled automatically, when a spell gains/loses life, etc.) but omitted
 * for opponents' permanents to keep the prompt from ballooning — the AI
 * only ever acts on its own cards anyway. Battlefield counters (+1/+1,
 * -1/-1, or anything custom) are folded into the shown power/toughness and
 * listed separately, so the AI reasons about a creature's actual current
 * stats rather than just its printed ones. */
function cardLabel(state: GameStateView, id: string, includeText: boolean, counters?: Record<string, number>): string {
  const facts = state.cards[id];
  if (!facts) return id;
  const bits = [facts.typeLine ?? 'unknown type'];
  if (facts.manaCost) bits.push(facts.manaCost);
  if (facts.power !== null && facts.toughness !== null) {
    const basePower = Number(facts.power);
    const baseToughness = Number(facts.toughness);
    const boost = (counters?.['+1/+1'] ?? 0) - (counters?.['-1/-1'] ?? 0);
    if (boost !== 0 && Number.isFinite(basePower) && Number.isFinite(baseToughness)) {
      bits.push(`${basePower + boost}/${baseToughness + boost} (base ${facts.power}/${facts.toughness})`);
    } else {
      bits.push(`${facts.power}/${facts.toughness}`);
    }
  }
  let label = `${facts.name} [${bits.join(', ')}]`;
  if (includeText && facts.oracleText) label += ` {${facts.oracleText.replace(/\n/g, ' ')}}`;
  const otherCounters = Object.entries(counters ?? {}).filter(([type, count]) => count > 0 && type !== '+1/+1' && type !== '-1/-1');
  if (otherCounters.length > 0) {
    label += ` (counters: ${otherCounters.map(([type, count]) => `${count} ${type}`).join(', ')})`;
  }
  return label;
}

/** Rough board-power heuristic for multiplayer threat assessment — sums the
 * current (counter-adjusted) power of every creature a player controls. Not
 * meant to be precise (it ignores keywords, removal in hand, etc.), just
 * enough for the AI to tell "this opponent has a big board" from "this
 * opponent has nothing" when deciding who to attack or worry about. */
function computeBoardPower(state: GameStateView, p: PlayerStateView): number {
  let total = 0;
  for (const c of p.battlefield) {
    const facts = state.cards[c.scryfallId];
    if (!facts?.typeLine?.includes('Creature') || facts.power === null) continue;
    const basePower = Number(facts.power);
    if (!Number.isFinite(basePower)) continue;
    const boost = (c.counters?.['+1/+1'] ?? 0) - (c.counters?.['-1/-1'] ?? 0);
    total += basePower + boost;
  }
  return total;
}

/** Tallies, per opponent seat, how many times they've declared an attack
 * against this AI seat (its face or one of its planeswalkers) so far this
 * game — a simple stand-in for "who's been hostile to me" that the prompt
 * uses to lean the AI's own attacks toward the more aggressive/threatening
 * opponents in a multiplayer pod, rather than picking a target arbitrarily. */
async function fetchAggressionAgainst(gameId: string, seat: number): Promise<Record<number, number>> {
  const events = await prisma.gameEvent.findMany({
    where: { gameId, type: 'DECLARE_ATTACK', actorSeat: { not: seat } },
    select: { actorSeat: true, payload: true },
  });
  const counts: Record<number, number> = {};
  for (const event of events) {
    const payload = event.payload as { targetSeat?: number };
    if (event.actorSeat === null || payload.targetSeat !== seat) continue;
    counts[event.actorSeat] = (counts[event.actorSeat] ?? 0) + 1;
  }
  return counts;
}

function buildPrompt(state: GameStateView, seat: number, aggressionAgainstMe: Record<number, number>): string {
  const me = state.players.find((p) => p.seat === seat);
  const lines: string[] = [];
  lines.push(`Format: ${state.format}. Turn ${state.turnNumber}. You are seat ${seat} (${me?.displayName ?? 'AI'}).`);
  lines.push('');

  for (const p of state.players) {
    const isMe = p.seat === seat;
    lines.push(
      `Seat ${p.seat} (${p.displayName})${isMe ? ' — THIS IS YOU. Every card below is one YOU control.' : ` — an OPPONENT. Every card below belongs to THEM, not you — never target these instanceIds with attack_with, move_card_zone, or any other action that acts on your own cards.`}: life ${p.life}, library ${p.libraryCount}, hand ${p.handCount} card(s).`,
    );
    if (!isMe) {
      const boardPower = computeBoardPower(state, p);
      const timesAttackedYou = aggressionAgainstMe[p.seat] ?? 0;
      lines.push(
        `  Threat read: ${boardPower} total creature power on board, ${p.battlefield.length} permanent(s)` +
          (timesAttackedYou > 0 ? `, has attacked you ${timesAttackedYou} time(s) this game.` : ', has not attacked you this game.'),
      );
    }
    const playerCounters = Object.entries(p.counters ?? {}).filter(([, count]) => count > 0);
    if (playerCounters.length > 0) {
      lines.push(`  Player counters: ${playerCounters.map(([type, count]) => `${count} ${type}`).join(', ')}`);
    }
    if (p.commandZone.length > 0) {
      lines.push(`  Command zone: ${p.commandZone.map((id) => cardLabel(state, id, isMe)).join('; ')}`);
    }
    if (p.battlefield.length > 0) {
      lines.push(
        '  Battlefield: ' +
          p.battlefield
            .map((c) => {
              const status = [`instanceId=${c.instanceId}`];
              if (c.tapped) status.push('tapped');
              if (c.attacking) {
                status.push(
                  c.attacking.targetType === 'player'
                    ? `attacking seat ${c.attacking.targetSeat}`
                    : `attacking a planeswalker (instanceId=${c.attacking.targetInstanceId}) of seat ${c.attacking.targetSeat}`,
                );
              }
              if (c.blocking && c.blocking.length > 0) status.push(`blocking attacker(s) ${c.blocking.join(', ')}`);
              return `${cardLabel(state, c.scryfallId, isMe, c.counters)} (${status.join(', ')})`;
            })
            .join('; '),
      );
    }
    if (p.graveyard.length > 0) {
      lines.push(`  Graveyard: ${p.graveyard.map((id) => state.cards[id]?.name ?? id).join(', ')}`);
    }
    if (p.exile.length > 0) {
      lines.push(`  Exile: ${p.exile.map((id) => state.cards[id]?.name ?? id).join(', ')}`);
    }
  }

  lines.push('');
  lines.push(
    `Reminder: only your own seat (${seat}, marked "THIS IS YOU" above) is under your control. When choosing an instanceId for attack_with or move_card_zone, it must come from YOUR OWN battlefield listed above — never from an opponent's battlefield. You cannot attack with, tap, or otherwise act on a creature or permanent you do not control.`,
  );
  lines.push('');
  if (me?.hand && me.hand.length > 0) {
    lines.push(
      'Your hand: ' +
        me.hand.map((id) => `${cardLabel(state, id, true)} (scryfallId=${id})`).join('; '),
    );
  } else {
    lines.push('Your hand is empty.');
  }

  if (me) {
    const isLand = (c: (typeof me.battlefield)[number]) => (state.cards[c.scryfallId]?.typeLine ?? '').includes('Land');
    const untappedLands = me.battlefield.filter((c) => isLand(c) && !c.tapped).length;
    const tappedLands = me.battlefield.filter((c) => isLand(c) && c.tapped).length;
    lines.push(`You have ${untappedLands} untapped land(s) and ${tappedLands} tapped land(s) — that's roughly how much mana you can make this turn.`);
    lines.push(
      me.landPlayedThisTurn
        ? 'You have already played a land this turn.'
        : 'You have NOT played a land this turn yet — play one now if you have any in hand.',
    );
    const floatingMana = Object.entries(me.manaPool ?? {}).filter(([, count]) => count > 0);
    if (floatingMana.length > 0) {
      lines.push(`Floating mana already in your pool: ${floatingMana.map(([color, count]) => `${count}${color}`).join(', ')}.`);
    }
  }

  const mulliganCount = me?.mulliganCount ?? 0;
  lines.push(`Mulligans taken: ${mulliganCount}. Cards owed on the bottom of your library if you keep now: ${mulliganCardsOwed(mulliganCount)}.`);

  return lines.join('\n');
}

/** Prompt for a block-only reaction (see takeBlockReaction) — deliberately a
 * separate, much narrower prompt than buildPrompt's full-turn one, since
 * this fires mid-opponent's-turn and the AI should only be deciding blocks,
 * not replaying its whole turn logic. Returns null when nothing is
 * currently attacking this seat, so callers can skip the LLM call entirely. */
function buildBlockPrompt(state: GameStateView, seat: number): string | null {
  const me = state.players.find((p) => p.seat === seat);
  if (!me) return null;

  const attackers: { instanceId: string; controllerSeat: number; label: string }[] = [];
  for (const p of state.players) {
    if (p.seat === seat) continue;
    for (const c of p.battlefield) {
      if (c.attacking?.targetSeat === seat) {
        attackers.push({ instanceId: c.instanceId, controllerSeat: p.seat, label: cardLabel(state, c.scryfallId, true, c.counters) });
      }
    }
  }
  if (attackers.length === 0) return null;

  const untappedBlockers = me.battlefield.filter((c) => !c.tapped && (state.cards[c.scryfallId]?.typeLine ?? '').includes('Creature'));

  const lines: string[] = [
    `You are seat ${seat} (${me.displayName}) in a Magic: The Gathering game. It is NOT your turn right now — ` +
      "an opponent has declared an attack against you during their own turn, and you're only being asked " +
      'whether to block, nothing else.',
    '',
    'Creatures currently attacking you:',
    ...attackers.map((a) => `- instanceId=${a.instanceId}, controlled by seat ${a.controllerSeat}: ${a.label}`),
    '',
  ];
  if (untappedBlockers.length > 0) {
    lines.push('Your untapped creatures available to block:');
    lines.push(...untappedBlockers.map((c) => `- instanceId=${c.instanceId}: ${cardLabel(state, c.scryfallId, true, c.counters)}`));
  } else {
    lines.push('You have no untapped creatures available to block.');
  }
  lines.push('');
  lines.push(
    "For each attacker you want to block, call block_with with YOUR blocker's instanceId (never an opponent's) " +
      "and that attacker's instanceId. Compare power/toughness and rules text (deathtouch, trample, first " +
      'strike, etc.) to judge the trade — block when it kills or favorably trades with the attacker, or when ' +
      "you can't afford the life loss; decline a block that would lose a valuable creature for nothing. You " +
      'may block zero, one, or several attackers (a creature can only block one attacker unless its rules text ' +
      'says otherwise). When you are done, stop calling functions — do not call pass_turn or any other ' +
      "action; this is not your turn.",
  );
  return lines.join('\n');
}

/** Used to hand the AI its actual new hand right after a mulligan — the
 * generic `{ ok: true }` tool result otherwise leaves it unable to say what
 * changed, since its prompt was only built once at the start of the turn. */
async function currentHandLabels(gameId: string, seat: number): Promise<string[]> {
  const state = await buildStateFor(gameId, seat);
  const me = state.players.find((p) => p.seat === seat);
  return (me?.hand ?? []).map((id) => `${cardLabel(state, id, true)} (scryfallId=${id})`);
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
      const targetType = args.targetType === 'planeswalker' ? 'planeswalker' : 'player';
      const targetSeat = Number(args.targetSeat);
      const targetInstanceId = args.targetInstanceId ? String(args.targetInstanceId) : undefined;
      return { type: 'DECLARE_ATTACK', instanceId, targetType, targetSeat, targetInstanceId };
    }
    case 'block_with': {
      const instanceId = String(args.instanceId);
      const attackerInstanceId = String(args.attackerInstanceId);
      return { type: 'DECLARE_BLOCK', instanceId, attackerInstanceId };
    }
    case 'move_card_zone':
      return {
        type: 'MOVE_CARD',
        fromZone: args.fromZone,
        toZone: args.toZone,
        instanceId: args.instanceId ? String(args.instanceId) : undefined,
        scryfallId: args.scryfallId ? String(args.scryfallId) : undefined,
        position: args.position === 'top' || args.position === 'bottom' ? args.position : undefined,
      };
    case 'adjust_life':
      return { type: 'ADJUST_LIFE', seat: Number(args.seat), delta: Number(args.delta) };
    case 'draw_card':
      return { type: 'DRAW_CARD' };
    case 'mulligan':
      return { type: 'MULLIGAN' };
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
  const aggressionAgainstMe = await fetchAggressionAgainst(gameId, seat);
  let step = await driver.sendInitial(buildPrompt(state, seat, aggressionAgainstMe));
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
      if (name === 'mulligan') {
        resultPayload.newHand = await currentHandLabels(gameId, seat);
      }
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

/** Narrow sibling of takeTurn for reacting to an opponent's attack — only
 * ever executes block_with calls. If the model calls anything else (or
 * nothing), the reaction just ends there; unlike takeTurn this never calls
 * pass_turn or forcePass, since it isn't anyone's turn transition. */
async function takeBlockReaction(gameId: string, seat: number, driver: AITurnDriver): Promise<void> {
  const state = await buildStateFor(gameId, seat);
  const prompt = buildBlockPrompt(state, seat);
  if (!prompt) return;

  let step = await driver.sendInitial(prompt);
  let blocksDeclared = 0;

  while (blocksDeclared < MAX_ACTIONS_PER_TURN && step.toolCall?.name === 'block_with') {
    if (step.reasoningText) {
      await logEvent(gameId, 'AI_REASONING', { text: step.reasoningText }, { seat });
    }

    const { id: toolCallId, name, args } = step.toolCall;
    let resultPayload: Record<string, unknown>;
    try {
      const rawAction = await mapFunctionCallToAction(gameId, seat, name, args);
      const action = actionSchema.parse(rawAction);
      await execute(gameId, { seat }, action);
      blocksDeclared += 1;
      resultPayload = { ok: true };
    } catch (err) {
      resultPayload = { ok: false, error: err instanceof Error ? err.message : 'Block failed' };
    }

    step = await driver.sendToolResult(toolCallId, name, resultPayload);
  }
}
