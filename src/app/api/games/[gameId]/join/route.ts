import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { joinGameById } from '@/server/game/gameService';

/** Joins a game found by browsing the open-lobbies list — no invite code
 * needed, unlike POST /api/games/join. */
export async function POST(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const joined = await joinGameById(params.gameId, auth.userId);
    return NextResponse.json({ game: joined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not join game' }, { status: 400 });
  }
}
