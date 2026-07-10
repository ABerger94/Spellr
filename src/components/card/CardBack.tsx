export function CardBack({ count, label }: { count?: number; label?: string }) {
  return (
    <div
      className="card-image relative flex w-full items-center justify-center bg-gradient-to-br from-panelLight to-ink shadow-md ring-1 ring-white/10"
      style={{ aspectRatio: '5 / 7' }}
    >
      <div className="absolute inset-2 rounded-full border-2 border-accent/40" />
      {typeof count === 'number' && (
        <span className="z-10 rounded bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white">{count}</span>
      )}
      {label && <span className="absolute bottom-1 left-1 right-1 truncate text-center text-[9px] text-slate-400">{label}</span>}
    </div>
  );
}
