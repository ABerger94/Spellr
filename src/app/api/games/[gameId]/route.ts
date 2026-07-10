import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { getGameForUser } from '@/server/game/gameService';
import { buildStateFor } from '@/server/game/stateSerializer';

export async function GET(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const game = await getGameForUser(params.gameId, auth.userId);
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const viewerSeat = game.players.find((p) => p.userId === auth.userId)?.seat ?? null;
  const state = await buildStateFor(params.gameId, viewerSeat);

  return NextResponse.json({
    game: { id: game.id, hostUserId: game.hostUserId, maxSeats: game.maxSeats, inviteCode: game.inviteCode },
    state,
  });
}
