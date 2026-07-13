'use client';

import { useState } from 'react';

const MAX_LENGTH = 280;

export function AnnotationEditor({
  cardName,
  initialText,
  onSave,
  onClose,
}: {
  cardName: string;
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);

  function save() {
    onSave(text);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Note — {cardName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={4}
          autoFocus
          placeholder="Add a note to this card…"
          className="w-full resize-none rounded border border-white/10 bg-panelLight p-2 text-sm text-white placeholder:text-slate-500"
        />
        <div className="mt-1 text-right text-[11px] text-slate-500">
          {text.length}/{MAX_LENGTH}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          {initialText && (
            <button
              onClick={() => {
                setText('');
                onSave('');
                onClose();
              }}
              className="rounded bg-panelLight px-3 py-1 text-sm text-slate-300 hover:bg-white/10"
            >
              Clear
            </button>
          )}
          <button onClick={save} className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent/80">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
