import { parse } from "csv-parse/sync";
import type { ParsedFileResult, ParsedTabularRow } from "../types";
import { isRowEffectivelyEmpty } from "./tabular-helpers";

export function parseCsvText(content: string, fileName: string): ParsedFileResult {
  const rows: ParsedTabularRow[] = [];
  const globalErrors: string[] = [];

  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as Record<string, unknown>[];

    records.forEach((raw, idx) => {
      const rowIndex = idx + 1;
      if (isRowEffectivelyEmpty(raw)) {
        rows.push({
          rowIndex,
          raw,
          skipped: true,
          skipReason: "empty_row",
          parseErrors: [],
          parseWarnings: [],
        });
        return;
      }
      rows.push({
        rowIndex,
        raw,
        skipped: false,
        parseErrors: [],
        parseWarnings: [],
      });
    });
  } catch (e) {
    globalErrors.push(`csv_parse_error:${e instanceof Error ? e.message : String(e)}`);
  }

  return { fileName, sourceKind: "CSV", rows, globalErrors };
}
