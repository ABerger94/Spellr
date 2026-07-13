'use client';

export function GivePicker({
  cardName,
  players,
  onPick,
  onClose,
}: {
  cardName: string;
  players: { seat: number; name: string }[];
  onPick: (seat: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Give {cardName} to…</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-slate-400">No other players at the table.</p>
        ) : (
          <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
            {players.map((p) => (
              <button
                key={p.seat}
                onClick={() => onPick(p.seat)}
                className="block w-full py-2 text-left text-sm text-slate-200 hover:text-white"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
