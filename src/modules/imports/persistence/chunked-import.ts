/**
 * Chunked import pipeline for large supplier catalogs.
 *
 * Problem: The default `persistSupplierImport` loads ALL rows into memory
 * and processes them in a single transaction. At 10k+ rows this causes:
 *   - OOM risk: all normalized rows in memory simultaneously
 *   - Transaction timeout: Postgres connection held for minutes
 *   - No recovery: a failure at row 9999 discards all prior work
 *
 * Solution:
 *   1. Parse the file once — lightweight (text only)
 *   2. Process in chunks of `chunkSize` rows
 *   3. Each chunk is its own short-lived transaction
 *   4. Progress is written to SupplierImport.parsedCount after each chunk
 *   5. On resumption, skip already-processed rows (via rowIndex range)
 *   6. Per-row failures are recorded and counted without aborting the import
 *
 * Usage:
 *   const result = await persistSupplierImportChunked(prisma, { ... });
 */
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { ImportSourceKind } from "@prisma/client";
import type { ImportProfile } from "../profiles/profile.types";
import type { ParsedFileResult } from "../types";
import type { ExtractionProvider } from "../../catalog/extraction/types";
import { mapRawToFields, normalizeMappedRow } from "../../catalog/normalization/normalization.service";
import { upsertCatalogFromMappedRow } from "./import-persistence";
import { ImportChunkError } from "@/lib/errors";
import { rootLogger } from "@/lib/observability/logger";

const log = rootLogger.child("imports.chunked");

export const DEFAULT_CHUNK_SIZE = 100;
export const MAX_CHUNK_RETRIES = 2;

export interface ChunkedImportInput {
  supplierId:          string;
  profile:             ImportProfile;
  sourceKey:           string;
  sourceKind:          ImportSourceKind;
  parsed:              ParsedFileResult;
  extractionProvider?: ExtractionProvider;
  chunkSize?:          number;
  /** Resume from a specific row index (for interrupted imports). */
  resumeFromRow?:      number;
}

export interface ChunkResult {
  chunkIndex:  number;
  rowStart:    number;
  rowEnd:      number;
  parsed:      number;
  errors:      number;
  skipped:     number;
  durationMs:  number;
  failed:      boolean;
  failReason?: string;
}

export interface ChunkedImportResult {
  importId:      string;
  version:       number;
  totalRows:     number;
  parsedCount:   number;
  skippedCount:  number;
  errorCount:    number;
  chunkResults:  ChunkResult[];
  resumedFromRow: number;
  completedAt:   string;
}

