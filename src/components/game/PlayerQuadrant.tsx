'use client';

import type { BattlefieldCard, CardFacts, PlayerStateView } from '@/types/game';
import { PlayerPanel } from './PlayerPanel';
import { ManaPool } from './ManaPool';
import { LibraryStack } from './LibraryStack';
import { PublicZoneStack } from './PublicZoneStack';
import { CommandZone } from './CommandZone';
import { FreeformBattlefield } from './FreeformBattlefield';

/** One player's whole board — panel, zone stacks, mana pool, and a freeform
 * battlefield — sized to sit in a fixed grid quadrant so every player's
 * board is visible at once without scrolling. */
export function PlayerQuadrant({
  player,
  cards,
  format,
  isViewer,
  isActiveTurn,
  isOnline,
  aiKeyMissing,
  onLifeChange,
  interactive,
  onDraw,
  onShuffle,
  onManaAdjust,
  onManaEmpty,
  onPlayCommander,
  onTapToggle,
  onContextMenu,
  onPileCardAction,
}: {
  player: PlayerStateView;
  cards: Record<string, CardFacts>;
  format: 'ONE_V_ONE' | 'COMMANDER';
  isViewer: boolean;
  isActiveTurn: boolean;
  isOnline: boolean;
  aiKeyMissing?: boolean;
  onLifeChange: (delta: number) => void;
  interactive: boolean;
  onDraw?: () => void;
  onShuffle?: () => void;
  onManaAdjust?: (color: string, delta: number) => void;
  onManaEmpty?: () => void;
  onPlayCommander?: (scryfallId: string) => void;
  onTapToggle?: (instanceId: string, tapped: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, card: BattlefieldCard) => void;
  onPileCardAction?: (e: React.MouseEvent, zone: 'graveyard' | 'exile', scryfallId: string) => void;
}) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg border p-2 ${
        isActiveTurn ? 'border-accent2 bg-accent2/5' : isViewer ? 'border-accent/40 bg-panel' : 'border-white/10 bg-panel'
      }`}
    >
      <PlayerPanel
        player={player}
        isViewer={isViewer}
        isActiveTurn={isActiveTurn}
        isOnline={isOnline}
        aiKeyMissing={aiKeyMissing}
        onLifeChange={onLifeChange}
        compact
      />

      <div className="mt-1 flex flex-shrink-0 flex-wrap items-start gap-1">
        <LibraryStack count={player.libraryCount} onDraw={onDraw} onShuffle={onShuffle} draggable={interactive} compact />
        <PublicZoneStack
          label="GY"
          zone="graveyard"
          scryfallIds={player.graveyard}
          cards={cards}
          draggable={interactive}
          onCardAction={onPileCardAction ? (e, id) => onPileCardAction(e, 'graveyard', id) : undefined}
          compact
        />
        <PublicZoneStack
          label="Exile"
          zone="exile"
          scryfallIds={player.exile}
          cards={cards}
          draggable={interactive}
          onCardAction={onPileCardAction ? (e, id) => onPileCardAction(e, 'exile', id) : undefined}
          compact
        />
        {format === 'COMMANDER' && (
          <CommandZone scryfallIds={player.commandZone} cards={cards} onPlay={onPlayCommander} draggable={interactive} compact />
        )}
        <span className="ml-1 self-center text-[10px] text-slate-500">Hand: {player.handCount}</span>
      </div>

      <div className="mt-1 flex-shrink-0">
        <ManaPool pool={player.manaPool} interactive={interactive} onAdjust={onManaAdjust} onEmpty={onManaEmpty} compact />
      </div>

      <div className="mt-1 min-h-0 flex-1">
        <FreeformBattlefield
          battlefield={player.battlefield}
          cards={cards}
          interactive={interactive}
          onTapToggle={onTapToggle}
          onContextMenu={onContextMenu}
        />
      </div>
    </div>
  );
}
