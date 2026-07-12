import { prisma } from '@/lib/prisma';
import { DeckFormat } from '@prisma/client';
import { parseDecklist } from './decklistParser';
import { importFromExternalUrl } from './externalDeckImport';
import { getCardById, getCardsByNames } from '@/server/scryfall/cardService';

export async function listDecksForUser(userId: string) {
  return prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { cards: { include: { cardCache: true } } },
  });
}

export async function createDeck(userId: string, name: string, format: DeckFormat) {
  return prisma.deck.create({ data: { userId, name, format } });
}

export async function getDeckForUser(deckId: string, userId: string) {
  return prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: { cards: { include: { cardCache: true } } },
  });
}

export async function deleteDeck(deckId: string, userId: string) {
  const deck = await prisma.deck.findFirst({ where: { id: deckId, userId } });
  if (!deck) return false;
  await prisma.deck.delete({ where: { id: deckId } });
  return true;
}

export async function addCardToDeck(deckId: string, scryfallId: string, quantity = 1) {
  await getCardById(scryfallId); // ensures CardCache row exists (FK requirement)
  return prisma.deckCard.upsert({
    where: { deckId_scryfallId: { deckId, scryfallId } },
    create: { deckId, scryfallId, quantity },
    update: { quantity: { increment: quantity } },
  });
}

export async function removeCardFromDeck(deckId: string, scryfallId: string) {
  await prisma.deckCard.deleteMany({ where: { deckId, scryfallId } });
}

export async function setCommander(deckId: string, scryfallId: string) {
  await prisma.$transaction([
    prisma.deckCard.updateMany({ where: { deckId }, data: { isCommander: false } }),
    prisma.deckCard.updateMany({ where: { deckId, scryfallId }, data: { isCommander: true } }),
    prisma.deck.update({ where: { id: deckId }, data: { commanderCardId: scryfallId } }),
  ]);
}

export interface ImportResult {
  imported: number;
  warnings: string[];
}

/** Resolves each name to a cached/Scryfall card and upserts it into the deck
 * at the given quantity — shared by the paste-text and import-from-URL
 * paths, which only differ in how they produce the name→quantity map. */
async function resolveAndUpsertCards(deckId: string, quantityByName: Map<string, number>): Promise<ImportResult> {
  const warnings: string[] = [];
  let imported = 0;

  // Resolve every name in (at most a couple of) batched requests rather than
  // one Scryfall call per card — a 100-card decklist otherwise easily trips
  // Scryfall's rate limit.
  let resolved: Awaited<ReturnType<typeof getCardsByNames>>;
  try {
    resolved = await getCardsByNames([...quantityByName.keys()]);
  } catch (err) {
    return {
      imported: 0,
      warnings: [`Card lookup failed: ${err instanceof Error ? err.message : 'unknown error'}`],
    };
  }

  for (const [cardName, quantity] of quantityByName) {
    const card = resolved.get(cardName);
    if (!card) {
      warnings.push(`Could not find a card named "${cardName}"`);
      continue;
    }
    try {
      await prisma.deckCard.upsert({
        where: { deckId_scryfallId: { deckId, scryfallId: card.scryfallId } },
        create: { deckId, scryfallId: card.scryfallId, quantity },
        update: { quantity },
      });
      imported += 1;
    } catch (err) {
      warnings.push(`Could not import "${cardName}": ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return { imported, warnings };
}

export async function importDecklist(deckId: string, text: string): Promise<ImportResult> {
  const lines = parseDecklist(text);

  // Merge duplicate lines (e.g. the same card pasted twice) so the final
  // quantity is their sum rather than the last line silently overwriting the rest.
  const quantityByName = new Map<string, number>();
  for (const line of lines) {
    quantityByName.set(line.cardName, (quantityByName.get(line.cardName) ?? 0) + line.quantity);
  }

  return resolveAndUpsertCards(deckId, quantityByName);
}

/** Imports a decklist from a Moxfield or Archidekt deck URL, and auto-sets
 * the commander if the source site identified exactly one. Moxfield and
 * Archidekt's APIs are unofficial and may block server-side requests
 * outright — that surfaces as a single warning rather than a thrown error,
 * same shape as a normal (if unproductive) paste import. */
export async function importDecklistFromUrl(deckId: string, url: string): Promise<ImportResult & { commanderName: string | null }> {
  let external;
  try {
    external = await importFromExternalUrl(url);
  } catch (err) {
    return { imported: 0, warnings: [err instanceof Error ? err.message : 'Import failed'], commanderName: null };
  }

  const quantityByName = new Map<string, number>();
  let commanderName: string | null = null;
  for (const card of external.cards) {
    quantityByName.set(card.name, (quantityByName.get(card.name) ?? 0) + card.quantity);
    if (card.isCommander) commanderName = card.name;
  }

  const result = await resolveAndUpsertCards(deckId, quantityByName);

  // Only set the commander if it actually resolved and imported cleanly —
  // a warning for its name means resolveAndUpsertCards already skipped it.
  if (commanderName && !result.warnings.some((w) => w.includes(commanderName!))) {
    const row = await prisma.cardCache.findFirst({ where: { name: { equals: commanderName, mode: 'insensitive' } } });
    if (row) await setCommander(deckId, row.scryfallId);
  }

  return { ...result, commanderName };
}
