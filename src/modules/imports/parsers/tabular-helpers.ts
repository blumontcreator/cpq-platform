export function isBlankCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}

/** Skip rows where every mapped cell is blank (common XLSX tail noise). */
export function isRowEffectivelyEmpty(row: Record<string, unknown>): boolean {
  const values = Object.values(row);
  if (values.length === 0) return true;
  return values.every(isBlankCell);
}

export function coerceString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s.length ? s : undefined;
}

export function coerceNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
