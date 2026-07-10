import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GameFormat } from '@prisma/client';
import { requireSession } from '@/server/auth/session';
import { createGame, deckFormatFor, listGamesForUser } from '@/server/game/gameService';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const games = await listGamesForUser(auth.userId);
  return NextResponse.json({ games });
}

const createSchema = z.object({
  format: z.nativeEnum(GameFormat),
  deckId: z.string(),
  seatCount: z.number().int().min(2).max(4).optional(),
  fillAI: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const deck = await prisma.deck.findFirst({ where: { id: parsed.data.deckId, userId: auth.userId } });
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  if (deck.format !== deckFormatFor(parsed.data.format)) {
    return NextResponse.json({ error: 'Deck format does not match game format' }, { status: 400 });
  }

  const game = await createGame(auth.userId, parsed.data.format, parsed.data.deckId, {
    seatCount: parsed.data.seatCount,
    fillAI: parsed.data.fillAI,
  });
  return NextResponse.json({ game }, { status: 201 });
}
