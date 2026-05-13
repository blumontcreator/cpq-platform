import * as XLSX from "xlsx";
import type { ParsedFileResult, ParsedTabularRow } from "../types";
import { isRowEffectivelyEmpty } from "./tabular-helpers";

function rowObject(headers: string[], cells: unknown[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    const key = String(h ?? "").trim();
    if (!key) return;
    raw[key] = cells[i] ?? "";
  });
  return raw;
}

export function parseXlsxBuffer(buffer: Buffer, fileName: string): ParsedFileResult {
  const rows: ParsedTabularRow[] = [];
  const globalErrors: string[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    let rowCounter = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];

      if (!matrix.length || !matrix[0]) {
        rows.push({
          sheetName,
          rowIndex: 0,
          raw: {},
          skipped: true,
          skipReason: "empty_sheet",
          parseErrors: [],
          parseWarnings: ["empty_sheet"],
        });
        continue;
      }

      const headerRow = matrix[0].map((c) => String(c ?? "").trim());
      const dataRows = matrix.slice(1);

      dataRows.forEach((cells, idx) => {
        const rowIndex = idx + 1;
        rowCounter += 1;
        const raw = rowObject(headerRow, cells as unknown[]);
        if (isRowEffectivelyEmpty(raw)) {
          rows.push({
            sheetName,
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
          sheetName,
          rowIndex,
          raw,
          skipped: false,
          parseErrors: [],
          parseWarnings: [],
        });
      });
    }

    if (rowCounter === 0 && workbook.SheetNames.length === 0) {
      globalErrors.push("workbook_has_no_sheets");
    }
  } catch (e) {
    globalErrors.push(`xlsx_read_error:${e instanceof Error ? e.message : String(e)}`);
  }

  return { fileName, sourceKind: "XLSX", rows, globalErrors };
}
