import { prisma } from '@/lib/prisma';
import { GameFormat, DeckFormat, type Deck, type DeckCard } from '@prisma/client';
import { shuffle, drawCards } from './zones';
import { EMPTY_ZONES, type ZoneState } from '@/types/game';
import { broadcastGameCancelled, broadcastGameState } from '@/server/realtime/pusherServer';
import { logEvent } from './gameEvents';
import { pickAIPreconDeckIds } from '@/server/ai/aiPreconDecks';

const AI_PERSONAS = ['Nissa (AI)', 'Jace (AI)', 'Chandra (AI)', 'Liliana (AI)'];

// GameFormat and DeckFormat are separate enums with different string values
// for the non-Commander case ('ONE_V_ONE' vs 'STANDARD_1V1') — never compare
// them directly.
export function deckFormatFor(gameFormat: GameFormat): DeckFormat {
  return gameFormat === 'COMMANDER' ? DeckFormat.COMMANDER : DeckFormat.STANDARD_1V1;
}

export function startingLifeFor(format: GameFormat): number {
  return format === 'COMMANDER' ? 40 : 20;
}

/** Builds a freshly-shuffled library (+ command zone, for Commander) from a
 * player's deck — the "deal a new hand" logic shared by starting and
 * restarting a game. */
function buildFreshZones(deck: (Deck & { cards: DeckCard[] }) | null, format: GameFormat): ZoneState {
  let library: string[] = [];
  let commandZone: string[] = [];

  if (deck) {
    const expanded: string[] = [];
    for (const dc of deck.cards) {
      if (dc.isCommander) continue;
      for (let i = 0; i < dc.quantity; i++) expanded.push(dc.scryfallId);
    }
    library = shuffle(expanded);
    if (format === 'COMMANDER' && deck.commanderCardId) {
      commandZone = [deck.commanderCardId];
    }
  }

  // Deal a real opening hand (up to 7, or fewer for a very small/test deck)
  // rather than leaving every player to draw it manually one card at a time.
  const { zones: dealt } = drawCards({ ...EMPTY_ZONES, library, commandZone }, 7);
  return dealt;
}

export async function listGamesForUser(userId: string) {
  return prisma.game.findMany({
    where: { players: { some: { userId } }, status: { in: ['LOBBY', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
    include: { players: { include: { user: true } } },
  });
}

/** Public lobbies anyone can browse and join without an invite code —
 * excludes games the user is already in (those already show under "Your
 * games") and anything the host marked invite-only. */
export async function listOpenPublicGames(excludeUserId: string) {
  return prisma.game.findMany({
    where: {
      status: 'LOBBY',
      isPublic: true,
      players: { none: { userId: excludeUserId } },
    },
    orderBy: { createdAt: 'desc' },
    include: { players: { include: { user: true } } },
  });
}

export async function createGame(
  hostUserId: string,
  format: GameFormat,
  deckId: string,
  opts: { seatCount?: number; isPublic?: boolean; bracket?: number } = {},
) {
  const maxSeats = format === 'COMMANDER' ? Math.min(Math.max(opts.seatCount ?? 4, 2), 4) : 2;
  const bracket = Math.min(Math.max(opts.bracket ?? 3, 1), 5);

  return prisma.game.create({
    data: {
      format,
      hostUserId,
      maxSeats,
      isPublic: opts.isPublic ?? true,
      bracket,
      players: {
        create: [{ userId: hostUserId, deckId, seat: 0, isAI: false }],
      },
    },
    include: { players: true },
  });
}

/** Shared "add me to an open seat" logic behind both invite-code joining and
 * joining a game browsed from the open-lobbies list. */
export async function joinGameById(gameId: string, userId: string, deckId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, include: { players: true } });
  if (!game) throw new Error('Game not found');
  if (game.status !== 'LOBBY') throw new Error('That game has already started');
  if (game.players.some((p) => p.userId === userId)) {
    return prisma.game.findUnique({ where: { id: game.id }, include: { players: true } });
  }

  const takenSeats = new Set(game.players.map((p) => p.seat));
  let seat = 0;
  while (takenSeats.has(seat)) seat++;
  if (seat >= game.maxSeats) throw new Error('That game is full');

  await prisma.gamePlayer.create({ data: { gameId: game.id, userId, deckId, seat, isAI: false } });

  // Without this, the host (and anyone else already waiting) never finds out
  // a new player joined until they manually reload — nothing else broadcasts
  // on a fresh join.
  try {
    await broadcastGameState(gameId);
  } catch (err) {
    console.error('[broadcastGameState]', err);
  }

  return prisma.game.findUnique({ where: { id: game.id }, include: { players: true } });
}

export async function joinGame(inviteCode: string, userId: string, deckId: string) {
  const game = await prisma.game.findUnique({ where: { inviteCode } });
  if (!game) throw new Error('Game not found');
  return joinGameById(game.id, userId, deckId);
}

/** Host-only. Permanently deletes a game that hasn't started yet (cascades
 * to its GamePlayer/GameEvent rows) and tells anyone else waiting in the
 * lobby that it's gone. */
export async function cancelGame(gameId: string, requestingUserId: string) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.hostUserId !== requestingUserId) throw new Error('Only the host can cancel the game');
  if (game.status !== 'LOBBY') throw new Error('That game has already started');

  try {
    await broadcastGameCancelled(gameId);
  } catch (err) {
    console.error('[broadcastGameCancelled]', err);
  }
  await prisma.game.delete({ where: { id: gameId } });
}

/** Adds an AI player (its own precon deck, cycled randomly) to every seat
 * still empty in a LOBBY game — shared by the explicit host action below and
 * by starting a game, so "Start" never blocks on unfilled seats even if the
 * host never used the explicit action. No-ops if every seat is already
 * taken, or if the host's own seat/deck can't be found. */
