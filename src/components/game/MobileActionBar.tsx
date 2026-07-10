'use client';

import { useState } from 'react';
import { LookCountPrompt } from './LookCountPrompt';

export function MobileActionBar({
  isMyTurn,
  lookInProgress,
  onDraw,
  onScry,
  onSurveil,
  onPassTurn,
}: {
  isMyTurn: boolean;
  lookInProgress: boolean;
  onDraw: (count: number) => void;
  onScry: (count: number) => void;
  onSurveil: (count: number) => void;
  onPassTurn: () => void;
}) {
  const [prompt, setPrompt] = useState<'draw' | 'scry' | 'surveil' | null>(null);

  return (
    <div
      className="sticky bottom-0 z-30 flex items-stretch gap-1.5 border-t border-white/10 bg-panel px-2 py-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="relative flex-1">
        <button
          onClick={() => setPrompt('draw')}
          className="w-full rounded bg-panelLight py-3 text-sm font-medium text-white active:bg-white/20"
        >
          Draw
        </button>
        {prompt === 'draw' && (
          <LookCountPrompt
            label="Draw"
            direction="up"
            onConfirm={(count) => {
              onDraw(count);
              setPrompt(null);
            }}
            onCancel={() => setPrompt(null)}
          />
        )}
      </div>

      <div className="relative flex-1">
        <button
          onClick={() => setPrompt('scry')}
          disabled={lookInProgress}
          className="w-full rounded bg-panelLight py-3 text-sm font-medium text-white active:bg-white/20 disabled:opacity-40"
        >
          Scry
        </button>
        {prompt === 'scry' && (
          <LookCountPrompt
            label="Scry"
            direction="up"
            onConfirm={(count) => {
              onScry(count);
              setPrompt(null);
            }}
            onCancel={() => setPrompt(null)}
          />
        )}
      </div>

      <div className="relative flex-1">
        <button
          onClick={() => setPrompt('surveil')}
          disabled={lookInProgress}
          className="w-full rounded bg-panelLight py-3 text-sm font-medium text-white active:bg-white/20 disabled:opacity-40"
        >
          Surveil
        </button>
        {prompt === 'surveil' && (
          <LookCountPrompt
            label="Surveil"
            direction="up"
            onConfirm={(count) => {
              onSurveil(count);
              setPrompt(null);
            }}
            onCancel={() => setPrompt(null)}
          />
        )}
      </div>

      <button
        onClick={onPassTurn}
        disabled={!isMyTurn}
        className="flex-1 rounded bg-accent py-3 text-sm font-medium text-white active:bg-accent/70 disabled:opacity-40"
      >
        Pass turn
      </button>
    </div>
  );
}
