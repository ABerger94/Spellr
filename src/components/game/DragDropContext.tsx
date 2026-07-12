'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContentZone } from '@/types/game';

export interface DragSource {
  zone: Extract<ContentZone, 'hand' | 'battlefield' | 'commandZone'>;
  /** Identifies the card on the battlefield (source zone === 'battlefield'). */
  instanceId?: string;
  /** Identifies the card in non-battlefield source zones. */
  scryfallId?: string;
  /** Double-faced card currently showing its back face in hand/command zone —
   * carried through so dropping it onto the battlefield plays that face. */
  transformed?: boolean;
}

export interface DropTarget {
  zone: ContentZone;
  /** Only set when zone === 'battlefield': drop position as a percentage of the container. */
  xPercent?: number;
  yPercent?: number;
  /** Only set when zone === 'battlefield' and the drop landed on top of an
   * existing battlefield card — signals "attach to this card" instead of
   * "reposition to this spot". */
  targetInstanceId?: string;
}

interface DragMeta {
  name: string;
  imageUrl?: string | null;
}

interface DragState {
  source: DragSource;
  meta: DragMeta;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  hoverZone: string | null;
}

interface DragDropContextValue {
  dragging: DragState | null;
  startDrag: (source: DragSource, meta: DragMeta, pointer: { clientX: number; clientY: number }, rect: DOMRect) => void;
  updateDrag: (clientX: number, clientY: number) => void;
  endDrag: (clientX: number, clientY: number) => void;
  cancelDrag: () => void;
}

const DragDropCtx = createContext<DragDropContextValue | null>(null);

export function DragDropProvider({
  onDrop,
  children,
}: {
  onDrop: (source: DragSource, target: DropTarget) => void;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState<DragState | null>(null);
  const draggingRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);

  const startDrag = useCallback(
    (source: DragSource, meta: DragMeta, pointer: { clientX: number; clientY: number }, rect: DOMRect) => {
      const state: DragState = {
        source,
        meta,
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        offsetX: pointer.clientX - rect.left,
        offsetY: pointer.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        hoverZone: null,
      };
      draggingRef.current = state;
      setDragging(state);
    },
    [],
  );

  const updateDrag = useCallback((clientX: number, clientY: number) => {
    if (!draggingRef.current) return;
    pendingPos.current = { x: clientX, y: clientY };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pos = pendingPos.current;
      if (!draggingRef.current || !pos) return;
      const hoverEl = document.elementFromPoint(pos.x, pos.y)?.closest<HTMLElement>('[data-dropzone]');
      const next: DragState = { ...draggingRef.current, clientX: pos.x, clientY: pos.y, hoverZone: hoverEl?.dataset.zone ?? null };
      draggingRef.current = next;
      setDragging(next);
    });
  }, []);

  const clearDragState = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    draggingRef.current = null;
    setDragging(null);
  }, []);

  const endDrag = useCallback(
    (clientX: number, clientY: number) => {
      const state = draggingRef.current;
      clearDragState();
      if (!state) return;

      const zoneEl = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-dropzone]');
      const zone = zoneEl?.dataset.zone as ContentZone | undefined;
      if (!zoneEl || !zone) return;

      let target: DropTarget = { zone };
      if (zone === 'battlefield') {
        const rect = zoneEl.getBoundingClientRect();
        const topLeftX = clientX - state.offsetX;
        const topLeftY = clientY - state.offsetY;
        const cardEl = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-battlefield-card]');
        const targetInstanceId = cardEl?.dataset.battlefieldCard;
        target = {
          zone,
          xPercent: ((topLeftX - rect.left) / rect.width) * 100,
          yPercent: ((topLeftY - rect.top) / rect.height) * 100,
          targetInstanceId: targetInstanceId && targetInstanceId !== state.source.instanceId ? targetInstanceId : undefined,
        };
      }
      onDrop(state.source, target);
    },
    [onDrop, clearDragState],
  );

  return (
    <DragDropCtx.Provider value={{ dragging, startDrag, updateDrag, endDrag, cancelDrag: clearDragState }}>
      {children}
      {dragging && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100] overflow-hidden rounded bg-panelLight opacity-90 shadow-2xl"
              style={{
                left: dragging.clientX - dragging.offsetX,
                top: dragging.clientY - dragging.offsetY,
                width: dragging.width,
                height: dragging.height,
              }}
            >
              {dragging.meta.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dragging.meta.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] leading-tight text-slate-300">
                  {dragging.meta.name}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </DragDropCtx.Provider>
  );
}

export function useDragDrop() {
  const ctx = useContext(DragDropCtx);
  if (!ctx) throw new Error('useDragDrop must be used within a DragDropProvider');
  return ctx;
}