export async function persistSupplierImportChunked(
  prisma: PrismaClient,
  input: ChunkedImportInput,
): Promise<ChunkedImportResult> {
  const {
    supplierId,
    profile,
    sourceKey,
    sourceKind,
    parsed,
    extractionProvider,
    chunkSize      = DEFAULT_CHUNK_SIZE,
    resumeFromRow  = 0,
  } = input;

  // ── Step 1: Determine version ───────────────────────────────────────────
  const maxRow = await prisma.supplierImport.findFirst({
    where:   { supplierId },
    orderBy: { version: "desc" },
    select:  { version: true },
  });
  const version = (maxRow?.version ?? 0) + 1;

  const allRows    = parsed.rows.filter((r) => !r.skipped);
  const skippedRows = parsed.rows.filter((r) => r.skipped);
  const totalRows  = parsed.rows.length;

  // ── Step 2: Create import record in RUNNING state ────────────────────────
  const importRecord = await prisma.supplierImport.create({
    data: {
      supplierId,
      version,
      sourceKey,
      sourceKind,
      status:       "RUNNING",
      rowCount:     totalRows,
      skippedCount: skippedRows.length,
      metadata: {
        globalErrors: parsed.globalErrors,
        chunked:      true,
        chunkSize,
        resumeFromRow,
      } as Prisma.InputJsonValue,
    },
  });

  log.info("Chunked import started", {
    importId: importRecord.id,
    supplierId,
    totalRows,
    chunkSize,
    resumeFromRow,
  });

  // ── Step 3: Filter to unprocessed rows ───────────────────────────────────
  const workableRows = allRows.filter((r) => r.rowIndex >= resumeFromRow);

  // ── Step 4: Chunk processing ─────────────────────────────────────────────
  let totalParsed  = 0;
  let totalErrors  = 0;
  const chunkResults: ChunkResult[] = [];

  for (let ci = 0; ci < workableRows.length; ci += chunkSize) {
    const chunk     = workableRows.slice(ci, ci + chunkSize);
    const chunkIdx  = Math.floor(ci / chunkSize);
    const rowStart  = chunk[0]?.rowIndex ?? ci;
    const rowEnd    = chunk[chunk.length - 1]?.rowIndex ?? ci + chunk.length - 1;
    const chunkStart = Date.now();

    let chunkParsed = 0;
    let chunkErrors = 0;
    let failed      = false;
    let failReason: string | undefined;

    for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            for (const row of chunk) {
              const mapResult = mapRawToFields(row.raw, profile);

              if (!mapResult.ok) {
                chunkErrors += 1;
                await tx.supplierImportRow.create({
                  data: {
                    importId:     importRecord.id,
                    sheetName:    row.sheetName ?? null,
                    rowIndex:     row.rowIndex,
                    raw:          row.raw as Prisma.InputJsonValue,
                    supplierSku:  null,
                    supplierName: null,
                    parseErrors:  mapResult.errors.length ? (mapResult.errors as Prisma.InputJsonValue) : undefined,
                  },
                });
                continue;
              }

              const normalized = await normalizeMappedRow(
                mapResult.value,
                profile,
                extractionProvider,
              );

              const { productId, variantId } = await upsertCatalogFromMappedRow(tx, {
                supplierId,
                profile,
                mapped: mapResult.value,
                normalized,
              });

              chunkParsed += 1;

              await tx.supplierImportRow.create({
                data: {
                  importId:     importRecord.id,
                  sheetName:    row.sheetName ?? null,
                  rowIndex:     row.rowIndex,
                  raw:          row.raw as Prisma.InputJsonValue,
                  supplierSku:  mapResult.value.supplierSku,
                  supplierName: mapResult.value.supplierName ?? null,
                  parseErrors:  row.parseErrors.length ? (row.parseErrors as Prisma.InputJsonValue) : undefined,
                  parseWarnings: row.parseWarnings.length ? (row.parseWarnings as Prisma.InputJsonValue) : undefined,
                  productId,
                  variantId,
                },
              });
            }
          },
          { timeout: 20_000 },
        );

        // Chunk succeeded — update progress on the import record
        totalParsed += chunkParsed;
        totalErrors += chunkErrors;

        await prisma.supplierImport.update({
          where: { id: importRecord.id },
          data:  { parsedCount: totalParsed, errorCount: totalErrors },
        });

        break; // success — no retry needed

      } catch (err) {
        if (attempt < MAX_CHUNK_RETRIES) {
          const delayMs = 100 * 2 ** attempt;
          log.warn(`Chunk ${chunkIdx} failed, retrying (${attempt + 1}/${MAX_CHUNK_RETRIES})`, {
            importId: importRecord.id,
            chunkIdx,
            err: err instanceof Error ? err.message : String(err),
          });
          await new Promise((r) => setTimeout(r, delayMs));
          chunkParsed = 0;
          chunkErrors = 0;
          continue;
        }

        // All retries exhausted — record failure but continue with next chunks
        failed     = true;
        failReason = err instanceof Error ? err.message : String(err);
        totalErrors += chunk.length;

        log.error(`Chunk ${chunkIdx} permanently failed`, {
          importId: importRecord.id,
          rowStart,
          rowEnd,
          err: failReason,
        });

        // Publish a structured chunk error so operators can inspect and retry
        const chunkError = new ImportChunkError(chunkIdx, [rowStart, rowEnd], err);
        // Surface for observability — don't rethrow (continue remaining chunks)
        log.error(chunkError.message, chunkError.details ?? {});
      }
    }

    chunkResults.push({
      chunkIndex: chunkIdx,
      rowStart,
      rowEnd,
      parsed:     chunkParsed,
      errors:     chunkErrors,
      skipped:    0,
      durationMs: Date.now() - chunkStart,
      failed,
      failReason,
    });

    log.info(`Chunk ${chunkIdx} done`, {
      importId: importRecord.id,
      parsed:   chunkParsed,
      errors:   chunkErrors,
      durationMs: Date.now() - chunkStart,
    });
  }

  // ── Step 5: Finalize import record ─────────────────────────────────────
  // SupplierImportStatus only has COMPLETED and FAILED (no partial state)
  const finalStatus = totalParsed === 0 && totalErrors > 0 ? "FAILED" : "COMPLETED";

  const completedAt = new Date();
  await prisma.supplierImport.update({
    where: { id: importRecord.id },
    data: {
      status:      finalStatus,
      parsedCount: totalParsed,
      errorCount:  totalErrors,
      completedAt,
    },
  });

  log.info("Chunked import completed", {
    importId: importRecord.id,
    status:   finalStatus,
    totalParsed,
    totalErrors,
    chunks:   chunkResults.length,
  });

  return {
    importId:       importRecord.id,
    version,
    totalRows,
    parsedCount:    totalParsed,
    skippedCount:   skippedRows.length,
    errorCount:     totalErrors,
    chunkResults,
    resumedFromRow: resumeFromRow,
    completedAt:    completedAt.toISOString(),
  };
}

/**
 * Resume a previously interrupted import from the last successfully processed row.
 *
 * Usage:
 *   const interrupted = await prisma.supplierImport.findFirst({
 *     where: { status: "RUNNING", supplierId },
 *     orderBy: { startedAt: "desc" },
 *   });
 *   if (interrupted) {
 *     await resumeChunkedImport(prisma, interrupted.id, { ... input });
 *   }
 */
export async function resumeChunkedImport(
  prisma: PrismaClient,
  importId: string,
  input: Omit<ChunkedImportInput, "resumeFromRow">,
): Promise<ChunkedImportResult> {
  const existing = await prisma.supplierImport.findUnique({
    where:  { id: importId },
    select: { parsedCount: true, status: true },
  });

  if (!existing) {
    throw new Error(`Import ${importId} not found`);
  }

  if (existing.status === "COMPLETED") {
    throw new Error(`Import ${importId} is already COMPLETED`);
  }

  // Find the highest rowIndex already successfully persisted
  // Rows without parseErrors are considered successfully processed
  const allRows = await prisma.supplierImportRow.findMany({
    where:   { importId },
    orderBy: { rowIndex: "desc" },
    take:    1,
    select:  { rowIndex: true },
  });
  const lastRow = allRows[0] ?? null;

  const resumeFromRow = lastRow ? lastRow.rowIndex + 1 : 0;

  log.info("Resuming chunked import", { importId, resumeFromRow });

  return persistSupplierImportChunked(prisma, { ...input, resumeFromRow });
}
