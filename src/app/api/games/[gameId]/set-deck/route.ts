import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { setPlayerDeck } from '@/server/game/gameService';

const setDeckSchema = z.object({ deckId: z.string() });

/** Picks (or changes) the calling player's own deck while still in the
 * lobby waiting room — deck choice happens here, not at join time. */
export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = setDeckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  try {
    await setPlayerDeck(params.gameId, auth.userId, parsed.data.deckId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not set deck' }, { status: 400 });
  }
}
