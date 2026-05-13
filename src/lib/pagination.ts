/**
 * Pagination utilities.
 *
 * Provides cursor-based pagination (safer for large result sets than offset)
 * and offset-based pagination for simple list endpoints.
 *
 * Cursor-based pagination:
 *   - Stable under concurrent inserts/deletes
 *   - O(1) regardless of page depth
 *   - Uses `createdAt` + `id` as composite cursor (opaque base64 token)
 *
 * Usage (cursor):
 *   const page = await paginateCursor(prisma.quote, {
 *     cursor: req.cursor,
 *     take: 20,
 *     orderField: "createdAt",
 *   });
 *
 * Usage (offset):
 *   const page = await paginateOffset(prisma.quote, { page: 1, pageSize: 20 });
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE     = 100;

// ── Cursor pagination ──────────────────────────────────────────────────────

export interface CursorPage<T> {
  items:      T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore:    boolean;
  total?:     number;
}

export interface CursorPaginationInput {
  cursor?:    string | null;
  take?:      number;
  direction?: "forward" | "backward";
}

/** Encode a cursor from an id + date tuple. */
export function encodeCursor(id: string, date: Date): string {
  return Buffer.from(JSON.stringify({ id, ts: date.toISOString() })).toString("base64url");
}

/** Decode a cursor back to id + date. Returns null if invalid. */
export function decodeCursor(cursor: string): { id: string; ts: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    if (typeof decoded.id === "string" && typeof decoded.ts === "string") return decoded;
    return null;
  } catch {
    return null;
  }
}

// ── Offset pagination ──────────────────────────────────────────────────────

export interface OffsetPage<T> {
  items:      T[];
  page:       number;
  pageSize:   number;
  totalItems: number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export interface OffsetPaginationInput {
  page?:     number;
  pageSize?: number;
}

/** Compute skip/take for a Prisma findMany from page + pageSize. */
export function offsetParams(input: OffsetPaginationInput): { skip: number; take: number } {
  const page     = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Wrap a Prisma result into a typed OffsetPage. */
export function buildOffsetPage<T>(
  items: T[],
  totalItems: number,
  input: OffsetPaginationInput,
): OffsetPage<T> {
  const page     = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ── Search params helpers (Next.js App Router) ─────────────────────────────

/** Parse page + pageSize from Next.js searchParams. */
export function parseOffsetParams(
  searchParams: Record<string, string | string[] | undefined>,
): OffsetPaginationInput {
  const raw = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? parseInt(v, 10) : undefined;
  };
  return { page: raw("page"), pageSize: raw("pageSize") };
}
