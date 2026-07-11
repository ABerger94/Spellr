import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { listOpenPublicGames } from '@/server/game/gameService';

export async function GET() {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const games = await listOpenPublicGames(auth.userId);
  return NextResponse.json({ games });
}
