import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { broadcastVoiceSignal } from '@/server/realtime/pusherServer';

// sdp carries every ICE candidate already embedded in it (see useVoiceChat's
// waitForIceGatheringComplete) rather than trickling candidates as their own
// signals, so there's no separate 'ice-candidate' signal type to validate.
const sdpSchema = z.object({ type: z.string(), sdp: z.string().optional() });

const voiceSignalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('voice-joined'), target: z.string().optional() }),
  z.object({ type: z.literal('voice-left') }),
  z.object({ type: z.literal('offer'), target: z.string(), sdp: sdpSchema }),
  z.object({ type: z.literal('answer'), target: z.string(), sdp: sdpSchema }),
]);

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const player = await prisma.gamePlayer.findFirst({ where: { gameId: params.gameId, userId: auth.userId } });
  if (!player) return NextResponse.json({ error: 'You are not a player in this game' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = voiceSignalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid signal' }, { status: 400 });
  }

  try {
    // `from` is stamped from the authenticated session, never trusted from
    // the client, so a signal can't be spoofed as coming from someone else.
    await broadcastVoiceSignal(params.gameId, { ...parsed.data, from: auth.userId });
  } catch (err) {
    // Unlike game-state broadcasts, a lost voice signal has no persistence
    // or polling fallback to recover it — the offer/answer/candidate is just
    // gone. Surface the failure instead of swallowing it, so the client can
    // at least tell the player their voice connection attempt failed rather
    // than silently never connecting.
    console.error('[broadcastVoiceSignal]', err);
    // Pusher's SDK throws a RequestError carrying the *actual* rejection
    // reason (rate limit, payload-too-large, auth, ...) in message/status/
    // body — surface that instead of a generic label, since a blanket 502
    // told us nothing about which of those it actually was.
    const pusherErr = err as { message?: string; status?: number; body?: string } | undefined;
    return NextResponse.json(
      {
        error: 'Failed to relay voice signal',
        detail: pusherErr?.message ?? String(err),
        pusherStatus: pusherErr?.status ?? null,
        pusherBody: pusherErr?.body ?? null,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
