import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { broadcastVoiceSignal } from '@/server/realtime/pusherServer';

const sdpSchema = z.object({ type: z.string(), sdp: z.string().optional() });
const candidateSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

const voiceSignalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('voice-joined'), target: z.string().optional() }),
  z.object({ type: z.literal('voice-left') }),
  z.object({ type: z.literal('offer'), target: z.string(), sdp: sdpSchema }),
  z.object({ type: z.literal('answer'), target: z.string(), sdp: sdpSchema }),
  z.object({ type: z.literal('ice-candidate'), target: z.string(), candidate: candidateSchema }),
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
    // Same as game-state broadcasts: Pusher being unreachable shouldn't fail
    // the request, it just means peers won't get this particular signal.
    console.error('[broadcastVoiceSignal]', err);
  }
  return NextResponse.json({ ok: true });
}
