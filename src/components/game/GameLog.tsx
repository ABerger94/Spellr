'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@/hooks/useGameState';

const AI_EVENT_TYPES = new Set(['AI_REASONING', 'AI_SKIPPED_NO_KEY', 'AI_ERROR', 'AI_TURN_CAPPED']);

const MANA_COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
};

function describeEvent(event: GameLogEntry, displayName: (seat: number | null) => string): string {
  const who = displayName(event.actorSeat);
  switch (event.type) {
    case 'GAME_STARTED':
      return 'The game has started.';
    case 'DRAW_CARD': {
      const count = (event.payload.count as number) ?? 1;
      return count > 1 ? `${who} drew ${count} cards.` : `${who} drew a card.`;
    }
    case 'PLAY_CARD':
      return `${who} played a card.`;
    case 'TAP_CARD':
      return `${who} tapped a card.`;
    case 'UNTAP_CARD':
      return `${who} untapped a card.`;
    case 'MOVE_CARD':
      if (event.payload.fromZone === event.payload.toZone) {
        return `${who} repositioned a card on the battlefield.`;
      }
      return `${who} moved a card from ${event.payload.fromZone} to ${event.payload.toZone}.`;
    case 'SCRY':
      return `${who} scries ${event.payload.count}.`;
    case 'SURVEIL':
      return `${who} surveils ${event.payload.count}.`;
    case 'LOOK_RESOLVED': {
      const dest = event.payload.destination as string;
      const destLabel = dest === 'top' ? 'kept it on top' : dest === 'bottom' ? 'put it on the bottom' : 'put it in the graveyard';
      return `${who} ${destLabel} of their library.`;
    }
    case 'ADJUST_LIFE': {
      const delta = event.payload.delta as number;
      return `${who}'s life changed by ${delta > 0 ? '+' : ''}${delta}.`;
    }
    case 'TURN_PASSED':
      return `${who} passed the turn.`;
    case 'SHUFFLE_LIBRARY':
      return `${who} shuffled their library.`;
    case 'UNTAP_ALL':
      return `${who} untapped all their permanents.`;
    case 'RESET_LIFE':
      return `${who} reset their life to ${event.payload.life}.`;
    case 'RESET_BOARD':
      return `${who} reset their board.`;
    case 'RESTART_GAME':
      return `The game was restarted.`;
    case 'MILL': {
      const count = (event.payload.count as number) ?? 1;
      return count > 1 ? `${who} milled ${count} cards.` : `${who} milled a card.`;
    }
    case 'RANDOM_DISCARD':
      return `${who} randomly discarded a card.`;
    case 'REVEAL_HAND': {
      const names = (event.payload.cardNames as string[]) ?? [];
      return names.length > 0 ? `${who} revealed their hand: ${names.join(', ')}.` : `${who} revealed an empty hand.`;
    }
    case 'MULLIGAN':
      return `${who} took a mulligan.`;
    case 'ROLL_DICE':
      return `${who} rolled a d${event.payload.sides}: ${event.payload.result}.`;
    case 'FLIP_COIN':
      return `${who} flipped a coin: ${event.payload.result}.`;
    case 'ADJUST_COUNTER': {
      const counterType = event.payload.counterType as string;
      const delta = event.payload.delta as number;
      const verb = delta > 0 ? 'added' : 'removed';
      const count = Math.abs(delta);
      return `${who} ${verb} ${count} ${counterType} counter${count === 1 ? '' : 's'}.`;
    }
    case 'ADJUST_MANA': {
      const color = event.payload.color as string;
      const delta = event.payload.delta as number;
      const verb = delta > 0 ? 'floated' : 'spent';
      const count = Math.abs(delta);
      return `${who} ${verb} ${count} ${MANA_COLOR_NAMES[color] ?? color} mana.`;
    }
    case 'EMPTY_MANA_POOL':
      return `${who} emptied their mana pool.`;
    case 'GAME_ENDED':
      return `${who} ended the game.`;
    case 'ATTACK_DECLARED':
      return `${who} declares an attack.`;
    case 'AI_REASONING':
      return `${who} (thinking): ${event.payload.text ?? ''}`;
    case 'AI_SKIPPED_NO_KEY':
      return `${who} has no AI key configured and will not act.`;
    case 'AI_ERROR': {
      const rawMessage = event.payload.message as string | undefined;
      const message = rawMessage && rawMessage.length > 300 ? `${rawMessage.slice(0, 300)}…` : rawMessage;
      return message ? `${who} hit an error and passed the turn: ${message}` : `${who} hit an error and passed the turn.`;
    }
    case 'AI_TURN_CAPPED':
      return `${who} reached the action limit for this turn.`;
    default:
      return `${who}: ${event.type}`;
  }
}

export function GameLog({
  events,
  displayName,
  onClose,
  onSendChat,
}: {
  events: GameLogEntry[];
  displayName: (seat: number | null) => string;
  /** Renders a "✕" header button to collapse/hide the log, when provided. */
  onClose?: () => void;
  /** Renders a chat input pinned under the log, when provided. */
  onSendChat?: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [chatText, setChatText] = useState('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  function handleSend() {
    const text = chatText.trim();
    if (!text || !onSendChat) return;
    onSendChat(text);
    setChatText('');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/10 bg-panel text-sm">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Action log</span>
        {onClose && (
          <button onClick={onClose} title="Hide log" className="text-slate-400 hover:text-white">
            ✕
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {events.length === 0 && <p className="text-slate-500">No events yet.</p>}
        {events.map((event) =>
          event.type === 'CHAT_MESSAGE' ? (
            <p key={event.id} className="text-white">
              <strong className="text-accent2">{displayName(event.actorSeat)}:</strong>{' '}
              {(event.payload.text as string) ?? ''}
            </p>
          ) : (
            <p
              key={event.id}
              className={AI_EVENT_TYPES.has(event.type) ? 'italic text-accent2' : 'text-slate-300'}
            >
              {describeEvent(event, displayName)}
            </p>
          ),
        )}
        <div ref={bottomRef} />
      </div>
      {onSendChat && (
        <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-white/10 p-2">
          <input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Say something…"
            maxLength={500}
            className="flex-1 rounded border border-white/10 bg-panelLight px-2 py-1 text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={handleSend}
            disabled={!chatText.trim()}
            className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
