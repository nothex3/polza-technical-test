import fs from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { parseCsv, recordToObject } from "@/lib/csv";
import { db, withTransaction } from "@/lib/db";
import {
  analyzeReviewRows,
  buildReviewReport,
  type AnalyzedReviewRow,
  type ReferenceCompany,
  type ReviewInputRow,
} from "@/lib/review-validation";
import {
  applySqlFile,
  closeDatabase,
  finishImportRun,
  getArgument,
  hasFlag,
  recordIssues,
  startImportRun,
} from "./_shared";

type ReferenceRow = {
  id: string;
  external_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  rating: string | null;
  reviews_count: number | null;
  website_normalized: string | null;
  phone_normalized: string | null;
};

function toReferenceCompany(row: ReferenceRow): ReferenceCompany {
  return {
    id: Number(row.id),
    externalId: row.external_id,
    name: row.name,
    category: row.category,
    city: row.city,
    address: row.address,
    rating: row.rating === null ? null : Number(row.rating),
    reviewsCount: row.reviews_count,
    websiteNormalized: row.website_normalized,
    phoneNormalized: row.phone_normalized,
  };
}

async function insertReviewRows(
  client: PoolClient,
  runId: number,
  rows: AnalyzedReviewRow[],
): Promise<void> {
  const batchSize = 200;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const placeholders = batch.map((row, rowIndex) => {
      const rowValues: unknown[] = [
        runId,
        row.lineNumber,
        row.externalId,
        row.name,
        row.category,
        row.city,
        row.address,
        row.raw.rating ?? null,
        row.rating,
        row.raw.reviews_count ?? null,
        row.reviewsCount,
        row.raw.site ?? null,
        row.websiteNormalized,
        row.raw.phone ?? null,
        row.phoneNormalized,
        row.matchedCompanyId,
        row.isValid,
        JSON.stringify(row.issues),
        JSON.stringify(row.raw),
      ];
      const offset = rowIndex * rowValues.length;
      values.push(...rowValues);
      return `(${rowValues.map((_, index) => `$${offset + index + 1}`).join(", ")})`;
    });

    await client.query(
      `
        INSERT INTO review_rows (
          import_run_id,
          source_row,
          external_id,
          name,
          category,
          city,
          address,
          raw_rating,
          parsed_rating,
          raw_reviews_count,
          parsed_reviews_count,
          raw_website,
          normalized_website,
          raw_phone,
          normalized_phone,
          matched_company_id,
          is_valid,
          issues,
          raw_data
        )
        VALUES ${placeholders.join(", ")}
      `,
      values,
    );
  }
}

async function main(): Promise<void> {
  const filePath = path.resolve(getArgument("--file") ?? "./data/review.csv");
  const reportPath = path.resolve(getArgument("--report") ?? "./ANOMALIES.md");
  const replace = hasFlag("--replace");

  await applySqlFile("db/schema.sql");

  const csvText = await fs.readFile(filePath, "utf8");
  const parsed = parseCsv(csvText);
  if (parsed.headers.length === 0) {
    throw new Error(`CSV ${filePath} не содержит заголовка.`);
  }

  const inputRows: ReviewInputRow[] = parsed.records.map((record) => ({
    lineNumber: record.lineNumber,
    values: record.values,
    raw: recordToObject(parsed.headers, record),
  }));

  const referenceResult = await db.query<ReferenceRow>(
    `
      SELECT
        id::text,
        external_id,
        name,
        category,
        city,
        address,
        rating::text,
        reviews_count,
        website_normalized,
        phone_normalized
      FROM companies
      ORDER BY id
    `,
  );

  if (referenceResult.rows.length === 0) {
    throw new Error(
      "Таблица companies пуста. Сначала выполните npm run import:pages -- --replace.",
    );
  }

  const analysis = analyzeReviewRows(
    inputRows,
    parsed.headers,
    referenceResult.rows.map(toReferenceCompany),
  );

  await withTransaction(async (client) => {
    if (replace) {
      await client.query("DELETE FROM import_runs WHERE source_type = 'review_csv'");
    }

    const runId = await startImportRun(client, "review_csv", filePath, {
      headers: parsed.headers,
      headerProblems: analysis.headerProblems,
      replace,
    });

    try {
      for (const row of analysis.rows) {
        await recordIssues(
          client,
          runId,
          path.basename(filePath),
          row.lineNumber,
          row.raw,
          row.issues,
        );
      }

      await insertReviewRows(client, runId, analysis.rows);

      await finishImportRun(
        client,
        runId,
        "completed",
        {
          filesProcessed: 1,
          rowsSeen: analysis.stats.rowsRead,
          rowsInserted: analysis.stats.rowsRead,
          rowsUpdated: 0,
          rowsRejected: analysis.stats.rowsWithErrors,
        },
        {
          findings: analysis.findings.length,
          stats: analysis.stats,
          reportPath,
        },
      );
    } catch (error) {
      await finishImportRun(
        client,
        runId,
        "failed",
        {
          filesProcessed: 1,
          rowsSeen: analysis.stats.rowsRead,
          rowsInserted: 0,
          rowsUpdated: 0,
          rowsRejected: analysis.stats.rowsRead,
        },
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  });

  await fs.writeFile(
    reportPath,
    buildReviewReport(analysis, path.basename(filePath)),
    "utf8",
  );

  console.log("\nПроверка review.csv завершена");
  console.table({
    "Строк прочитано": analysis.stats.rowsRead,
    "Пустых строк": analysis.stats.emptyRows,
    "Строк с ошибками": analysis.stats.rowsWithErrors,
    "Только с предупреждениями": analysis.stats.rowsWithWarningsOnly,
    "Без блокирующих ошибок": analysis.stats.validRows,
    "Групп аномалий": analysis.findings.length,
    "Отчёт": reportPath,
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
