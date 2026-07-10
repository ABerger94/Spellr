'use client';

import type { PlayerStateView } from '@/types/game';

export function PlayerPanel({
  player,
  isViewer,
  isActiveTurn,
  isOnline,
  aiKeyMissing,
  onLifeChange,
}: {
  player: PlayerStateView;
  isViewer: boolean;
  isActiveTurn: boolean;
  isOnline: boolean;
  /** True when this is an AI seat but the server has no GEMINI_API_KEY configured. */
  aiKeyMissing?: boolean;
  onLifeChange?: (delta: number) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
        isActiveTurn ? 'border-accent2 bg-accent2/10' : 'border-white/10 bg-panel'
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">
          {player.displayName}
          {isViewer && <span className="ml-1 text-xs text-accent2">(you)</span>}
          {player.isAI && <span className="ml-1 rounded bg-panelLight px-1 text-[10px] text-slate-400">AI</span>}
          {player.isAI && aiKeyMissing && (
            <span
              className="ml-1 whitespace-nowrap rounded bg-amber-500/20 px-1 text-[10px] text-amber-400"
              title="GEMINI_API_KEY isn't configured on the server, so this seat will just pass its turn instead of playing."
            >
              no AI key
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          Seat {player.seat} · {isOnline ? 'connected' : 'offline'}
          {isActiveTurn && <span className="ml-1 text-accent2">· their turn</span>}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {onLifeChange && (
          <button
            onClick={() => onLifeChange(-1)}
            className="h-6 w-6 rounded bg-panelLight text-sm text-red-400 hover:bg-white/10"
          >
            −
          </button>
        )}
        <span className="w-10 text-center text-lg font-semibold text-white">{player.life}</span>
        {onLifeChange && (
          <button
            onClick={() => onLifeChange(1)}
            className="h-6 w-6 rounded bg-panelLight text-sm text-emerald-400 hover:bg-white/10"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
