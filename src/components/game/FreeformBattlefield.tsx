'use client';

import type { BattlefieldCard, CardFace, CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

// The canvas is deliberately larger than most viewports (especially phones)
// so permanents have real room and don't overlap — the outer box scrolls
// (both axes) to reveal the rest instead of clipping or cramming everything
// into a tiny area.
const CANVAS_MIN_WIDTH = 720;
const CANVAS_MIN_HEIGHT = 480;
const CARD_WIDTH_PX = 96;
/** How far each attached card (aura/equipment) peeks out from under its host. */
const ATTACH_OFFSET_PX = 16;

function faceFor(card: BattlefieldCard, facts: CardFacts | undefined): (CardFace & { manaCost?: string | null }) | undefined {
  if (card.transformed && facts?.backFace) return facts.backFace;
  return facts;
}

/** Freeform battlefield: cards sit wherever their x/y percent position says
 * and can be dragged anywhere within the canvas, matching a real playmat.
 * Cards attached to another card (auras/equipment) render stacked behind
 * their host instead of getting their own spot. */
export function FreeformBattlefield({
  battlefield,
  cards,
  interactive,
  onTapToggle,
  onContextMenu,
  compact,
  zoom = 1,
}: {
  battlefield: BattlefieldCard[];
  cards: Record<string, CardFacts>;
  interactive: boolean;
  onTapToggle?: (instanceId: string, tapped: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, card: BattlefieldCard) => void;
  /** Fills the height of its parent instead of a fixed height — used in the
   * grid quadrant layout, where the parent itself is already sized to fit
   * the available space. The canvas is unchanged and still scrolls to reach
   * every card. */
  compact?: boolean;
  /** Scales card size only — the battlefield zone itself keeps its actual
   * footprint, so zooming out fits more cards into the same space instead
   * of shrinking (and wasting) the zone around them. */
  zoom?: number;
}) {
  const { dragging } = useDragDrop();
  const isHover = interactive && dragging?.hoverZone === 'battlefield';
  const cardWidth = CARD_WIDTH_PX * zoom;
  const attachOffset = ATTACH_OFFSET_PX * zoom;

  const byInstance = new Map(battlefield.map((c) => [c.instanceId, c]));
  const attachedByHost = new Map<string, BattlefieldCard[]>();
  const roots: BattlefieldCard[] = [];
  for (const c of battlefield) {
    if (c.attachedTo && byInstance.has(c.attachedTo)) {
      if (!attachedByHost.has(c.attachedTo)) attachedByHost.set(c.attachedTo, []);
      attachedByHost.get(c.attachedTo)!.push(c);
    } else {
      roots.push(c);
    }
  }

  function renderCard(c: BattlefieldCard) {
    const facts = cards[c.scryfallId];
    const face = faceFor(c, facts);
    return (
      <DraggableCard
        source={interactive ? { zone: 'battlefield', instanceId: c.instanceId } : null}
        name={face?.name ?? c.scryfallId}
        imageUrl={face?.imageNormal}
        tapped={c.tapped}
        counters={c.counters}
        typeLine={face?.typeLine}
        oracleText={face?.oracleText}
        power={face?.power}
        toughness={face?.toughness}
        manaCost={c.transformed ? undefined : facts?.manaCost}
        onClick={interactive && onTapToggle ? () => onTapToggle(c.instanceId, c.tapped) : undefined}
        onContextMenu={
          interactive && onContextMenu
            ? (e) => {
                e.preventDefault();
                onContextMenu(e, c);
              }
            : undefined
        }
        onMore={interactive && onContextMenu ? (e) => onContextMenu(e, c) : undefined}
      />
    );
  }

  return (
    <div className={`w-full overflow-auto rounded border border-white/5 ${compact ? 'h-full' : 'h-72'}`}>
      <div
        data-dropzone={interactive ? 'true' : undefined}
        data-zone="battlefield"
        className={`relative ${compact ? 'h-full w-full' : 'w-full'} ${isHover ? 'bg-accent/10 ring-2 ring-inset ring-accent' : ''}`}
        style={{
          minWidth: compact ? undefined : CANVAS_MIN_WIDTH,
          minHeight: compact ? undefined : CANVAS_MIN_HEIGHT,
        }}
      >
        {battlefield.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            Battlefield is empty{interactive ? ' — drag cards here, scroll for more room' : ''}
          </div>
        )}
        {roots.map((root) => {
          const attachments = attachedByHost.get(root.instanceId) ?? [];
          return (
            <div
              key={root.instanceId}
              className="absolute"
              style={{ left: `${root.x}%`, top: `${root.y}%`, width: cardWidth }}
            >
              <div className="relative" style={{ width: cardWidth }}>
                {attachments.map((att, i) => (
                  <div
                    key={att.instanceId}
                    data-battlefield-card={interactive ? att.instanceId : undefined}
                    className="absolute"
                    style={{ left: (i + 1) * attachOffset, top: (i + 1) * attachOffset, width: cardWidth, zIndex: i + 1 }}
                  >
                    {renderCard(att)}
                  </div>
                ))}
                <div
                  data-battlefield-card={interactive ? root.instanceId : undefined}
                  className="relative"
                  style={{ zIndex: attachments.length + 1 }}
                >
                  {renderCard(root)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
