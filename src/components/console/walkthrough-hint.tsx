import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  variant?: "default" | "start";
};

/**
 * Inline guidance only (no modals). Use sparingly on primary workflow screens.
 */
export function WalkthroughHint({ title, children, variant = "default" }: Props) {
  const border =
    variant === "start"
      ? "border-emerald-800/50 bg-emerald-950/20"
      : "border-zinc-700/60 bg-zinc-900/40";
  return (
    <aside
      className={`mb-4 rounded-md border px-3 py-2.5 text-[11px] leading-relaxed text-zinc-400 ${border}`}
    >
      {title ? (
        <p className="mb-1 font-medium text-zinc-300">
          {variant === "start" ? "Start here — " : ""}
          {title}
        </p>
      ) : variant === "start" ? (
        <p className="mb-1 font-medium text-zinc-300">Start here</p>
      ) : null}
      <div>{children}</div>
    </aside>
  );
}
