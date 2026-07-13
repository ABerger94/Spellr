'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@/hooks/useGameState';

const AI_EVENT_TYPES = new Set(['AI_REASONING', 'AI_SKIPPED_NO_KEY', 'AI_ERROR', 'AI_TURN_CAPPED', 'AI_PROVIDER_FAILED']);

// Color-codes the log by category rather than exact event type, so the
// handful of colors stay meaningful instead of turning into visual noise —
// routine/system events (turn passed, shuffle, restart, ...) stay neutral
// gray and only these four categories stand out.
const SEARCH_EVENT_TYPES = new Set([
  'SEARCH_LIBRARY',
  'SCRY',
  'SURVEIL',
  'REORDER_TOP',
  'CONFIRM_REORDER',
  'LOOK_RESOLVED',
  'REVEAL_HAND',
]);
const MOVE_EVENT_TYPES = new Set([
  'PLAY_CARD',
  'MOVE_CARD',
  'DRAW_CARD',
  'MILL',
  'RANDOM_DISCARD',
  'CREATE_TOKEN',
  'REMOVE_TOKEN',
  'FLIP_CARD',
  'ATTACH_CARD',
  'SET_ANNOTATION',
  'GIVE_CARD',
]);
const TAP_EVENT_TYPES = new Set(['TAP_CARD', 'UNTAP_CARD', 'UNTAP_ALL', 'SET_GROUP_TAPPED']);
const LIFE_EVENT_TYPES = new Set([
  'ADJUST_LIFE',
  'ADJUST_COMMANDER_DAMAGE',
  'ADJUST_PLAYER_COUNTER',
  'ADJUST_COUNTER',
  'ADJUST_MANA',
  'EMPTY_MANA_POOL',
  'ELIMINATE_PLAYER',
]);
const ATTACK_EVENT_TYPES = new Set(['DECLARE_ATTACK', 'CANCEL_ATTACK']);
const BLOCK_EVENT_TYPES = new Set(['DECLARE_BLOCK', 'CANCEL_BLOCK']);

function eventColorClass(type: string): string {
  if (SEARCH_EVENT_TYPES.has(type)) return 'text-violet-400';
  if (MOVE_EVENT_TYPES.has(type)) return 'text-sky-400';
  if (TAP_EVENT_TYPES.has(type)) return 'text-amber-400';
  if (LIFE_EVENT_TYPES.has(type)) return 'text-emerald-400';
  if (ATTACK_EVENT_TYPES.has(type)) return 'text-red-400';
  if (BLOCK_EVENT_TYPES.has(type)) return 'text-blue-400';
  return 'text-slate-300';
}

const MANA_COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless',
};

const AI_PROVIDER_LABELS: Record<string, string> = { gemini: 'Gemini', groq: 'Groq', cerebras: 'Cerebras', openrouter: 'OpenRouter', base44: 'Base44' };

