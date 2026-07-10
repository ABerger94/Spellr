'use client';

const MANA_COLORS: { code: string; label: string; className: string }[] = [
  { code: 'W', label: 'White', className: 'bg-yellow-100 text-black' },
  { code: 'U', label: 'Blue', className: 'bg-blue-500 text-white' },
  { code: 'B', label: 'Black', className: 'bg-neutral-800 text-white' },
  { code: 'R', label: 'Red', className: 'bg-red-600 text-white' },
  { code: 'G', label: 'Green', className: 'bg-green-600 text-white' },
  { code: 'C', label: 'Colorless', className: 'bg-slate-400 text-black' },
];

export function ManaPool({
  pool,
  interactive,
  onAdjust,
  onEmpty,
}: {
  pool: Record<string, number>;
  /** Read-only display (opponents' pools) when false. */
  interactive: boolean;
  onAdjust?: (color: string, delta: number) => void;
  onEmpty?: () => void;
}) {
  const hasAny = Object.values(pool).some((n) => n > 0);
  if (!interactive && !hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {MANA_COLORS.map(({ code, label, className }) => {
        const count = pool[code] ?? 0;
        if (!interactive && count === 0) return null;
        return (
          <div key={code} className="flex items-center overflow-hidden rounded" title={label}>
            <button
              type="button"
              onClick={interactive && onAdjust ? () => onAdjust(code, 1) : undefined}
              disabled={!interactive}
              className={`flex h-6 w-6 items-center justify-center text-[11px] font-bold ${className} ${
                interactive ? 'cursor-pointer hover:opacity-80' : ''
              }`}
            >
              {code}
            </button>
            <span className="flex h-6 w-5 items-center justify-center bg-panelLight text-xs font-medium text-white">
              {count}
            </span>
            {interactive && onAdjust && (
              <button
                type="button"
                onClick={() => onAdjust(code, -1)}
                disabled={count === 0}
                className="flex h-6 w-5 items-center justify-center bg-panelLight text-xs text-white hover:bg-white/10 disabled:opacity-30"
              >
                −
              </button>
            )}
          </div>
        );
      })}
      {interactive && onEmpty && hasAny && (
        <button
          type="button"
          onClick={onEmpty}
          className="ml-1 rounded bg-panelLight px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10"
        >
          Empty
        </button>
      )}
    </div>
  );
}
