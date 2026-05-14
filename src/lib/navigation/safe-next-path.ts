/**
 * Prevents open redirects: only same-app relative paths are allowed.
 * Blocks protocol-relative URLs (`//evil.com`), backslashes, and scheme URLs.
 */
export function safeNextPath(raw: string | undefined, fallback = "/catalog"): string {
  if (raw === undefined || raw === "") return fallback;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.includes("\\") || path.includes("://")) return fallback;
  if (path.includes("@")) return fallback;
  return path;
}
