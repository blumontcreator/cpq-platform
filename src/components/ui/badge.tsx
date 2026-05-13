import type { ReactNode } from "react";

type BadgeVariant = "default" | "green" | "yellow" | "red" | "blue" | "purple" | "zinc";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-300 border-zinc-700",
  green:   "bg-green-950 text-green-400 border-green-800",
  yellow:  "bg-yellow-950 text-yellow-400 border-yellow-800",
  red:     "bg-red-950 text-red-400 border-red-800",
  blue:    "bg-blue-950 text-blue-400 border-blue-800",
  purple:  "bg-purple-950 text-purple-400 border-purple-800",
  zinc:    "bg-zinc-900 text-zinc-500 border-zinc-800",
};

export function Badge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium leading-4 ${VARIANT_CLASSES[variant]}`}>
      {children}
    </span>
  );
}

export function statusBadge(status: string): BadgeVariant {
  const s = status.toUpperCase();
  if (["WON", "COMPLETED", "APPROVED", "ACTIVE"].includes(s)) return "green";
  if (["LOST", "CANCELLED", "REJECTED", "CRITICAL"].includes(s)) return "red";
  if (["STALLED", "EXPIRED", "HIGH"].includes(s)) return "yellow";
  if (["PENDING", "PRICING", "REVIEW", "MEDIUM"].includes(s)) return "blue";
  if (["PROCUREMENT", "LOGISTICS", "INSTALLATION", "NEGOTIATION"].includes(s)) return "purple";
  return "default";
}
