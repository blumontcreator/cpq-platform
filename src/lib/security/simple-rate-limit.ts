/**
 * In-process fixed-window rate limiter for route handlers (single instance).
 * For multi-instance production, replace with Redis / edge KV / WAF rules.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const MAX_KEYS = 2048;

function prune(now: number) {
  if (store.size <= MAX_KEYS) return;
  for (const [k, v] of store) {
    if (now > v.resetAt) store.delete(k);
  }
  if (store.size <= MAX_KEYS) return;
  const keys = [...store.keys()].slice(0, store.size - MAX_KEYS + 256);
  for (const k of keys) store.delete(k);
}

export function consumeRateToken(
  key: string,
  maxPerWindow: number,
  windowMs: number,
): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  prune(now);
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= maxPerWindow) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { ok: true };
}

export function clientIpFromRequest(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = h.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "unknown";
}
