import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DeckFormat } from '@prisma/client';
import { requireSession } from '@/server/auth/session';
import { createDeck, listDecksForUser } from '@/server/deck/deckService';

export async function GET() {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const decks = await listDecksForUser(auth.userId);
  return NextResponse.json({ decks });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  format: z.nativeEnum(DeckFormat),
});

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const deck = await createDeck(auth.userId, parsed.data.name, parsed.data.format);
  return NextResponse.json({ deck }, { status: 201 });
}
