import fs from "node:fs/promises";
import path from "node:path";
import { extractCompany, extractRecords } from "@/lib/data-extractor";
import { db, withTransaction } from "@/lib/db";
import type { CompanyInput } from "@/types/company";
import {
  applySqlFile,
  closeDatabase,
  finishImportRun,
  getArgument,
  hasFlag,
  recordIssues,
  startImportRun,
  upsertCompanies,
} from "./_shared";

const BATCH_SIZE = 500;

type ImportStats = {
  filesProcessed: number;
  rowsSeen: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsRejected: number;
  warnings: number;
};

function pageNumberFromFile(fileName: string): number | null {
  const match = fileName.match(/page[_-]?(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function listPageFiles(dataDir: string): Promise<string[]> {
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^page[_-]?\d+\.json$/i.test(entry.name))
    .map((entry) => path.join(dataDir, entry.name))
    .sort((left, right) =>
      left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }),
    );
}

async function main(): Promise<void> {
  const dataDir = path.resolve(getArgument("--data-dir") ?? "./data");
  const replace = hasFlag("--replace");

  await applySqlFile("db/schema.sql");
  const files = await listPageFiles(dataDir);

  if (files.length === 0) {
    throw new Error(
      `В ${dataDir} не найдены файлы page_001.json ... page_020.json. ` +
      "Распакуйте data_pack.zip в эту папку или передайте --data-dir.",
    );
  }

  const stats: ImportStats = {
    filesProcessed: 0,
    rowsSeen: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsRejected: 0,
    warnings: 0,
  };

  const seenDedupeKeys = new Map<string, { sourceFile: string; sourceRow: number }>();

  await withTransaction(async (client) => {
    if (replace) {
      await client.query(
        "TRUNCATE TABLE review_rows, import_issues, companies, import_runs RESTART IDENTITY CASCADE",
      );
    }

    const runId = await startImportRun(client, "pages_json", dataDir, {
      replace,
      files: files.map((file) => path.basename(file)),
    });

    try {
      for (const filePath of files) {
        const sourceFile = path.basename(filePath);
        const sourcePage = pageNumberFromFile(sourceFile);
        const payload = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
        const records = extractRecords(payload);

        if (records.length === 0) {
          await recordIssues(client, runId, sourceFile, 0, {}, [{
            severity: "error",
            code: "NO_RECORDS_FOUND",
            message: "В JSON не найден массив объектов компаний.",
          }]);
          stats.rowsRejected += 1;
          stats.filesProcessed += 1;
          continue;
        }

        const batch: CompanyInput[] = [];
        for (const [index, record] of records.entries()) {
          const sourceRow = index + 1;
          stats.rowsSeen += 1;

          const extraction = extractCompany(record, {
            sourceFile,
            sourcePage,
            sourceRow,
          });

          if (extraction.company) {
            const firstSeen = seenDedupeKeys.get(extraction.company.dedupeKey);
            if (firstSeen) {
              extraction.issues.push({
                severity: "warning",
                code: "DUPLICATE_SOURCE_RECORD",
                message: `Повтор записи из ${firstSeen.sourceFile}, строка ${firstSeen.sourceRow}; будет выполнен UPSERT без создания дубля.`,
              });
            } else {
              seenDedupeKeys.set(extraction.company.dedupeKey, { sourceFile, sourceRow });
            }
          }

          await recordIssues(
            client,
            runId,
            sourceFile,
            sourceRow,
            record,
            extraction.issues,
          );
          stats.warnings += extraction.issues.filter(
            (issue) => issue.severity === "warning",
          ).length;

          if (!extraction.company) {
            stats.rowsRejected += 1;
            continue;
          }

          batch.push(extraction.company);
          if (batch.length >= BATCH_SIZE) {
            const result = await upsertCompanies(client, batch.splice(0, batch.length));
            stats.rowsInserted += result.inserted;
            stats.rowsUpdated += result.updated;
          }
        }

        if (batch.length > 0) {
          const result = await upsertCompanies(client, batch);
          stats.rowsInserted += result.inserted;
          stats.rowsUpdated += result.updated;
        }

        stats.filesProcessed += 1;
        console.log(`${sourceFile}: найдено ${records.length} записей`);
      }

      await finishImportRun(client, runId, "completed", stats, {
        warnings: stats.warnings,
      });
    } catch (error) {
      await finishImportRun(client, runId, "failed", stats, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  const countResult = await db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM companies",
  );

  console.log("\nИмпорт завершён");
  console.table({
    "Файлов обработано": stats.filesProcessed,
    "Строк прочитано": stats.rowsSeen,
    "Новых компаний": stats.rowsInserted,
    "Обновлено/дедуплицировано": stats.rowsUpdated,
    "Отклонено": stats.rowsRejected,
    "Предупреждений": stats.warnings,
    "Компаний в БД": Number(countResult.rows[0].count),
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
