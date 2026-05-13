/** One logical row after tabular parse (before column mapping). */
export interface ParsedTabularRow {
  sheetName?: string;
  rowIndex: number;
  raw: Record<string, unknown>;
  skipped: boolean;
  skipReason?: string;
  parseErrors: string[];
  parseWarnings: string[];
}

export interface ParsedFileResult {
  fileName: string;
  sourceKind: "XLSX" | "CSV";
  rows: ParsedTabularRow[];
  /** File-level issues (e.g. unreadable sheet). */
  globalErrors: string[];
}

export interface ImportRunSummary {
  supplierCode: string;
  files: Array<{
    sourceKey: string;
    importId: string;
    version: number;
    rowCount: number;
    parsedCount: number;
    skippedCount: number;
    errorCount: number;
    status: string;
  }>;
}
