'use client';

import { CardBack } from '@/components/card/CardBack';

export function LibraryStack({ count, onDraw }: { count: number; onDraw?: () => void }) {
  return (
    <div className="w-20">
      <div
        onClick={onDraw}
        role={onDraw ? 'button' : undefined}
        title={onDraw ? 'Click to draw a card' : undefined}
        className={onDraw ? 'cursor-pointer transition-transform hover:scale-[1.03]' : undefined}
      >
        <CardBack count={count} label="Library" />
      </div>
      {onDraw && <p className="mt-0.5 text-center text-[10px] text-slate-500">Click to draw</p>}
    </div>
  );
}
