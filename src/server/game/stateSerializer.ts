import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import type { GameStateView, PlayerStateView, ZoneState, CardFacts, CardFace } from '@/types/game';

interface RawScryfallFace {
  name?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: { normal?: string };
}

/** Two-sided cards (transform/MDFC/battle) store each face's own image under
 * card_faces — split cards (Fire // Ice) also have card_faces but share a
 * single top-level image, so only a face with its own image counts as a
 * real flippable back. */
function extractBackFace(raw: unknown): CardFace | null {
  const faces = (raw as { card_faces?: RawScryfallFace[] } | null)?.card_faces;
  if (!Array.isArray(faces) || faces.length < 2) return null;
  const back = faces[1];
  if (!back?.image_uris?.normal) return null;
  return {
    name: back.name ?? 'Back face',
    imageNormal: back.image_uris.normal,
    typeLine: back.type_line ?? null,
    oracleText: back.oracle_text ?? null,
    power: back.power ?? null,
    toughness: back.toughness ?? null,
  };
}

export async function buildStateFor(gameId: string, viewerSeat: number | null): Promise<GameStateView> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { players: { include: { user: true } } },
  });

  // Batch-fetch card facts for every scryfallId visible anywhere in this
  // view (public zones for everyone, hand contents only for the viewer).
  const allIds = new Set<string>();
  for (const p of game.players) {
    const zones = p.zones as unknown as ZoneState;
    zones.battlefield.forEach((c) => allIds.add(c.scryfallId));
    zones.graveyard.forEach((id) => allIds.add(id));
    zones.exile.forEach((id) => allIds.add(id));
    zones.commandZone.forEach((id) => allIds.add(id));
    if (p.seat === viewerSeat) {
      zones.hand.forEach((id) => allIds.add(id));
      (zones.pendingLook ?? []).forEach((id) => allIds.add(id));
    }
  }

  const cardRows = allIds.size > 0 ? await prisma.cardCache.findMany({ where: { scryfallId: { in: [...allIds] } } }) : [];
  const cards: Record<string, CardFacts> = {};
  for (const row of cardRows) {
    cards[row.scryfallId] = {
      scryfallId: row.scryfallId,
      name: row.name,
      imageNormal: row.imageNormal,
      typeLine: row.typeLine,
      manaCost: row.manaCost,
      oracleText: row.oracleText,
      power: row.power,
      toughness: row.toughness,
      backFace: extractBackFace(row.raw),
    };
  }

  const players: PlayerStateView[] = [...game.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const zones = p.zones as unknown as ZoneState;
      const isViewer = p.seat === viewerSeat;
      return {
        seat: p.seat,
        userId: p.userId,
        displayName: p.isAI ? p.aiPersona ?? `AI Seat ${p.seat}` : p.user?.displayName ?? 'Player',
        isAI: p.isAI,
        connected: p.connected,
        life: p.life,
        counters: (p.counters as Record<string, number>) ?? {},
        commanderDamage: (p.commanderDamage as Record<string, number>) ?? {},
        battlefield: zones.battlefield,
        graveyard: zones.graveyard,
        exile: zones.exile,
        commandZone: zones.commandZone,
        libraryCount: zones.library.length,
        hand: isViewer ? zones.hand : null,
        handCount: zones.hand.length,
        pendingLook: isViewer ? zones.pendingLook ?? [] : [],
        pendingLookMode: isViewer ? zones.pendingLookMode ?? null : null,
        // Mana pool is public information (like life), visible for every player.
        manaPool: zones.manaPool ?? {},
        // How many mulligans taken is also public (everyone watches you draw
        // and reshuffle at the table), needed by the AI to know how many
        // cards it owes on the bottom of its library once it keeps a hand.
        mulliganCount: zones.mulliganCount ?? 0,
      };
    });

  return {
    gameId: game.id,
    format: game.format,
    status: game.status,
    currentTurnSeat: game.currentTurnSeat,
    turnNumber: game.turnNumber,
    viewerSeat,
    players,
    cards,
    aiEnabled: !!(env.geminiApiKey || env.groqApiKey || env.cerebrasApiKey || env.openRouterApiKey),
  };
}
