import { prisma } from '@/lib/prisma';
import { DeckFormat } from '@prisma/client';
import { parseDecklist } from './decklistParser';
import { getCardByExactName, getCardById } from '@/server/scryfall/cardService';

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

  for (const line of lines) {
    let card;
    try {
      card = await getCardByExactName(line.cardName);
    } catch (err) {
      warnings.push(`Lookup failed for "${line.cardName}": ${err instanceof Error ? err.message : 'unknown error'}`);
      continue;
    }
    if (!card) {
      warnings.push(`Could not find a card named "${line.cardName}"`);
      continue;
    }
    await prisma.deckCard.upsert({
      where: { deckId_scryfallId: { deckId, scryfallId: card.scryfallId } },
      create: { deckId, scryfallId: card.scryfallId, quantity: line.quantity },
      update: { quantity: line.quantity },
    });
    imported += 1;
  }

  return { imported, warnings };
}
