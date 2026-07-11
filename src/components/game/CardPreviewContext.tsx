'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PreviewCard {
  name: string;
  imageUrl?: string | null;
  manaCost?: string | null;
  typeLine?: string | null;
  oracleText?: string | null;
  power?: string | null;
  toughness?: string | null;
}

interface CardPreviewContextValue {
  /** Shows immediately, no delay — for an explicit tap/click on the magnify button. */
  showPreviewNow: (card: PreviewCard) => void;
  /** Shows after a short hover delay, so passing the mouse over a card doesn't flash it. */
  showPreviewOnHover: (card: PreviewCard) => void;
  hidePreview: () => void;
}

const CardPreviewCtx = createContext<CardPreviewContextValue | null>(null);

const HOVER_DELAY_MS = 350;
const HIDE_DELAY_MS = 80;

export function CardPreviewProvider({ children }: { children: React.ReactNode }) {
  const [card, setCard] = useState<PreviewCard | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function showPreviewNow(c: PreviewCard) {
    clearTimer();
    setCard(c);
  }

  function showPreviewOnHover(c: PreviewCard) {
    clearTimer();
    timerRef.current = setTimeout(() => setCard(c), HOVER_DELAY_MS);
  }

  function hidePreview() {
    clearTimer();
    timerRef.current = setTimeout(() => setCard(null), HIDE_DELAY_MS);
  }

  // Tap-anywhere-to-dismiss for the tap-triggered (magnify button) case,
  // since touch devices have no hover/mouseleave to fall back on. The
  // overlay itself must stay pointer-events-none (below) so it doesn't
  // physically cover — and steal hover off of — the card underneath it;
  // this listener is what makes a dismiss tap work despite that.
  useEffect(() => {
    if (!card) return;
    function handlePointerDown() {
      setCard(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [card]);

  return (
    <CardPreviewCtx.Provider value={{ showPreviewNow, showPreviewOnHover, hidePreview }}>
      {children}
      {card && typeof document !== 'undefined'
        ? createPortal(
            // pointer-events-none is load-bearing: without it, this overlay
            // (which covers the whole screen) would sit on top of the very
            // card that's being hovered, making the browser think the mouse
            // left it — firing mouseleave and instantly hiding the preview
            // it just showed.
            <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-6">
              <div className="flex max-h-full w-full max-w-sm flex-col items-center gap-3">
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imageUrl} alt={card.name} className="max-h-[75vh] w-full rounded-xl object-contain shadow-2xl" />
                ) : (
                  <div className="flex aspect-[5/7] w-full flex-col items-center justify-center rounded-xl bg-panelLight p-4 text-center text-white shadow-2xl">
                    <p className="font-semibold">{card.name}</p>
                  </div>
                )}
                {(card.typeLine || card.oracleText) && (
                  <div className="max-h-40 w-full overflow-y-auto rounded-lg bg-panel p-3 text-sm shadow-2xl">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-white">{card.name}</p>
                      {card.manaCost && <p className="flex-shrink-0 text-xs text-slate-400">{card.manaCost}</p>}
                    </div>
                    {card.typeLine && <p className="mb-1 text-xs text-slate-400">{card.typeLine}</p>}
                    {card.oracleText && <p className="whitespace-pre-line text-xs text-slate-300">{card.oracleText}</p>}
                    {card.power && card.toughness && (
                      <p className="mt-1 text-xs font-medium text-white">
                        {card.power}/{card.toughness}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </CardPreviewCtx.Provider>
  );
}

const NOOP_CTX: CardPreviewContextValue = {
  showPreviewNow: () => {},
  showPreviewOnHover: () => {},
  hidePreview: () => {},
};

/** CardImage (and anything using it) may render outside a CardPreviewProvider
 * — e.g. the deck builder — so this degrades to no-ops instead of throwing. */
export function useCardPreview() {
  return useContext(CardPreviewCtx) ?? NOOP_CTX;
}
