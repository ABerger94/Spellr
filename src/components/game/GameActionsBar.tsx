'use client';

import { useRef, useState } from 'react';
import { GameActionsMenu } from './GameActionsMenu';

export function GameActionsBar({
  isMyTurn,
  lookInProgress,
  zoom,
  onZoomIn,
  onZoomOut,
  onUntapAll,
  onDraw,
  onPassTurn,
  onDrawX,
  onScry,
  onSurveil,
  onMill,
  onExileTop,
  onLookAtTop,
  onRandomDiscard,
  onRevealHand,
  onShuffle,
  onMulligan,
  onResetLife,
  onResetDeck,
  voiceJoined,
  voiceMuted,
  voiceConnectedPeerCount,
  voiceConnectingPeerCount,
  voiceMicError,
  voiceSignalingError,
  voiceAudioBlocked,
  onVoiceJoin,
  onVoiceToggleMute,
  onVoiceLeave,
  onVoiceEnableAudio,
}: {
  isMyTurn: boolean;
  lookInProgress: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUntapAll: () => void;
  onDraw: () => void;
  onPassTurn: () => void;
  onDrawX: (count: number) => void;
  onScry: (count: number) => void;
  onSurveil: (count: number) => void;
  onMill: (count: number) => void;
  onExileTop: () => void;
  onLookAtTop: () => void;
  onRandomDiscard: () => void;
  onRevealHand: () => void;
  onShuffle: () => void;
  onMulligan: () => void;
  onResetLife: () => void;
  onResetDeck: () => void;
  voiceJoined: boolean;
  voiceMuted: boolean;
  voiceConnectedPeerCount: number;
  voiceConnectingPeerCount: number;
  voiceMicError: string | null;
  voiceSignalingError: string | null;
  voiceAudioBlocked: boolean;
  onVoiceJoin: () => void;
  onVoiceToggleMute: () => void;
  onVoiceLeave: () => void;
  onVoiceEnableAudio: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);

  function toggleMenu() {
    if (!menuOpen && actionsButtonRef.current) {
      setAnchorRect(actionsButtonRef.current.getBoundingClientRect());
    }
    setMenuOpen((v) => !v);
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 bg-panel px-3 py-2">
      <span className="hidden flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:inline">
        Game actions
      </span>
      <button
        onClick={onUntapAll}
        className="flex-shrink-0 rounded bg-panelLight px-3 py-1.5 text-sm text-white hover:bg-white/10"
      >
        Untap All
      </button>
      <button
        onClick={onDraw}
        className="flex-shrink-0 rounded bg-panelLight px-3 py-1.5 text-sm text-white hover:bg-white/10"
      >
        Draw
      </button>
      <div className="flex-shrink-0">
        <button
          ref={actionsButtonRef}
          onClick={toggleMenu}
          className="rounded bg-panelLight px-3 py-1.5 text-sm text-white hover:bg-white/10"
        >
          Actions ▾
        </button>
        {menuOpen && anchorRect && (
          <GameActionsMenu
            anchorRect={anchorRect}
            onClose={() => setMenuOpen(false)}
            lookInProgress={lookInProgress}
            isMyTurn={isMyTurn}
            onPassTurn={onPassTurn}
            onDrawX={onDrawX}
            onScry={onScry}
            onSurveil={onSurveil}
            onMill={onMill}
            onExileTop={onExileTop}
            onLookAtTop={onLookAtTop}
            onRandomDiscard={onRandomDiscard}
            onRevealHand={onRevealHand}
            onShuffle={onShuffle}
            onMulligan={onMulligan}
            onResetLife={onResetLife}
            onResetDeck={onResetDeck}
            voiceJoined={voiceJoined}
            onVoiceLeave={onVoiceLeave}
          />
        )}
      </div>
      <button
        onClick={voiceJoined ? onVoiceToggleMute : onVoiceJoin}
        title={voiceMicError ?? (voiceJoined ? (voiceMuted ? 'Unmute microphone' : 'Mute microphone') : 'Join voice chat')}
        className={`flex-shrink-0 rounded px-3 py-1.5 text-sm font-medium ${
          voiceJoined
            ? voiceMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            : 'bg-panelLight text-white hover:bg-white/10'
        }`}
      >
        {voiceJoined ? (voiceMuted ? '🔇 Unmute' : `🎤 Mute${voiceConnectedPeerCount > 0 ? ` (${voiceConnectedPeerCount})` : ''}`) : '🎙️ Join Voice'}
      </button>
      {voiceJoined && voiceConnectedPeerCount === 0 && voiceConnectingPeerCount > 0 && (
        <span className="hidden flex-shrink-0 text-xs text-slate-400 sm:inline">Connecting…</span>
      )}
      {voiceMicError && <span className="hidden flex-shrink-0 max-w-[14rem] truncate text-xs text-red-400 sm:inline">{voiceMicError}</span>}
      {voiceSignalingError && (
        <span className="hidden flex-shrink-0 max-w-[16rem] truncate text-xs text-red-400 sm:inline" title={voiceSignalingError}>
          {voiceSignalingError}
        </span>
      )}
      {voiceJoined && voiceAudioBlocked && (
        <button
          onClick={onVoiceEnableAudio}
          title="Your browser blocked autoplay for the other player's audio — tap to allow it"
          className="flex-shrink-0 rounded bg-yellow-500/20 px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-yellow-500/30"
        >
          🔊 Tap to enable audio
        </button>
      )}
      <div className="ml-auto flex flex-shrink-0 items-center gap-1">
        <button
          onClick={onZoomOut}
          title="Zoom out the whole table"
          className="rounded bg-panelLight px-2 py-1.5 text-sm text-white hover:bg-white/10"
        >
          −
        </button>
        <span className="w-10 text-center text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
        <button
          onClick={onZoomIn}
          title="Zoom in the whole table"
          className="rounded bg-panelLight px-2 py-1.5 text-sm text-white hover:bg-white/10"
        >
          +
        </button>
      </div>
    </div>
  );
}
