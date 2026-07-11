'use client';

import type { BattlefieldCard, CardFace, CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

const CARD_WIDTH_PX = 64;
/** How far each attached card (aura/equipment) peeks out from under its host. */
const ATTACH_OFFSET_PX = 10;

function faceFor(card: BattlefieldCard, facts: CardFacts | undefined): (CardFace & { manaCost?: string | null }) | undefined {
  if (card.transformed && facts?.backFace) return facts.backFace;
  return facts;
}

/** Freeform battlefield: cards sit wherever their x/y percent position says
 * and can be dragged anywhere within the quadrant, matching a real playmat.
 * Cards attached to another card (auras/equipment) render stacked behind
 * their host instead of getting their own spot. */
export function FreeformBattlefield({
  battlefield,
  cards,
  interactive,
  onTapToggle,
  onContextMenu,
}: {
  battlefield: BattlefieldCard[];
  cards: Record<string, CardFacts>;
  interactive: boolean;
  onTapToggle?: (instanceId: string, tapped: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, card: BattlefieldCard) => void;
}) {
  const { dragging } = useDragDrop();
  const isHover = interactive && dragging?.hoverZone === 'battlefield';

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
    <div
      data-dropzone={interactive ? 'true' : undefined}
      data-zone="battlefield"
      className={`relative h-full w-full overflow-hidden rounded p-1 ${
        isHover ? 'bg-accent/10 ring-2 ring-inset ring-accent' : ''
      }`}
    >
      {battlefield.length === 0 && (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-600">
          {interactive ? 'Drag cards here' : 'Empty'}
        </div>
      )}
      {roots.map((root) => {
        const attachments = attachedByHost.get(root.instanceId) ?? [];
        return (
          <div
            key={root.instanceId}
            className="absolute"
            style={{ left: `${root.x}%`, top: `${root.y}%`, width: CARD_WIDTH_PX }}
          >
            <div className="relative" style={{ width: CARD_WIDTH_PX }}>
              {attachments.map((att, i) => (
                <div
                  key={att.instanceId}
                  data-battlefield-card={interactive ? att.instanceId : undefined}
                  className="absolute"
                  style={{ left: (i + 1) * ATTACH_OFFSET_PX, top: (i + 1) * ATTACH_OFFSET_PX, width: CARD_WIDTH_PX, zIndex: i + 1 }}
                >
                  {renderCard(att)}
                </div>
              ))}
              <div data-battlefield-card={interactive ? root.instanceId : undefined} className="relative" style={{ zIndex: attachments.length + 1 }}>
                {renderCard(root)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
