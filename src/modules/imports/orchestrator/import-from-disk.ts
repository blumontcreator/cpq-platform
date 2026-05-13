import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { ImportSourceKind } from "@prisma/client";
import type { ImportProfile } from "../profiles/profile.types";
import { parseCsvText, parseXlsxBuffer } from "../parsers";
import { persistSupplierImport } from "../persistence/import-persistence";

function detectSourceKind(fileName: string): ImportSourceKind {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".csv") return ImportSourceKind.CSV;
  return ImportSourceKind.XLSX;
}

export async function importSupplierFileFromDisk(
  prisma: PrismaClient,
  input: {
    supplierId: string;
    profile: ImportProfile;
    absoluteFilePath: string;
  },
) {
  const { supplierId, profile, absoluteFilePath } = input;
  const fileName = path.basename(absoluteFilePath);
  const ext = path.extname(fileName).toLowerCase();

  let parsed;
  if (ext === ".csv") {
    const text = await fs.readFile(absoluteFilePath, "utf8");
    parsed = parseCsvText(text, fileName);
  } else if (ext === ".xlsx" || ext === ".xls") {
    const buf = await fs.readFile(absoluteFilePath);
    parsed = parseXlsxBuffer(buf, fileName);
  } else {
    throw new Error(`Unsupported file type for import: ${ext}`);
  }

  const sourceKind = detectSourceKind(fileName);

  if (parsed.globalErrors.length) {
    console.warn(`[import] ${fileName} parser warnings:`, parsed.globalErrors);
  }

  return persistSupplierImport(prisma, {
    supplierId,
    profile,
    sourceKey: fileName,
    sourceKind,
    parsed,
  });
}
