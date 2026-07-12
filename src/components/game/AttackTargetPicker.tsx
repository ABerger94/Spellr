'use client';

export interface AttackTargetOption {
  targetType: 'player' | 'planeswalker';
  targetSeat: number;
  targetInstanceId?: string;
  label: string;
}

export function AttackTargetPicker({
  cardName,
  options,
  onPick,
  onClose,
}: {
  cardName: string;
  options: AttackTargetOption[];
  onPick: (option: AttackTargetOption) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Attack with {cardName} — target</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        {options.length === 0 ? (
          <p className="text-sm text-slate-400">No other players to attack.</p>
        ) : (
          <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
            {options.map((opt, i) => (
              <button
                key={`${opt.targetType}-${opt.targetSeat}-${opt.targetInstanceId ?? i}`}
                onClick={() => onPick(opt)}
                className="block w-full py-2 text-left text-sm text-slate-200 hover:text-white"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
