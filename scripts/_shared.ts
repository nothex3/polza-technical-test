import fs from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import type { CompanyInput, ExtractionIssue } from "@/types/company";

export function getArgument(name: string): string | null {
  const prefix = `${name}=`;
  const direct = process.argv.find((argument) => argument.startsWith(prefix));
  if (direct) {
    return direct.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export async function applySqlFile(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);
  const sql = await fs.readFile(absolutePath, "utf8");
  await db.query(sql);
}

export async function startImportRun(
  client: PoolClient,
  sourceType: string,
  sourcePath: string,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO import_runs (source_type, source_path, metadata)
      VALUES ($1, $2, $3::jsonb)
      RETURNING id::text
    `,
    [sourceType, sourcePath, JSON.stringify(metadata)],
  );

  return Number(result.rows[0].id);
}

export async function finishImportRun(
  client: PoolClient,
  runId: number,
  status: "completed" | "failed",
  stats: {
    filesProcessed: number;
    rowsSeen: number;
    rowsInserted: number;
    rowsUpdated: number;
    rowsRejected: number;
  },
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `
      UPDATE import_runs
      SET
        finished_at = now(),
        status = $2,
        files_processed = $3,
        rows_seen = $4,
        rows_inserted = $5,
        rows_updated = $6,
        rows_rejected = $7,
        metadata = metadata || $8::jsonb
      WHERE id = $1
    `,
    [
      runId,
      status,
      stats.filesProcessed,
      stats.rowsSeen,
      stats.rowsInserted,
      stats.rowsUpdated,
      stats.rowsRejected,
      JSON.stringify(metadata),
    ],
  );
}

export async function recordIssues(
  client: PoolClient,
  runId: number,
  sourceFile: string,
  sourceRow: number,
  rawData: Record<string, unknown>,
  issues: ExtractionIssue[],
): Promise<void> {
  if (issues.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = issues.map((issue, index) => {
    const offset = index * 7;
    values.push(
      runId,
      sourceFile,
      sourceRow,
      issue.severity,
      issue.code,
      issue.message,
      JSON.stringify(rawData),
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`;
  });

  await client.query(
    `
      INSERT INTO import_issues (
        import_run_id,
        source_file,
        source_row,
        severity,
        code,
        message,
        raw_data
      )
      VALUES ${placeholders.join(", ")}
    `,
    values,
  );
}

export async function upsertCompanies(
  client: PoolClient,
  companies: CompanyInput[],
): Promise<{ inserted: number; updated: number; deduplicated: number }> {
  if (companies.length === 0) {
    return { inserted: 0, updated: 0, deduplicated: 0 };
  }

  const uniqueCompanies = Array.from(
    new Map(companies.map((company) => [company.dedupeKey, company])).values(),
  );
  const deduplicated = companies.length - uniqueCompanies.length;

  const values: unknown[] = [];
  const placeholders = uniqueCompanies.map((company, rowIndex) => {
    const rowValues: unknown[] = [
      company.externalId,
      company.name,
      company.nameNormalized,
      company.category,
      company.categoryNormalized,
      company.city,
      company.cityNormalized,
      company.address,
      company.rating,
      company.reviewsCount,
      company.website,
      company.websiteNormalized,
      company.email,
      company.emailNormalized,
      company.phone,
      company.phoneNormalized,
      company.sourceFile,
      company.sourcePage,
      company.sourceRow,
      company.dedupeKey,
      JSON.stringify(company.rawData),
    ];

    const offset = rowIndex * rowValues.length;
    values.push(...rowValues);
    return `(${rowValues.map((_, index) => `$${offset + index + 1}`).join(", ")})`;
  });

  const result = await client.query<{ inserted: boolean }>(
    `
      INSERT INTO companies (
        external_id,
        name,
        name_normalized,
        category,
        category_normalized,
        city,
        city_normalized,
        address,
        rating,
        reviews_count,
        website,
        website_normalized,
        email,
        email_normalized,
        phone,
        phone_normalized,
        source_file,
        source_page,
        source_row,
        dedupe_key,
        raw_data
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (dedupe_key) DO UPDATE SET
        external_id = COALESCE(companies.external_id, EXCLUDED.external_id),
        name = CASE
          WHEN length(EXCLUDED.name) >= length(companies.name) THEN EXCLUDED.name
          ELSE companies.name
        END,
        name_normalized = CASE
          WHEN length(EXCLUDED.name) >= length(companies.name)
            THEN EXCLUDED.name_normalized
          ELSE companies.name_normalized
        END,
        category = COALESCE(EXCLUDED.category, companies.category),
        category_normalized = COALESCE(EXCLUDED.category_normalized, companies.category_normalized),
        city = COALESCE(EXCLUDED.city, companies.city),
        city_normalized = COALESCE(EXCLUDED.city_normalized, companies.city_normalized),
        address = COALESCE(EXCLUDED.address, companies.address),
        rating = CASE
          WHEN COALESCE(EXCLUDED.reviews_count, -1) >= COALESCE(companies.reviews_count, -1)
            THEN COALESCE(EXCLUDED.rating, companies.rating)
          ELSE companies.rating
        END,
        reviews_count = CASE
          WHEN companies.reviews_count IS NULL AND EXCLUDED.reviews_count IS NULL THEN NULL
          ELSE GREATEST(
            COALESCE(companies.reviews_count, 0),
            COALESCE(EXCLUDED.reviews_count, 0)
          )
        END,
        website = COALESCE(EXCLUDED.website, companies.website),
        website_normalized = COALESCE(EXCLUDED.website_normalized, companies.website_normalized),
        email = COALESCE(EXCLUDED.email, companies.email),
        email_normalized = COALESCE(EXCLUDED.email_normalized, companies.email_normalized),
        phone = COALESCE(EXCLUDED.phone, companies.phone),
        phone_normalized = COALESCE(EXCLUDED.phone_normalized, companies.phone_normalized),
        source_file = EXCLUDED.source_file,
        source_page = EXCLUDED.source_page,
        source_row = EXCLUDED.source_row,
        raw_data = companies.raw_data || EXCLUDED.raw_data,
        updated_at = now()
      RETURNING (xmax = 0) AS inserted
    `,
    values,
  );

  const inserted = result.rows.filter((row) => row.inserted).length;
  const affected = result.rowCount ?? 0;

  return {
    inserted,
    updated: affected - inserted + deduplicated,
    deduplicated,
  };
}

export async function closeDatabase(): Promise<void> {
  await db.end();
}
