'use client';

import { computeDeckStats, type DeckStatCard, type ManaColorCode } from '@/lib/deckStats';

// Same WUBRG colors as ManaPool, so a color reads the same way everywhere in the app.
const COLOR_STYLES: Record<ManaColorCode, { label: string; barClassName: string; textClassName: string }> = {
  W: { label: 'White', barClassName: 'bg-yellow-100', textClassName: 'text-yellow-100' },
  U: { label: 'Blue', barClassName: 'bg-blue-500', textClassName: 'text-blue-400' },
  B: { label: 'Black', barClassName: 'bg-neutral-400', textClassName: 'text-neutral-300' },
  R: { label: 'Red', barClassName: 'bg-red-600', textClassName: 'text-red-400' },
  G: { label: 'Green', barClassName: 'bg-green-600', textClassName: 'text-green-400' },
  C: { label: 'Colorless', barClassName: 'bg-slate-400', textClassName: 'text-slate-400' },
};

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-white/10 bg-panelLight px-3 py-2">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Bar({ fraction, className }: { fraction: number; className: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-panelLight">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${Math.max(0, Math.min(100, fraction * 100))}%` }}
      />
    </div>
  );
}

function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export function DeckStatsPanel({ cards, format }: { cards: DeckStatCard[]; format: 'COMMANDER' | 'STANDARD_1V1' }) {
  if (cards.length === 0) {
    return <p className="text-sm text-slate-500">Add some cards to see deck stats.</p>;
  }

  const stats = computeDeckStats(cards);
  const expectedSize = format === 'COMMANDER' ? 100 : 60;
  const maxCurveCount = Math.max(1, ...stats.manaCurve.map((b) => b.count));
  const maxTypeCount = Math.max(1, ...stats.typeBreakdown.map((t) => t.count));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Total cards" value={`${stats.totalCards}`} hint={`of ${expectedSize}`} />
        <StatTile label="Lands" value={`${stats.landCount}`} hint={stats.totalCards > 0 ? `${formatPercent(stats.landCount / stats.totalCards)} of deck` : undefined} />
        <StatTile label="Nonland spells" value={`${stats.nonlandCount}`} />
        <StatTile label="Avg. mana value" value={stats.averageCmc.toFixed(2)} hint="nonland cards" />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">Mana curve</h3>
        <div className="flex items-end gap-2" style={{ height: 96 }}>
          {stats.manaCurve.map((bucket) => (
            <div key={bucket.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs text-slate-400">{bucket.count > 0 ? bucket.count : ''}</span>
              <div
                className="w-full rounded-t bg-accent"
                style={{ height: `${(bucket.count / maxCurveCount) * 72}px`, minHeight: bucket.count > 0 ? 3 : 0 }}
              />
              <span className="text-[11px] text-slate-500">{bucket.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Mana value (converted mana cost) of nonland cards.</p>
      </div>

      {stats.colorStats.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Color balance</h3>
          <div className="space-y-2">
            {stats.colorStats.map(({ color, pips, sources }) => {
              const totalPips = stats.colorStats.reduce((sum, c) => sum + c.pips, 0) || 1;
              const style = COLOR_STYLES[color];
              return (
                <div key={color} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 flex-shrink-0 font-bold ${style.textClassName}`}>{color}</span>
                  <Bar fraction={pips / totalPips} className={style.barClassName} />
                  <span className="w-28 flex-shrink-0 text-right text-slate-400">
                    {pips} pip{pips === 1 ? '' : 's'} · {sources} source{sources === 1 ? '' : 's'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Pips are colored mana symbols in card costs; sources are lands/rocks/dorks whose own text can produce that color
            (read from oracle text — always double-check against your actual mana base).
          </p>
        </div>
      )}

      {stats.typeBreakdown.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Card types</h3>
          <div className="space-y-1.5">
            {stats.typeBreakdown.map(({ type, count }) => (
              <div key={type} className="flex items-center gap-2 text-xs">
                <span className="w-24 flex-shrink-0 text-slate-300">{type}</span>
                <Bar fraction={count / maxTypeCount} className="bg-accent2" />
                <span className="w-6 flex-shrink-0 text-right text-slate-400">{count}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">A card with multiple types (e.g. Artifact Creature) counts in each.</p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">Mana consistency</h3>
        <p className="mb-2 text-[11px] text-slate-500">
          Standard hypergeometric probability (deck size, land/source count, cards drawn) — the same math behind any land-count
          calculator. Not a power score, just the odds of your mana working out.
        </p>
        <div className="space-y-1.5">
          {stats.landProbabilities.map(({ atLeast, probability }) => (
            <div key={atLeast} className="flex items-center gap-2 text-xs">
              <span className="w-40 flex-shrink-0 text-slate-300">≥{atLeast} lands in opening 7</span>
              <Bar fraction={probability} className="bg-accent" />
              <span className="w-10 flex-shrink-0 text-right text-slate-400">{formatPercent(probability)}</span>
            </div>
          ))}
          {stats.colorStats.map(({ color, openingHandProbability, bySecondDrawStepProbability }) => (
            <div key={color} className="flex items-center gap-2 text-xs">
              <span className={`w-40 flex-shrink-0 ${COLOR_STYLES[color].textClassName}`}>
                {COLOR_STYLES[color].label} source by opener / 10 cards
              </span>
              <Bar fraction={bySecondDrawStepProbability} className={COLOR_STYLES[color].barClassName} />
              <span className="w-24 flex-shrink-0 text-right text-slate-400">
                {formatPercent(openingHandProbability)} / {formatPercent(bySecondDrawStepProbability)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
