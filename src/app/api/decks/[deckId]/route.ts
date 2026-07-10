import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import {
  addCardToDeck,
  deleteDeck,
  getDeckForUser,
  removeCardFromDeck,
  setCommander,
} from '@/server/deck/deckService';

export async function GET(_req: Request, { params }: { params: { deckId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await getDeckForUser(params.deckId, auth.userId);
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  return NextResponse.json({ deck });
}

const addCardSchema = z.object({
  action: z.literal('addCard'),
  scryfallId: z.string(),
  quantity: z.number().int().min(1).max(99).optional(),
});

const removeCardSchema = z.object({
  action: z.literal('removeCard'),
  scryfallId: z.string(),
});

const setCommanderSchema = z.object({
  action: z.literal('setCommander'),
  scryfallId: z.string(),
});

const patchSchema = z.discriminatedUnion('action', [addCardSchema, removeCardSchema, setCommanderSchema]);

export async function PATCH(req: Request, { params }: { params: { deckId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await getDeckForUser(params.deckId, auth.userId);
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  try {
    if (parsed.data.action === 'addCard') {
      await addCardToDeck(params.deckId, parsed.data.scryfallId, parsed.data.quantity ?? 1);
    } else if (parsed.data.action === 'removeCard') {
      await removeCardFromDeck(params.deckId, parsed.data.scryfallId);
    } else if (parsed.data.action === 'setCommander') {
      await setCommander(params.deckId, parsed.data.scryfallId);
    }
  } catch (err) {
    console.error('[decks PATCH]', err);
    return NextResponse.json({ error: 'Could not look up that card right now' }, { status: 502 });
  }

  const updated = await getDeckForUser(params.deckId, auth.userId);
  return NextResponse.json({ deck: updated });
}

export async function DELETE(_req: Request, { params }: { params: { deckId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await deleteDeck(params.deckId, auth.userId);
  if (!ok) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
