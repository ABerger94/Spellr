import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { joinGame } from '@/server/game/gameService';
import { prisma } from '@/lib/prisma';

const joinSchema = z.object({
  inviteCode: z.string().min(1),
  deckId: z.string(),
});

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const deck = await prisma.deck.findFirst({ where: { id: parsed.data.deckId, userId: auth.userId } });
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  try {
    const game = await joinGame(parsed.data.inviteCode, auth.userId, parsed.data.deckId);
    return NextResponse.json({ game });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not join game' }, { status: 400 });
  }
}
