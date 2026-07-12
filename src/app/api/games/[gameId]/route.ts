import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { cancelGame, getGameForUser } from '@/server/game/gameService';
import { buildStateFor } from '@/server/game/stateSerializer';

export async function GET(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const game = await getGameForUser(params.gameId, auth.userId);
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const viewerSeat = game.players.find((p) => p.userId === auth.userId)?.seat ?? null;
  const state = await buildStateFor(params.gameId, viewerSeat);

  return NextResponse.json({
    game: {
      id: game.id,
      hostUserId: game.hostUserId,
      maxSeats: game.maxSeats,
      inviteCode: game.inviteCode,
      bracket: game.bracket,
    },
    state,
  });
}

/** Host-only: cancels a game that hasn't started yet. */
export async function DELETE(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await cancelGame(params.gameId, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not cancel game' }, { status: 400 });
  }
}
