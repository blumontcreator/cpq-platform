import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { a400BlackProfile } from "../src/modules/imports/profiles/a400-black.profile";
import { importSupplierFileFromDisk } from "../src/modules/imports/orchestrator/import-from-disk";

const DATA_DIR = path.join(process.cwd(), "data", "a400");

async function main() {
  const profile = a400BlackProfile;

  const supplier = await prisma.supplier.upsert({
    where: { code: profile.supplierCode },
    create: {
      code: profile.supplierCode,
      name: profile.supplierDisplayName,
      metadata: { profileKey: profile.profileKey },
    },
    update: {
      name: profile.supplierDisplayName,
      metadata: { profileKey: profile.profileKey },
    },
  });

  let entries: string[];
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch {
    console.error(
      `[import:a400] Missing data directory: ${DATA_DIR}\nCreate it and add .xlsx or .csv catalog files.`,
    );
    process.exitCode = 1;
    return;
  }

  const files = entries.filter((f) => /\.(csv|xlsx|xls)$/i.test(f)).sort();

  if (!files.length) {
    console.warn(`[import:a400] No .csv/.xlsx files in ${DATA_DIR}`);
    return;
  }

  console.info(`[import:a400] Supplier ${supplier.code} (${supplier.id})`);
  console.info(`[import:a400] Processing ${files.length} file(s)`);

  const summaries: Array<Record<string, string | number>> = [];

  for (const name of files) {
    const abs = path.join(DATA_DIR, name);
    const stat = await fs.stat(abs);
    if (!stat.isFile()) continue;

    const result = await importSupplierFileFromDisk(prisma, {
      supplierId: supplier.id,
      profile,
      absoluteFilePath: abs,
    });

    summaries.push({
      file: name,
      version: result.version,
      rows: result.rowCount,
      parsed: result.parsedCount,
      skipped: result.skippedCount,
      errors: result.errorCount,
      importId: result.importId,
    });

    console.info(
      `[import:a400] ${name} v${result.version} rows=${result.rowCount} parsed=${result.parsedCount} skipped=${result.skippedCount} errors=${result.errorCount}`,
    );
  }

  console.table(summaries);
}

main()
  .catch((e) => {
    console.error("[import:a400] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
