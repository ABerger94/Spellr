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

/** Public games anyone can browse without an invite code — waiting-room
 * games can be joined (or spectated); already-started ones can only be
 * spectated, since a seat can't be taken mid-game. Excludes games the user
 * is already a player in (those already show under "Your games") and
 * anything the host marked invite-only. */
export async function listOpenPublicGames(excludeUserId: string) {
  return prisma.game.findMany({
    where: {
      status: { in: ['LOBBY', 'ACTIVE'] },
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
      // The host joins their own seat 0 without a deck picked yet, same as
      // everyone else — deck choice happens in the lobby waiting room, not
      // at creation time.
      players: {
        create: [{ userId: hostUserId, seat: 0, isAI: false }],
      },
    },
    include: { players: true },
  });
}

/** Shared "add me to an open seat" logic behind both invite-code joining and
 * joining a game browsed from the open-lobbies list. Deck choice happens
 * afterward in the lobby waiting room (setPlayerDeck), not at join time. */
export async function joinGameById(gameId: string, userId: string) {
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

  await prisma.gamePlayer.create({ data: { gameId: game.id, userId, seat, isAI: false } });

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

export async function joinGame(inviteCode: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { inviteCode } });
  if (!game) throw new Error('Game not found');
  return joinGameById(game.id, userId);
}

/** Registers a user as a spectator of a game found by id — used for the
 * "Spectate" button on a public open-lobby listing. Doesn't take a seat, so
 * it works regardless of whether the game is full, and at any status
 * (waiting room, in progress, or finished). A player spectating their own
 * game is a harmless no-op rather than an error — the player row already
 * grants them full access. */
export async function spectateGameById(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw new Error('Game not found');
  if (!game.isPublic) throw new Error('This game is invite-only — ask the host for the invite code');

  await prisma.gameSpectator.upsert({
    where: { gameId_userId: { gameId, userId } },
    update: {},
    create: { gameId, userId },
  });
  return game;
}

/** Same as spectateGameById, but found by invite code — the spectate
 * equivalent of joinGame, for watching a private game you were invited to. */
export async function spectateGameByInviteCode(inviteCode: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { inviteCode } });
  if (!game) throw new Error('Game not found');

  await prisma.gameSpectator.upsert({
    where: { gameId_userId: { gameId: game.id, userId } },
    update: {},
    create: { gameId: game.id, userId },
  });
  return game;
}

/** Picks (or changes) the calling player's deck while still in the lobby.
 * Changing deck after marking ready un-readies them — a deck swap should
 * always require a fresh confirmation. */
export async function setPlayerDeck(gameId: string, userId: string, deckId: string) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== 'LOBBY') throw new Error('That game has already started');

  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId } });
  if (!deck) throw new Error('Deck not found');
  if (deck.format !== deckFormatFor(game.format)) throw new Error('Deck format does not match game format');

  const player = await prisma.gamePlayer.findFirst({ where: { gameId, userId } });
  if (!player) throw new Error('You are not in this game');

  await prisma.gamePlayer.update({ where: { id: player.id }, data: { deckId, isReady: false } });

  try {
    await broadcastGameState(gameId);
  } catch (err) {
    console.error('[broadcastGameState]', err);
  }
}

/** Marks the calling player ready (or not) in the lobby — requires a deck
 * already picked when marking ready, so "Start" can trust isReady alone. */
export async function setPlayerReady(gameId: string, userId: string, ready: boolean) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== 'LOBBY') throw new Error('That game has already started');

  const player = await prisma.gamePlayer.findFirst({ where: { gameId, userId } });
  if (!player) throw new Error('You are not in this game');
  if (ready && !player.deckId) throw new Error('Pick a deck before marking yourself ready');

  await prisma.gamePlayer.update({ where: { id: player.id }, data: { isReady: ready } });

  try {
    await broadcastGameState(gameId);
  } catch (err) {
    console.error('[broadcastGameState]', err);
  }
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
 * host never used the explicit action. Created already deck-assigned and
 * ready, so AI seats never block the human-readiness gate in startGame. */
