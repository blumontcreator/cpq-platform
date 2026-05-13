import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  label,
  actions,
}: {
  label: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export function StatRow({
  label,
  value,
  mono = true,
  accent,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  accent?: "green" | "yellow" | "red" | "blue";
}) {
  const colorMap = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    blue: "text-blue-400",
  };
  const valueClass = accent ? colorMap[accent] : "text-zinc-200";
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-xs text-zinc-500 shrink-0">{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-sm ${valueClass} text-right`}>{value}</span>
    </div>
  );
}
