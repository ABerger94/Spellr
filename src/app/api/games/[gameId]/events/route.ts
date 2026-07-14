import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { getGameForViewer } from '@/server/game/gameService';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const game = await getGameForViewer(params.gameId, auth.userId);
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const viewerSeat = game.players.find((p) => p.userId === auth.userId)?.seat ?? null;

  const events = await prisma.gameEvent.findMany({
    where: {
      gameId: params.gameId,
      OR: [
        { visibleToSeats: { equals: [] } },
        ...(viewerSeat !== null ? [{ visibleToSeats: { has: viewerSeat } }, { actorSeat: viewerSeat }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return NextResponse.json({ events });
}
