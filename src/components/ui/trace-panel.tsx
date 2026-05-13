/**
 * TracePanel — collapsible explainability panel.
 * Uses native <details> so zero JS is required.
 */
import type { ReactNode } from "react";

export function TracePanel({
  label = "Trace / Reasoning",
  children,
  defaultOpen = false,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      className={`group rounded border border-zinc-800 bg-zinc-900/50 ${className}`}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300">
        <span className="font-mono group-open:rotate-90 transition-transform">▶</span>
        {label}
      </summary>
      <div className="border-t border-zinc-800 px-3 py-3 text-xs text-zinc-400 space-y-1">
        {children}
      </div>
    </details>
  );
}

export function TraceRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-zinc-600">{label}</span>
      <span className="font-mono text-zinc-300">{value}</span>
    </div>
  );
}

export function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {warnings.map((w, i) => (
        <li key={i} className="flex gap-1.5 text-yellow-400">
          <span>⚠</span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}
