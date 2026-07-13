import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GameFormat } from '@prisma/client';
import { requireSession } from '@/server/auth/session';
import { createGame, listGamesForUser } from '@/server/game/gameService';

export async function GET() {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const games = await listGamesForUser(auth.userId);
  return NextResponse.json({ games });
}

const createSchema = z.object({
  format: z.nativeEnum(GameFormat),
  seatCount: z.number().int().min(2).max(4).optional(),
  isPublic: z.boolean().optional(),
  bracket: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  // Deck choice happens afterward in the lobby waiting room, not at
  // creation time — the host joins seat 0 with no deck picked yet.
  const game = await createGame(auth.userId, parsed.data.format, {
    seatCount: parsed.data.seatCount,
    isPublic: parsed.data.isPublic,
    bracket: parsed.data.bracket,
  });
  return NextResponse.json({ game }, { status: 201 });
}
