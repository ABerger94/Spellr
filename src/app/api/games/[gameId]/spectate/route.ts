import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { spectateGameById } from '@/server/game/gameService';

/** Starts spectating a game found by browsing the open-games list — no
 * invite code needed, unlike POST /api/games/spectate. Only works for
 * public games; private games require the invite-code route. */
export async function POST(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const game = await spectateGameById(params.gameId, auth.userId);
    return NextResponse.json({ game });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not spectate game' }, { status: 400 });
  }
}
