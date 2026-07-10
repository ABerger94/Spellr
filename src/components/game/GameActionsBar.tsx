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
      <button
        onClick={onPassTurn}
        disabled={!isMyTurn}
        className="flex-shrink-0 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-40"
      >
        Pass
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
          />
        )}
      </div>
      <div className="ml-auto flex flex-shrink-0 items-center gap-1">
        <button
          onClick={onZoomOut}
          title="Zoom out battlefield"
          className="rounded bg-panelLight px-2 py-1.5 text-sm text-white hover:bg-white/10"
        >
          −
        </button>
        <span className="w-10 text-center text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
        <button
          onClick={onZoomIn}
          title="Zoom in battlefield"
          className="rounded bg-panelLight px-2 py-1.5 text-sm text-white hover:bg-white/10"
        >
          +
        </button>
      </div>
    </div>
  );
}
