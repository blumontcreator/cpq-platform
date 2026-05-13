import type { VoltageInfo } from "../types";

const VOLTAGE_RE = /(\d{2,3})(?:\s*[-–]\s*(\d{2,3}))?\s*v(?:ac|dc)?/gi;

export function parseVoltage(text: string): VoltageInfo | undefined {
  const match = VOLTAGE_RE.exec(text.toLowerCase());
  VOLTAGE_RE.lastIndex = 0;
  if (!match) return undefined;
  const raw = match[0];
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : min;
  const unitSuffix = (raw.match(/vac|vdc/i)?.[0] ?? "V").toUpperCase() as "V" | "VAC" | "VDC";
  return { min, max, unit: unitSuffix, raw };
}
