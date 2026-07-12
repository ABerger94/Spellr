'use client';

import type { PlayerStateView } from '@/types/game';

export function PlayerPanel({
  player,
  isViewer,
  isActiveTurn,
  isOnline,
  aiKeyMissing,
  onLifeChange,
  compact,
  commanderDamageFrom,
  onCommanderDamageChange,
}: {
  player: PlayerStateView;
  isViewer: boolean;
  isActiveTurn: boolean;
  isOnline: boolean;
  /** True when this is an AI seat but the server has no GEMINI_API_KEY configured. */
  aiKeyMissing?: boolean;
  onLifeChange?: (delta: number) => void;
  /** Tighter padding/type scale for the quadrant layout. */
  compact?: boolean;
  /** Every other seat in the game, for a "commander damage taken" breakdown
   * — omit (or pass an empty array) outside Commander games. */
  commanderDamageFrom?: { seat: number; name: string }[];
  onCommanderDamageChange?: (fromSeat: number, delta: number) => void;
}) {
  return (
    <div
      className={`rounded-lg border ${isActiveTurn ? 'border-accent2 bg-accent2/10' : 'border-white/10 bg-panel'}`}
    >
      <div className={`flex items-center justify-between ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <div className="min-w-0">
          <p className={`truncate font-medium text-white ${compact ? 'text-xs' : 'text-sm'}`}>
            {player.displayName}
            {isViewer && <span className="ml-1 text-xs text-accent2">(you)</span>}
            {player.isAI && <span className="ml-1 rounded bg-panelLight px-1 text-[10px] text-slate-400">AI</span>}
            {player.isAI && aiKeyMissing && (
              <span
                className="ml-1 whitespace-nowrap rounded bg-amber-500/20 px-1 text-[10px] text-amber-400"
                title="No GEMINI_API_KEY or GROQ_API_KEY is configured on the server, so this seat will just pass its turn instead of playing."
              >
                no AI key
              </span>
            )}
          </p>
          {!compact && (
            <p className="text-xs text-slate-500">
              Seat {player.seat} · {isOnline ? 'connected' : 'offline'}
              {isActiveTurn && <span className="ml-1 text-accent2">· their turn</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onLifeChange && (
            <button
              onClick={() => onLifeChange(-1)}
              className={`rounded bg-panelLight text-red-400 hover:bg-white/10 ${compact ? 'h-5 w-5 text-xs' : 'h-6 w-6 text-sm'}`}
            >
              −
            </button>
          )}
          <span className={`text-center font-semibold text-white ${compact ? 'w-7 text-sm' : 'w-10 text-lg'}`}>{player.life}</span>
          {onLifeChange && (
            <button
              onClick={() => onLifeChange(1)}
              className={`rounded bg-panelLight text-emerald-400 hover:bg-white/10 ${compact ? 'h-5 w-5 text-xs' : 'h-6 w-6 text-sm'}`}
            >
              +
            </button>
          )}
        </div>
      </div>
      {commanderDamageFrom && commanderDamageFrom.length > 0 && (
        <div className={`flex flex-wrap gap-1 border-t border-white/5 px-3 pb-1.5 pt-1.5`}>
          {commanderDamageFrom.map(({ seat, name }) => {
            const dmg = player.commanderDamage[String(seat)] ?? 0;
            return (
              <div
                key={seat}
                className={`flex items-center gap-1 rounded bg-panelLight px-1.5 ${compact ? 'text-[10px]' : 'text-xs'} ${dmg >= 21 ? 'text-red-400' : 'text-slate-400'}`}
                title={`Commander damage taken from ${name}`}
              >
                {onCommanderDamageChange && (
                  <button
                    onClick={() => onCommanderDamageChange(seat, -1)}
                    className="text-red-400 hover:text-red-300"
                  >
                    −
                  </button>
                )}
                <span className="max-w-[6rem] truncate">{name}</span>
                <span className="font-semibold">{dmg}</span>
                {onCommanderDamageChange && (
                  <button
                    onClick={() => onCommanderDamageChange(seat, 1)}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
