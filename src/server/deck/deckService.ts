import { prisma } from '@/lib/prisma';
import { DeckFormat } from '@prisma/client';
import { parseDecklist } from './decklistParser';
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

export async function importDecklist(deckId: string, text: string): Promise<ImportResult> {
  const lines = parseDecklist(text);
  const warnings: string[] = [];
  let imported = 0;

  // Merge duplicate lines (e.g. the same card pasted twice) so the final
  // quantity is their sum rather than the last line silently overwriting the rest.
  const quantityByName = new Map<string, number>();
  for (const line of lines) {
    quantityByName.set(line.cardName, (quantityByName.get(line.cardName) ?? 0) + line.quantity);
  }

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
