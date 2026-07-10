import { prisma } from '@/lib/prisma';
import * as scryfall from './client';
import type { ScryfallCard } from './client';

export interface CardSummary {
  scryfallId: string;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  imageNormal: string | null;
  imageArtCrop: string | null;
}

function toCacheData(card: ScryfallCard) {
  const face = card.image_uris ? card : card.card_faces?.[0];
  const imageUris = face?.image_uris ?? card.image_uris;

  return {
    scryfallId: card.id,
    oracleId: card.oracle_id ?? null,
    name: card.name,
    manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? null,
    typeLine: card.type_line ?? card.card_faces?.[0]?.type_line ?? null,
    oracleText: card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? null,
    power: card.power ?? card.card_faces?.[0]?.power ?? null,
    toughness: card.toughness ?? card.card_faces?.[0]?.toughness ?? null,
    loyalty: card.loyalty ?? null,
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    imageNormal: imageUris?.normal ?? null,
    imageArtCrop: imageUris?.art_crop ?? null,
    imageLarge: imageUris?.large ?? null,
    scryfallUri: card.scryfall_uri ?? null,
    setCode: card.set ?? null,
    collectorNum: card.collector_number ?? null,
    raw: card as object,
  };
}

async function upsertCard(card: ScryfallCard) {
  const data = toCacheData(card);
  return prisma.cardCache.upsert({
    where: { scryfallId: card.id },
    create: data,
    update: data,
  });
}

export async function getCardById(scryfallId: string) {
  const cached = await prisma.cardCache.findUnique({ where: { scryfallId } });
  if (cached) return cached;

  const card = await scryfall.getCardById(scryfallId);
  return upsertCard(card);
}

export async function getCardByExactName(name: string) {
  // Multiple printings can share a name; order deterministically so repeated
  // lookups (e.g. re-importing the same decklist) always resolve to the same row.
  const existing = await prisma.cardCache.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    orderBy: { fetchedAt: 'asc' },
  });
  if (existing) return existing;

  const card = await scryfall.getCardByExactName(name);
  if (!card) return null;
  return upsertCard(card);
}

/**
 * Resolves many card names at once (e.g. for a decklist import), checking
 * the cache first and only round-tripping to Scryfall's bulk /cards/collection
 * endpoint for the misses — a couple of requests total instead of one per
 * name, which is what actually trips Scryfall's rate limit on a 100-card list.
 */
export async function getCardsByNames(names: string[]) {
  const result = new Map<string, Awaited<ReturnType<typeof upsertCard>> | null>();
  if (names.length === 0) return result;

  const uniqueNames = [...new Set(names)];

  const cachedRows = await prisma.cardCache.findMany({
    where: { name: { in: uniqueNames, mode: 'insensitive' } },
    orderBy: { fetchedAt: 'asc' },
  });
  const cacheByLowerName = new Map<string, (typeof cachedRows)[number]>();
  for (const row of cachedRows) {
    const key = row.name.toLowerCase();
    if (!cacheByLowerName.has(key)) cacheByLowerName.set(key, row); // earliest-cached wins, deterministic
  }

  const missingNames: string[] = [];
  for (const name of uniqueNames) {
    const hit = cacheByLowerName.get(name.toLowerCase());
    if (hit) {
      result.set(name, hit);
    } else {
      missingNames.push(name);
    }
  }

  if (missingNames.length > 0) {
    const { found } = await scryfall.getCardsByNames(missingNames);
    const upserted = await Promise.all(found.map((card) => upsertCard(card)));
    const upsertedByLowerName = new Map(upserted.map((row) => [row.name.toLowerCase(), row]));

    for (const name of missingNames) {
      result.set(name, upsertedByLowerName.get(name.toLowerCase()) ?? null);
    }
  }

  return result;
}

export async function searchCards(query: string, page = 1): Promise<{ cards: CardSummary[]; hasMore: boolean; totalCards: number }> {
  const { cards, hasMore, totalCards } = await scryfall.searchCards(query, page);

  // Warm the cache in the background so later getCardById calls are fast.
  void Promise.allSettled(cards.map((card) => upsertCard(card)));

  const summaries: CardSummary[] = cards.map((card) => {
    const face = card.image_uris ? card : card.card_faces?.[0];
    const imageUris = face?.image_uris ?? card.image_uris;
    return {
      scryfallId: card.id,
      name: card.name,
      manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? null,
      typeLine: card.type_line ?? card.card_faces?.[0]?.type_line ?? null,
      imageNormal: imageUris?.normal ?? null,
      imageArtCrop: imageUris?.art_crop ?? null,
    };
  });

  return { cards: summaries, hasMore, totalCards };
}

export async function autocomplete(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  return scryfall.autocomplete(query);
}
