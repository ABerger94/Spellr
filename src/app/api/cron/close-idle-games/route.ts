import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { closeIdleGames } from '@/server/game/gameService';

/** Vercel Cron target (see vercel.json) — sweeps for games nobody has
 * touched in an hour and closes them (LOBBY games are deleted like a host
 * cancelling; ACTIVE games are marked FINISHED like a host ending one).
 * Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on
 * cron-triggered requests once that env var is set on the project; without
 * it configured, this route always rejects rather than running open. */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const authHeader = req.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await closeIdleGames();
  return NextResponse.json({ ok: true, ...result });
}
