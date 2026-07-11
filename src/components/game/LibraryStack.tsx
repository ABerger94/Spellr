'use client';

import { CardBack } from '@/components/card/CardBack';

export function LibraryStack({ count, onDraw, onSearch }: { count: number; onDraw?: () => void; onSearch?: () => void }) {
  return (
    <div className="w-20">
      <div onClick={onDraw} role={onDraw ? 'button' : undefined}>
        <CardBack count={count} label="Library" />
      </div>
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          className="mt-2 w-full rounded bg-slate-700 px-2 py-1 text-[10px] font-medium text-slate-100 hover:bg-slate-600"
        >
          Search
        </button>
      )}
    </div>
  );
}
