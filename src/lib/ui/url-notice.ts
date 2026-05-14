export type UrlNoticeKind = "success" | "error" | "info";

/** Appends short flash notice params for UrlNoticeToast (kept in query string briefly, then stripped client-side). */
export function withNotice(
  path: string,
  kind: UrlNoticeKind,
  message: string,
): string {
  const safe = message.replace(/\s+/g, " ").trim().slice(0, 280);
  const [pathname, rawQuery = ""] = path.split("?", 2);
  const params = new URLSearchParams(rawQuery);
  params.set("notice", kind);
  if (safe) params.set("msg", safe);
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}