async function fillEmptySeats(
  gameId: string,
  maxSeats: number,
  format: GameFormat,
  players: { seat: number; deckId: string | null }[],
): Promise<void> {
  const takenSeats = new Set(players.map((p) => p.seat));
  const hostDeckId = players.find((p) => p.seat === 0)?.deckId;
  if (!hostDeckId) return;

  const newAiSeats: number[] = [];
  for (let seat = 1; seat < maxSeats; seat++) {
    if (!takenSeats.has(seat)) newAiSeats.push(seat);
  }
  if (newAiSeats.length === 0) return;

  const aiDeckIds = await pickAIPreconDeckIds(deckFormatFor(format), newAiSeats.length);
  await prisma.gamePlayer.createMany({
    data: newAiSeats.map((seat, i) => ({
      gameId,
      seat,
      isAI: true,
      aiPersona: AI_PERSONAS[i % AI_PERSONAS.length],
      deckId: aiDeckIds[i % aiDeckIds.length] ?? hostDeckId,
    })),
  });
}

/** Host-only, explicit "fill remaining seats with AI" action available while
 * still waiting in the lobby — lets the host see who's actually joined
 * before deciding to add AI opponents, instead of committing to it blindly
 * at game-creation time. */
export async function fillRemainingSeatsWithAI(gameId: string, requestingUserId: string): Promise<void> {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, include: { players: true } });
  if (game.hostUserId !== requestingUserId) throw new Error('Only the host can fill seats with AI');
  if (game.status !== 'LOBBY') throw new Error('That game has already started');

  await fillEmptySeats(gameId, game.maxSeats, game.format, game.players);

  try {
    await broadcastGameState(gameId);
  } catch (err) {
    console.error('[broadcastGameState]', err);
  }
}

export async function getGameForUser(gameId: string, userId: string) {
  return prisma.game.findFirst({
    where: { id: gameId, players: { some: { userId } } },
    include: { players: { include: { user: true } } },
  });
}

export async function startGame(gameId: string, requestingUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { players: { include: { deck: { include: { cards: true } } } } },
  });
  if (!game) throw new Error('Game not found');
  if (game.hostUserId !== requestingUserId) throw new Error('Only the host can start the game');
  if (game.status !== 'LOBBY') throw new Error('That game has already started');

  // Backfill any seats the host left empty with AI players so "Start" never
  // blocks on waiting for more humans to join, even if the host never used
  // the explicit "fill remaining seats with AI" action while waiting.
  await fillEmptySeats(gameId, game.maxSeats, game.format, game.players);

  const players = await prisma.gamePlayer.findMany({
    where: { gameId },
    include: { deck: { include: { cards: true } } },
  });

  const startingLife = startingLifeFor(game.format);

  for (const player of players) {
    const zones = buildFreshZones(player.deck, game.format);
    await prisma.gamePlayer.update({
      where: { id: player.id },
      data: { life: startingLife, zones: zones as unknown as object, connected: player.isAI },
    });
  }

  await prisma.game.update({
    where: { id: gameId },
    data: { status: 'ACTIVE', startedAt: new Date(), currentTurnSeat: 0, turnNumber: 1 },
  });

  await logEvent(gameId, 'GAME_STARTED', { seatCount: players.length });

  try {
    await broadcastGameState(gameId);
  } catch (err) {
    console.error('[broadcastGameState]', err);
  }
  // If seat 0 is AI, a connected client's useGameState hook notices via the
  // returned state and calls POST /api/games/[gameId]/ai-turn itself.
}

/** Puts one player's cards back in their library (reshuffled), returns their
 * commander to the command zone, and resets their life/counters — a "start
 * over" for just that seat, without touching anyone else's board. */
export async function resetPlayerBoard(gameId: string, seat: number) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  const player = await prisma.gamePlayer.findFirstOrThrow({
    where: { gameId, seat },
    include: { deck: { include: { cards: true } } },
  });
  const zones = buildFreshZones(player.deck, game.format);
  await prisma.gamePlayer.update({
    where: { id: player.id },
    data: {
      life: startingLifeFor(game.format),
      zones: zones as unknown as object,
      counters: {},
      commanderDamage: {},
    },
  });
}

/** Resets every player's board and life, and rewinds the turn counter — a
 * full restart of an in-progress game for the same seats. Host-only. */
export async function restartGame(gameId: string, requestingUserId: string) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.hostUserId !== requestingUserId) throw new Error('Only the host can restart the game');

  const players = await prisma.gamePlayer.findMany({
    where: { gameId },
    include: { deck: { include: { cards: true } } },
  });
  const startingLife = startingLifeFor(game.format);

  for (const player of players) {
    const zones = buildFreshZones(player.deck, game.format);
    await prisma.gamePlayer.update({
      where: { id: player.id },
      data: { life: startingLife, zones: zones as unknown as object, counters: {}, commanderDamage: {} },
    });
  }

  await prisma.game.update({ where: { id: gameId }, data: { currentTurnSeat: 0, turnNumber: 1 } });
  // If seat 0 is AI, a connected client's useGameState hook notices via the
  // returned state and calls POST /api/games/[gameId]/ai-turn itself.
}

/** Host-only. Marks an in-progress game FINISHED — its board and log are
 * left intact (not deleted), it just drops off the "Your games" list. */
export async function endGame(gameId: string, requestingUserId: string) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.hostUserId !== requestingUserId) throw new Error('Only the host can end the game');
  if (game.status !== 'ACTIVE') throw new Error('Game is not active');

  await prisma.game.update({ where: { id: gameId }, data: { status: 'FINISHED', endedAt: new Date() } });
}
