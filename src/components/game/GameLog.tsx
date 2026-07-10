'use client';

import { useEffect, useRef } from 'react';
import type { GameLogEntry } from '@/hooks/useGameState';

const AI_EVENT_TYPES = new Set(['AI_REASONING', 'AI_SKIPPED_NO_KEY', 'AI_ERROR', 'AI_TURN_CAPPED']);

function describeEvent(event: GameLogEntry, displayName: (seat: number | null) => string): string {
  const who = displayName(event.actorSeat);
  switch (event.type) {
    case 'GAME_STARTED':
      return 'The game has started.';
    case 'DRAW_CARD':
      return `${who} drew a card.`;
    case 'PLAY_CARD':
      return `${who} played a card.`;
    case 'TAP_CARD':
      return `${who} tapped a card.`;
    case 'UNTAP_CARD':
      return `${who} untapped a card.`;
    case 'MOVE_CARD':
      return `${who} moved a card from ${event.payload.fromZone} to ${event.payload.toZone}.`;
    case 'ADJUST_LIFE': {
      const delta = event.payload.delta as number;
      return `${who}'s life changed by ${delta > 0 ? '+' : ''}${delta}.`;
    }
    case 'TURN_PASSED':
      return `${who} passed the turn.`;
    case 'ATTACK_DECLARED':
      return `${who} declares an attack.`;
    case 'AI_REASONING':
      return `${who} (thinking): ${event.payload.text ?? ''}`;
    case 'AI_SKIPPED_NO_KEY':
      return `${who} has no AI key configured and will not act.`;
    case 'AI_ERROR':
      return `${who} hit an error and passed the turn.`;
    case 'AI_TURN_CAPPED':
      return `${who} reached the action limit for this turn.`;
    default:
      return `${who}: ${event.type}`;
  }
}

export function GameLog({
  events,
  displayName,
}: {
  events: GameLogEntry[];
  displayName: (seat: number | null) => string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-lg border border-white/10 bg-panel p-3 text-sm">
      {events.length === 0 && <p className="text-slate-500">No events yet.</p>}
      {events.map((event) => (
        <p
          key={event.id}
          className={AI_EVENT_TYPES.has(event.type) ? 'italic text-accent2' : 'text-slate-300'}
        >
          {describeEvent(event, displayName)}
        </p>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
