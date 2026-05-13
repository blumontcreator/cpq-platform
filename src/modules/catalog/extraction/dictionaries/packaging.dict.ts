import type { PackagingInfo } from "../types";

const PACKAGING_PATTERNS: Array<{ re: RegExp; unit: string }> = [
  { re: /set\s+of\s+(\d+)/i, unit: "set" },
  { re: /pack\s+of\s+(\d+)/i, unit: "pack" },
  { re: /case\s+of\s+(\d+)/i, unit: "case" },
  { re: /box\s+of\s+(\d+)/i, unit: "box" },
  { re: /(\d+)\s*-?\s*pack/i, unit: "pack" },
  { re: /(\d+)\s*-?\s*piece/i, unit: "piece" },
  { re: /(\d+)\s*-?\s*pc/i, unit: "piece" },
  { re: /single/i, unit: "single" },
  { re: /pair/i, unit: "pair" },
  { re: /bulk/i, unit: "bulk" },
];

export function parsePackaging(text: string): PackagingInfo | undefined {
  for (const { re, unit } of PACKAGING_PATTERNS) {
    const match = text.match(re);
    if (match) {
      const raw = match[0];
      if (unit === "single") return { quantity: 1, unit, raw };
      if (unit === "pair") return { quantity: 2, unit, raw };
      if (unit === "bulk") return { quantity: 1, unit, raw };
      return { quantity: Number(match[1] ?? 1), unit, raw };
    }
  }
  return undefined;
}
