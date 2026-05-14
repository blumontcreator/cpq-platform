"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Flash = { kind: string; msg: string };

/**
 * Reads `notice` + `msg` from the URL, shows a lightweight toast, then removes those params.
 */
export function UrlNoticeToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [flash, setFlash] = useState<Flash | null>(null);
  const seenKey = useRef<string | null>(null);

  useEffect(() => {
    const notice = searchParams.get("notice");
    const msg = searchParams.get("msg");
    if (!notice || msg == null) return;

    const key = `${notice}:${msg}`;
    if (seenKey.current === key) return;
    seenKey.current = key;

    setFlash({ kind: notice, msg: msg || "" });

    const next = new URLSearchParams(searchParams.toString());
    next.delete("notice");
    next.delete("msg");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    const t = window.setTimeout(() => setFlash(null), 5200);
    return () => window.clearTimeout(t);
  }, [pathname, router, searchParams]);

  if (!flash) return null;

  const styles =
    flash.kind === "error"
      ? "border-red-500/45 bg-red-950/95 text-red-100"
      : flash.kind === "info"
        ? "border-sky-500/40 bg-sky-950/90 text-sky-100"
        : "border-emerald-500/40 bg-emerald-950/90 text-emerald-100";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-4 z-[200] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${styles}`}
    >
      {flash.msg}
    </div>
  );
}
