'use client';

import { CardBack } from '@/components/card/CardBack';

export function LibraryStack({ count, onDraw }: { count: number; onDraw?: () => void }) {
  return (
    <div className="w-20" onClick={onDraw} role={onDraw ? 'button' : undefined}>
      <CardBack count={count} label="Library" />
    </div>
  );
}
