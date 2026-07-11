'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LookCountPrompt } from './LookCountPrompt';

type CountPrompt = 'drawX' | 'scry' | 'surveil' | 'mill';

const MENU_WIDTH = 200;
const VIEWPORT_MARGIN = 8;

export function GameActionsMenu({
  anchorRect,
  onClose,
  lookInProgress,
  isMyTurn,
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
  onVoiceLeave,
}: {
  /** Bounding rect of the trigger button, captured at open time — the menu is
   * positioned relative to the viewport (not a DOM ancestor) so it can never
   * be clipped by the scrollable toolbar it's opened from. */
  anchorRect: DOMRect;
  onClose: () => void;
  lookInProgress: boolean;
  isMyTurn: boolean;
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
  onVoiceLeave: () => void;
}) {
  const [countPrompt, setCountPrompt] = useState<CountPrompt | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [onClose]);

  function Row({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
    return (
      <button
        onClick={() => {
          onClick();
          onClose();
        }}
        disabled={disabled}
        className="block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-panelLight disabled:opacity-40"
      >
        {label}
      </button>
    );
  }

  function CountRow({ label, prompt, disabled, onConfirm }: { label: string; prompt: CountPrompt; disabled?: boolean; onConfirm: (count: number) => void }) {
    return (
      <div className="relative">
        <button
          onClick={() => setCountPrompt(prompt)}
          disabled={disabled}
          className="block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-panelLight disabled:opacity-40"
        >
          {label}
        </button>
        {countPrompt === prompt && (
          <LookCountPrompt
            label={label}
            onConfirm={(count) => {
              onConfirm(count);
              onClose();
            }}
            onCancel={() => setCountPrompt(null)}
          />
        )}
      </div>
    );
  }

  if (typeof document === 'undefined') return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = anchorRect.right - MENU_WIDTH;
  left = Math.max(VIEWPORT_MARGIN, left);
  left = Math.min(left, viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN);
  const top = Math.min(anchorRect.bottom + 4, viewportHeight - VIEWPORT_MARGIN);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, width: MENU_WIDTH, maxHeight: `${viewportHeight - top - VIEWPORT_MARGIN}px` }}
      className="z-[200] overflow-y-auto rounded border border-white/10 bg-panel py-1 shadow-2xl"
    >
      <Row label="Pass Turn" onClick={onPassTurn} disabled={!isMyTurn} />
      <div className="my-1 border-t border-white/10" />
      <CountRow label="Draw X" prompt="drawX" onConfirm={onDrawX} />
      <CountRow label="Scry" prompt="scry" disabled={lookInProgress} onConfirm={onScry} />
      <CountRow label="Surveil" prompt="surveil" disabled={lookInProgress} onConfirm={onSurveil} />
      <CountRow label="Mill" prompt="mill" onConfirm={onMill} />
      <Row label="Exile Top" onClick={onExileTop} />
      <Row label="Look at Top" onClick={onLookAtTop} disabled={lookInProgress} />
      <Row label="Random Discard" onClick={onRandomDiscard} />
      <div className="my-1 border-t border-white/10" />
      <Row label="Reveal Hand" onClick={onRevealHand} />
      <div className="my-1 border-t border-white/10" />
      <Row label="Shuffle" onClick={onShuffle} />
      <Row label="Mulligan" onClick={onMulligan} />
      <div className="my-1 border-t border-white/10" />
      <Row label="Reset Life" onClick={onResetLife} />
      <Row label="Reset Deck" onClick={onResetDeck} />
      {voiceJoined && (
        <>
          <div className="my-1 border-t border-white/10" />
          <Row label="Leave Voice Chat" onClick={onVoiceLeave} />
        </>
      )}
    </div>,
    document.body,
  );
}
