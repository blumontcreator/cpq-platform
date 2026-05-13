/**
 * ConfidenceBar — visual indicator for 0–1 confidence scores.
 * Color: green (high) → yellow (medium) → red (low)
 */
export function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-zinc-400">{pct}%</span>
      {label && <span className="text-xs text-zinc-500">{label}</span>}
    </div>
  );
}

export function ConfidenceDot({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-400" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      title={`Confidence: ${pct}%`}
    />
  );
}