const ZONE_LABELS: Record<string, string> = {
  library: 'library',
  hand: 'hand',
  battlefield: 'battlefield',
  graveyard: 'graveyard',
  exile: 'exile',
  commandZone: 'command zone',
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

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
    case 'SET_GROUP_TAPPED': {
      const count = ((event.payload.instanceIds as string[]) ?? []).length;
      const tapped = event.payload.tapped as boolean;
      return `${who} ${tapped ? 'tapped' : 'untapped'} ${count} card${count === 1 ? '' : 's'} at once.`;
    }
    case 'MOVE_CARD': {
      const fromZone = event.payload.fromZone as string;
      const toZone = event.payload.toZone as string;
      if (fromZone === toZone) {
        if (fromZone === 'battlefield') return `${who} repositioned a card on the battlefield.`;
        if (fromZone === 'library') {
          const position = event.payload.position as string | undefined;
          return `${who} moved a card to the ${position === 'bottom' ? 'bottom' : 'top'} of their library.`;
        }
        return `${who} repositioned a card in their ${ZONE_LABELS[fromZone] ?? fromZone}.`;
      }
      return `${who} moved a card from ${ZONE_LABELS[fromZone] ?? fromZone} to ${ZONE_LABELS[toZone] ?? toZone}.`;
    }
    case 'SCRY':
      return `${who} scries ${event.payload.count}.`;
    case 'SURVEIL':
      return `${who} surveils ${event.payload.count}.`;
    case 'REORDER_TOP': {
      const count = event.payload.count as number;
      return `${who} looked at the top ${count} card${count === 1 ? '' : 's'} of their library to reorder ${count === 1 ? 'it' : 'them'}.`;
    }
    case 'CONFIRM_REORDER': {
      const count = event.payload.count as number;
      return `${who} put the top ${count} card${count === 1 ? '' : 's'} of their library back in a new order.`;
    }
    case 'LOOK_RESOLVED': {
      const dest = event.payload.destination as string;
      const destLabel = dest === 'top' ? 'kept it on top' : dest === 'bottom' ? 'put it on the bottom' : 'put it in the graveyard';
      return `${who} ${destLabel} of their library.`;
    }
    case 'ADJUST_LIFE': {
      const delta = event.payload.delta as number;
      return `${who}'s life changed by ${delta > 0 ? '+' : ''}${delta}.`;
    }
    case 'ADJUST_COMMANDER_DAMAGE': {
      const targetWho = displayName(event.payload.seat as number);
      const fromWho = displayName(event.payload.fromSeat as number);
      const delta = event.payload.delta as number;
      const total = event.payload.total as number;
      return `${who} set commander damage on ${targetWho} from ${fromWho} to ${total} (${delta > 0 ? '+' : ''}${delta}).`;
    }
    case 'ADJUST_PLAYER_COUNTER': {
      const targetWho = displayName(event.payload.seat as number);
      const counterType = event.payload.counterType as string;
      const total = event.payload.total as number;
      const delta = event.payload.delta as number;
      return `${who} set ${targetWho}'s ${counterType} counters to ${total} (${delta > 0 ? '+' : ''}${delta}).`;
    }
    case 'ELIMINATE_PLAYER': {
      const targetWho = displayName(event.payload.seat as number);
      return event.payload.eliminated ? `${targetWho} was marked eliminated.` : `${targetWho} was un-eliminated.`;
    }
    case 'TURN_PASSED':
      return `${who} passed the turn.`;
    case 'SHUFFLE_LIBRARY':
      return `${who} shuffled their library.`;
    case 'SEARCH_LIBRARY':
      return `${who} searched their library.`;
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
    case 'MULLIGAN': {
      const count = event.payload.mulliganCount as number | undefined;
      return count === 1
        ? `${who} took their free mulligan (drew a fresh 7).`
        : `${who} took a mulligan (drew a fresh 7).`;
    }
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
    case 'FLIP_CARD':
      return `${who} flipped a card to its other face.`;
    case 'ATTACH_CARD':
      return event.payload.targetInstanceId ? `${who} attached a card to another card.` : `${who} detached a card.`;
    case 'EMPTY_MANA_POOL':
      return `${who} emptied their mana pool.`;
    case 'CREATE_TOKEN': {
      const name = event.payload.name as string | undefined;
      return name ? `${who} created a ${name} token.` : `${who} created a token.`;
    }
    case 'REMOVE_TOKEN': {
      const name = event.payload.name as string | undefined;
      return name ? `${who} removed a ${name} token.` : `${who} removed a token.`;
    }
    case 'SET_ANNOTATION':
      return `${who} annotated a card.`;
    case 'GIVE_CARD': {
      const toWho = displayName(event.payload.toSeat as number);
      return `${who} gave a card to ${toWho}.`;
    }
    case 'GAME_ENDED':
      return `${who} ended the game.`;
    case 'DECLARE_ATTACK': {
      const targetType = event.payload.targetType as string;
      const targetWho = displayName(event.payload.targetSeat as number);
      return targetType === 'player'
        ? `${who} attacks ${targetWho}.`
        : `${who} attacks one of ${targetWho}'s planeswalkers/battles.`;
    }
    case 'CANCEL_ATTACK':
      return `${who} cancels an attack.`;
    case 'DECLARE_BLOCK':
      return `${who} declares a blocker.`;
    case 'CANCEL_BLOCK':
      return `${who} stops blocking.`;
    case 'CLEAR_MY_COMBAT':
      return `${who} cleared their combat declarations.`;
    case 'AI_REASONING':
      return `${who} (thinking): ${event.payload.text ?? ''}`;
    case 'AI_SKIPPED_NO_KEY':
      return `${who} has no AI key configured and will not act.`;
    case 'AI_ERROR': {
      const rawMessage = event.payload.message as string | undefined;
      const message = rawMessage ? truncate(rawMessage, 300) : undefined;
      const provider = event.payload.provider as string | undefined;
      const prefix = provider ? `${who}'s ${AI_PROVIDER_LABELS[provider] ?? provider} attempt` : who;
      return message ? `${prefix} hit an error and passed the turn: ${message}` : `${prefix} hit an error and passed the turn.`;
    }
    case 'AI_PROVIDER_FAILED': {
      const rawMessage = event.payload.message as string | undefined;
      const message = rawMessage ? truncate(rawMessage, 300) : undefined;
      const provider = AI_PROVIDER_LABELS[event.payload.provider as string] ?? event.payload.provider;
      const nextProvider = AI_PROVIDER_LABELS[event.payload.nextProvider as string] ?? event.payload.nextProvider;
      return `${who}'s ${provider} attempt failed, trying ${nextProvider} instead${message ? `: ${message}` : '.'}`;
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
              className={AI_EVENT_TYPES.has(event.type) ? 'italic text-accent2' : eventColorClass(event.type)}
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
