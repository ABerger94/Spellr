'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceChannel } from 'pusher-js';
import { getPusherClient } from '@/lib/pusherClient';

type VoiceSignal =
  | { type: 'voice-joined'; from: string; target?: string }
  | { type: 'voice-left'; from: string }
  | { type: 'offer'; from: string; target: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; target: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; from: string; target: string; candidate: RTCIceCandidateInit };

type OutgoingVoiceSignal = VoiceSignal extends infer T ? (T extends { from: string } ? Omit<T, 'from'> : never) : never;

// STUN alone only works when NAT traversal is simple on both sides; a lot of
// real-world networks (symmetric NAT, mobile carriers, corporate wifi) need
// a TURN relay to actually get audio flowing. OpenRelay's public demo TURN
// server has no signup and is widely used for exactly this purpose.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export function useVoiceChat(gameId: string, viewerUserId: string | null) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const [audioBlocked, setAudioBlocked] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const joinedRef = useRef(false);

  const recomputeConnectedCount = useCallback(() => {
    let n = 0;
    peersRef.current.forEach((p) => {
      // iceConnectionState has much more consistent cross-browser support
      // (notably Safari) than the newer connectionState, so treat either as
      // evidence the peer is actually connected.
      if (p.connectionState === 'connected' || ['connected', 'completed'].includes(p.iceConnectionState)) n += 1;
    });
    setConnectedPeerCount(n);
  }, []);

  const sendSignal = useCallback(
    (signal: OutgoingVoiceSignal) => {
      if (!viewerUserId) return;
      fetch(`/api/games/${gameId}/voice-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal),
      }).catch(() => {});
    },
    [gameId, viewerUserId],
  );

  const closePeer = useCallback(
    (remoteUserId: string) => {
      const pc = peersRef.current.get(remoteUserId);
      pc?.close();
      peersRef.current.delete(remoteUserId);
      const audioEl = audioElsRef.current.get(remoteUserId);
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.remove();
        audioElsRef.current.delete(remoteUserId);
      }
      pendingCandidatesRef.current.delete(remoteUserId);
      recomputeConnectedCount();
    },
    [recomputeConnectedCount],
  );

  const getOrCreatePeer = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remoteUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({ type: 'ice-candidate', target: remoteUserId, candidate: e.candidate.toJSON() });
        }
      };
      pc.ontrack = (e) => {
        let audioEl = audioElsRef.current.get(remoteUserId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          // Some browsers are unreliable about playing audio from an element
          // that's never attached to the document, so keep it in the DOM
          // (hidden) rather than relying on the detached Audio() object.
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          audioElsRef.current.set(remoteUserId, audioEl);
        }
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch(() => {
          // Autoplay was blocked (common if the browser doesn't consider the
          // original "Join Voice" click a fresh-enough gesture) — surface it
          // so the UI can offer a button that retries play() from within a
          // real click handler, instead of the user just hearing nothing.
          setAudioBlocked(true);
        });
      };
      pc.onconnectionstatechange = () => {
        recomputeConnectedCount();
        if (['failed', 'closed'].includes(pc.connectionState)) {
          closePeer(remoteUserId);
        }
      };
      pc.oniceconnectionstatechange = () => {
        recomputeConnectedCount();
        if (pc.iceConnectionState === 'failed') {
          // A lone STUN/TURN hiccup shouldn't kill the call — ask the browser
          // to renegotiate ICE before giving up on the connection entirely.
          pc.restartIce();
        }
      };
      peersRef.current.set(remoteUserId, pc);
      return pc;
    },
    [sendSignal, closePeer, recomputeConnectedCount],
  );

  const handleSignal = useCallback(
    async (signal: VoiceSignal) => {
      if (!viewerUserId || signal.from === viewerUserId) return;
      if ('target' in signal && signal.target && signal.target !== viewerUserId) return;

      if (signal.type === 'voice-joined') {
        if (!joinedRef.current) return;
        // A peer's "I'm here" can reach us twice — once as their initial
        // broadcast, once as their reply to our own reply — since neither
        // side knows in advance who else is already listening. Once a peer
        // connection exists for them, negotiation has already started (or
        // finished), so re-running the offer/answer decision here would
        // race a second createOffer() against the first and break the
        // handshake.
        if (peersRef.current.has(signal.from)) return;
        // Reply directly to a broadcast announce so a peer who joined before
        // us also learns we're here, without a central "who's in the call"
        // registry.
        if (!signal.target) sendSignal({ type: 'voice-joined', target: signal.from });
        if (viewerUserId < signal.from) {
          const pc = getOrCreatePeer(signal.from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({ type: 'offer', target: signal.from, sdp: offer });
        } else {
          getOrCreatePeer(signal.from);
        }
        return;
      }
      if (signal.type === 'voice-left') {
        closePeer(signal.from);
        return;
      }
      if (signal.type === 'offer') {
        const pc = getOrCreatePeer(signal.from);
        await pc.setRemoteDescription(signal.sdp);
        const queued = pendingCandidatesRef.current.get(signal.from) ?? [];
        for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
        pendingCandidatesRef.current.delete(signal.from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', target: signal.from, sdp: answer });
        return;
      }
      if (signal.type === 'answer') {
        const pc = peersRef.current.get(signal.from);
        if (pc) await pc.setRemoteDescription(signal.sdp);
        return;
      }
      if (signal.type === 'ice-candidate') {
        const pc = peersRef.current.get(signal.from);
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(signal.candidate).catch(() => {});
        } else {
          const arr = pendingCandidatesRef.current.get(signal.from) ?? [];
          arr.push(signal.candidate);
          pendingCandidatesRef.current.set(signal.from, arr);
        }
      }
    },
    [viewerUserId, sendSignal, getOrCreatePeer, closePeer],
  );

  useEffect(() => {
    if (!viewerUserId) return;
    let pusher: ReturnType<typeof getPusherClient>;
    try {
      pusher = getPusherClient();
    } catch {
      return;
    }
    const channel = pusher.subscribe(`presence-game-${gameId}`) as PresenceChannel;
    const handler = (data: VoiceSignal) => {
      handleSignal(data).catch(() => {});
    };
    channel.bind('voice:signal', handler);
    return () => {
      channel.unbind('voice:signal', handler);
    };
  }, [gameId, viewerUserId, handleSignal]);

  const join = useCallback(async () => {
    if (joinedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setMicError(null);
      joinedRef.current = true;
      setJoined(true);
      setMuted(false);
      sendSignal({ type: 'voice-joined' });
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Microphone permission was denied');
    }
  }, [sendSignal]);

  const leave = useCallback(() => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    setJoined(false);
    setMuted(false);
    sendSignal({ type: 'voice-left' });
    [...peersRef.current.keys()].forEach(closePeer);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setConnectedPeerCount(0);
    setAudioBlocked(false);
  }, [sendSignal, closePeer]);

  // Retries play() on every remote peer's audio element from within a real
  // click handler, which satisfies browsers that blocked the original
  // autoplay attempt (it didn't happen inside a direct user-gesture chain).
  const enableAudio = useCallback(() => {
    let stillBlocked = false;
    audioElsRef.current.forEach((audioEl) => {
      audioEl.play().catch(() => {
        stillBlocked = true;
      });
    });
    setAudioBlocked(stillBlocked);
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    setMuted((prev) => {
      const next = !prev;
      localStreamRef.current!.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  // Leave on unmount (e.g. navigating away from the game) so peers aren't
  // left hanging with a dead connection.
  useEffect(() => {
    return () => {
      if (!joinedRef.current) return;
      joinedRef.current = false;
      sendSignal({ type: 'voice-left' });
      peersRef.current.forEach((pc) => pc.close());
      audioElsRef.current.forEach((audioEl) => {
        audioEl.srcObject = null;
        audioEl.remove();
      });
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { joined, muted, connectedPeerCount, micError, audioBlocked, join, leave, toggleMute, enableAudio };
}
