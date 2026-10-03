/** Circular progress (0–100) with an accessible label; the number in the middle is decorative. */
export function ProgressRing({ pct, label, color, size = 56 }: { pct: number; label: string; color?: string; size?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct, 0), 100);
  return (
    <svg role="img" aria-label={label} viewBox="0 0 56 56" width={size} height={size} className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" stroke={color ?? "var(--chart-1)"}
        strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} transform="rotate(-90 28 28)"
        className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none" />
      <text x="28" y="32" textAnchor="middle" className="fill-foreground text-[11px] font-semibold" aria-hidden>{Math.round(p)}%</text>
    </svg>
  );
}
