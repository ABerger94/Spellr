'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerStateView } from '@/types/game';

const COMMANDER_DAMAGE_LETHAL = 21;
const POISON_LETHAL = 10;
const MENU_WIDTH = 240;
const VIEWPORT_MARGIN = 8;

// The standard player-level counter types every Commander table tracks —
// shown as always-present quick rows; anything else goes through the
// free-form "other counter" input below them.
const QUICK_PLAYER_COUNTERS: { type: string; label: string; icon: string }[] = [
  { type: 'poison', label: 'Poison', icon: '☠️' },
  { type: 'energy', label: 'Energy', icon: '⚡' },
  { type: 'experience', label: 'Experience', icon: '🕐' },
  { type: 'rad', label: 'Rad', icon: '☢️' },
];

function StatRow({
  label,
  value,
  danger,
  onAdjust,
}: {
  label: string;
  value: number;
  danger: boolean;
  onAdjust?: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className={`truncate text-sm ${danger ? 'text-red-400' : 'text-slate-200'}`}>{label}</span>
      <div className="flex flex-shrink-0 items-center gap-2">
        {onAdjust && (
          <button
            type="button"
            onClick={() => onAdjust(-1)}
            className="h-6 w-6 rounded bg-panelLight text-xs text-red-400 hover:bg-white/10"
          >
            −
          </button>
        )}
        <span className={`w-5 text-center text-sm font-semibold ${danger ? 'text-red-400' : 'text-white'}`}>{value}</span>
        {onAdjust && (
          <button
            type="button"
            onClick={() => onAdjust(1)}
            className="h-6 w-6 rounded bg-panelLight text-xs text-emerald-400 hover:bg-white/10"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

/** Commander damage + poison + any other player-level counters (experience,
 * energy, custom, ...), tucked behind a dropdown off the life total instead
 * of a permanently-visible row — reclaims header space for the board. */
function StatsMenu({
  anchorRect,
  onClose,
  player,
  commanderDamageFrom,
  onCommanderDamageChange,
  onCounterChange,
}: {
  anchorRect: DOMRect;
  onClose: () => void;
  player: PlayerStateView;
  commanderDamageFrom?: { seat: number; name: string }[];
  onCommanderDamageChange?: (fromSeat: number, delta: number) => void;
  onCounterChange?: (counterType: string, delta: number) => void;
}) {
  const [customType, setCustomType] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const left = Math.min(Math.max(VIEWPORT_MARGIN, anchorRect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - VIEWPORT_MARGIN);

  const quickTypes = QUICK_PLAYER_COUNTERS.map((c) => c.type);
  const otherCounterTypes = Object.keys(player.counters).filter((t) => !quickTypes.includes(t) && player.counters[t] > 0);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[199]" onClick={onClose} />
      <div
        ref={ref}
        style={{ position: 'fixed', top, left, width: MENU_WIDTH }}
        className="z-[200] max-h-[70vh] overflow-y-auto rounded-lg border border-white/10 bg-panel p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {commanderDamageFrom && commanderDamageFrom.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Commander damage taken</p>
            <div className="divide-y divide-white/5">
              {commanderDamageFrom.map(({ seat, name }) => {
                const dmg = player.commanderDamage[String(seat)] ?? 0;
                return (
                  <StatRow
                    key={seat}
                    label={name}
                    value={dmg}
                    danger={dmg >= COMMANDER_DAMAGE_LETHAL}
                    onAdjust={onCommanderDamageChange ? (delta) => onCommanderDamageChange(seat, delta) : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Counters</p>
          <div className="divide-y divide-white/5">
            {QUICK_PLAYER_COUNTERS.map(({ type, label, icon }) => {
              const value = player.counters[type] ?? 0;
              return (
                <StatRow
                  key={type}
                  label={`${icon} ${label}`}
                  value={value}
                  danger={type === 'poison' && value >= POISON_LETHAL}
                  onAdjust={onCounterChange ? (delta) => onCounterChange(type, delta) : undefined}
                />
              );
            })}
            {otherCounterTypes.map((type) => (
              <StatRow
                key={type}
                label={type}
                value={player.counters[type]}
                danger={false}
                onAdjust={onCounterChange ? (delta) => onCounterChange(type, delta) : undefined}
              />
            ))}
          </div>
        </div>

        {onCounterChange && (
          <div className="flex gap-1.5 border-t border-white/10 pt-2">
            <input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customType.trim()) {
                  onCounterChange(customType.trim(), 1);
                  setCustomType('');
                }
              }}
              placeholder="Other counter (e.g. energy)"
              maxLength={20}
              className="min-w-0 flex-1 rounded border border-white/10 bg-panelLight px-2 py-1 text-xs text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => {
                if (customType.trim()) {
                  onCounterChange(customType.trim(), 1);
                  setCustomType('');
                }
              }}
              className="flex-shrink-0 rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/80"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

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
  onCounterChange,
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
  /** Poison and any other player-level counter (experience, energy, custom). */
  onCounterChange?: (counterType: string, delta: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const poison = player.counters.poison ?? 0;
  const hasDanger =
    poison >= POISON_LETHAL ||
    Object.values(player.commanderDamage).some((dmg) => dmg >= COMMANDER_DAMAGE_LETHAL);

  function openMenu() {
    if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
    setMenuOpen(true);
  }

  return (
    <div className={`inline-block rounded-lg border ${isActiveTurn ? 'border-accent2 bg-accent2/10' : 'border-white/10 bg-panel'}`}>
      <div className={`flex flex-col ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
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
        <div className="mt-0.5 flex items-center gap-1">
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
          <button
            ref={btnRef}
            type="button"
            onClick={openMenu}
            title="Commander damage, poison, and other counters"
            className={`relative ml-0.5 rounded bg-panelLight text-slate-300 hover:bg-white/10 ${compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs'}`}
          >
            ▾
            {hasDanger && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
          </button>
        </div>
      </div>
      {menuOpen && anchorRect && (
        <StatsMenu
          anchorRect={anchorRect}
          onClose={() => setMenuOpen(false)}
          player={player}
          commanderDamageFrom={commanderDamageFrom}
          onCommanderDamageChange={onCommanderDamageChange}
          onCounterChange={onCounterChange}
        />
      )}
    </div>
  );
}