async function fillEmptySeats(
  gameId: string,
  maxSeats: number,
  format: GameFormat,
  players: { seat: number; deckId: string | null }[],
): Promise<void> {
  const takenSeats = new Set(players.map((p) => p.seat));
  // Last-resort fallback if the precon-deck library came up empty (e.g.
  // Scryfall was unreachable when it was seeded) — better to hand an AI
  // seat a copy of the host's own deck than leave it with no deck at all.
  const hostDeckId = players.find((p) => p.seat === 0)?.deckId ?? null;

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
      isReady: true,
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

/** Same as getGameForUser, but also grants access to a registered spectator
 * — used for the read-only state fetch, since watching a game shouldn't
 * require a seat. `buildStateFor`'s existing redaction already treats any
 * viewerSeat that doesn't match a real seat (spectators never have one) as
 * "not this seat", so a spectator gets exactly the same no-hidden-info view
 * as anyone else's opponent, with no extra branching needed there. */
export async function getGameForViewer(gameId: string, userId: string) {
  return prisma.game.findFirst({
    where: { id: gameId, OR: [{ players: { some: { userId } } }, { spectators: { some: { userId } } }] },
    include: { players: { include: { user: true } } },
  });
}

/** Randomly reassigns every seat number at the table (host included) —
 * turn order and each seat's spot in the table grid are both driven by
 * seat number, so this randomizes both at once. Done in two passes: seats
 * are first moved to distinct negative placeholders, then to their final
 * shuffled positions, so the `[gameId, seat]` unique constraint never
 * collides mid-update (a player keeping a seat number another player is
 * also about to take would otherwise fail the constraint). Host privileges
 * (Start/Restart/End) are tracked via `hostUserId`, not seat number, so
 * reseating the host doesn't touch who can do what. */
async function randomizeSeatOrder(gameId: string): Promise<void> {
  const players = await prisma.gamePlayer.findMany({ where: { gameId }, select: { id: true, seat: true } });
  const shuffledSeats = shuffle(players.map((p) => p.seat));

  await prisma.$transaction(players.map((p, i) => prisma.gamePlayer.update({ where: { id: p.id }, data: { seat: -(i + 1) } })));
  await prisma.$transaction(
    players.map((p, i) => prisma.gamePlayer.update({ where: { id: p.id }, data: { seat: shuffledSeats[i] } })),
  );
}

export async function startGame(gameId: string, requestingUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { players: { include: { deck: { include: { cards: true } } } } },
  });
  if (!game) throw new Error('Game not found');
  if (game.hostUserId !== requestingUserId) throw new Error('Only the host can start the game');
  if (game.status !== 'LOBBY') throw new Error('That game has already started');

  // Every human seat already at the table must have picked a deck and
  // confirmed ready before the host can start — empty seats don't block
  // (they're auto-filled with an already-ready AI below), and AI seats are
  // always ready by construction.
  const notReady = game.players.filter((p) => !p.isAI && (!p.deckId || !p.isReady));
  if (notReady.length > 0) {
    throw new Error('Every player must pick a deck and mark themselves ready before the game can start');
  }

  // Backfill any seats the host left empty with AI players so "Start" never
  // blocks on waiting for more humans to join, even if the host never used
  // the explicit "fill remaining seats with AI" action while waiting.
  await fillEmptySeats(gameId, game.maxSeats, game.format, game.players);

  // Turn order (and each seat's spot around the table) follows seat number,
  // and up to now seat number has just been join order — the host is always
  // seat 0 and therefore always goes first. Shuffling it here, once, right
  // as the game actually starts, matches how a real table decides seating
  // and turn order instead of rewarding whoever happened to create the lobby.
  await randomizeSeatOrder(gameId);

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
      eliminated: false,
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
      data: { life: startingLife, zones: zones as unknown as object, counters: {}, commanderDamage: {}, eliminated: false },
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
