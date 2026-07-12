'use client';

export interface BlockAttackerOption {
  attackerInstanceId: string;
  label: string;
  alreadyBlocking: boolean;
}

export function BlockTargetPicker({
  cardName,
  options,
  onPick,
  onClose,
}: {
  cardName: string;
  options: BlockAttackerOption[];
  onPick: (attackerInstanceId: string, currentlyBlocking: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Block with {cardName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        {options.length === 0 ? (
          <p className="text-sm text-slate-400">No attackers are targeting you or your planeswalkers right now.</p>
        ) : (
          <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.attackerInstanceId}
                onClick={() => onPick(opt.attackerInstanceId, opt.alreadyBlocking)}
                className={`flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:text-white ${
                  opt.alreadyBlocking ? 'text-accent2' : 'text-slate-200'
                }`}
              >
                <span>{opt.label}</span>
                {opt.alreadyBlocking && <span className="flex-shrink-0 text-xs">✓ blocking</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
