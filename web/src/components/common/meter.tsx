export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{(max > 0 ? (value / max) * 100 : 0).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="h-2 rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
