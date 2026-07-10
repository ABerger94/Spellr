import { prisma } from '@/lib/prisma';
import { GameFormat, DeckFormat, type Deck, type DeckCard } from '@prisma/client';
import { shuffle } from './zones';
import { EMPTY_ZONES, type ZoneState } from '@/types/game';
import { broadcastGameState } from '@/server/realtime/pusherServer';
import { logEvent } from './gameEvents';
import { maybeTakeAITurn } from '@/server/ai/aiController';

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

  return { ...EMPTY_ZONES, library, commandZone };
}

export async function listGamesForUser(userId: string) {
  return prisma.game.findMany({
    where: { players: { some: { userId } }, status: { in: ['LOBBY', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
    include: { players: { include: { user: true } } },
  });
}

export async function createGame(
  hostUserId: string,
  format: GameFormat,
  deckId: string,
  opts: { seatCount?: number; fillAI?: boolean } = {},
) {
  const maxSeats = format === 'COMMANDER' ? Math.min(Math.max(opts.seatCount ?? 4, 2), 4) : 2;

  const extraSeats = opts.fillAI
    ? Array.from({ length: maxSeats - 1 }, (_, i) => ({
        seat: i + 1,
        isAI: true,
        aiPersona: AI_PERSONAS[i % AI_PERSONAS.length],
        // v1 shortcut: AI seats borrow the host's deck rather than having their
        // own curated decks — there's no deck-authoring flow for AI accounts yet.
        deckId,
      }))
    : [];

  return prisma.game.create({
    data: {
      format,
      hostUserId,
      maxSeats,
      players: {
        create: [{ userId: hostUserId, deckId, seat: 0, isAI: false }, ...extraSeats],
      },
    },
    include: { players: true },
  });
}

export async function joinGame(inviteCode: string, userId: string, deckId: string) {
  const game = await prisma.game.findUnique({ where: { inviteCode }, include: { players: true } });
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
  return prisma.game.findUnique({ where: { id: game.id }, include: { players: true } });
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
  // blocks on waiting for more humans to join.
  const takenSeats = new Set(game.players.map((p) => p.seat));
  const hostDeckId = game.players.find((p) => p.seat === 0)?.deckId;
  const newAiSeats: number[] = [];
  for (let seat = 1; seat < game.maxSeats; seat++) {
    if (!takenSeats.has(seat) && hostDeckId) {
      newAiSeats.push(seat);
    }
  }
  if (newAiSeats.length > 0) {
    await prisma.gamePlayer.createMany({
      data: newAiSeats.map((seat, i) => ({
        gameId,
        seat,
        isAI: true,
        aiPersona: AI_PERSONAS[i % AI_PERSONAS.length],
        deckId: hostDeckId,
      })),
    });
  }

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

  const firstPlayer = players.find((p) => p.seat === 0);
  if (firstPlayer?.isAI) {
    void maybeTakeAITurn(gameId, 0);
  }
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

  const firstPlayer = players.find((p) => p.seat === 0);
  if (firstPlayer?.isAI) {
    void maybeTakeAITurn(gameId, 0);
  }
}
