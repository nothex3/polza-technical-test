import { db } from "@/lib/db";
import { normalizeText } from "@/lib/normalization";
import type { CompanyListResult, CompanyRow } from "@/types/company";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type CompanyFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  city?: string;
};

export async function getCompanies(
  filters: CompanyFilters,
): Promise<CompanyListResult> {
  const requestedPage = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(filters.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const search = normalizeText(filters.search);
  const city = normalizeText(filters.city);

  const countResult = await db.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM companies
      WHERE ($1 = '' OR name_normalized ILIKE '%' || $1 || '%')
        AND ($2 = '' OR city_normalized = $2)
    `,
    [search, city],
  );

  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const result = await db.query<CompanyRow>(
    `
      SELECT
        id,
        name,
        category,
        city,
        address,
        rating::text,
        reviews_count,
        website,
        email,
        phone
      FROM companies
      WHERE ($1 = '' OR name_normalized ILIKE '%' || $1 || '%')
        AND ($2 = '' OR city_normalized = $2)
      ORDER BY name_normalized ASC, id ASC
      LIMIT $3
      OFFSET $4
    `,
    [search, city, pageSize, offset],
  );

  return {
    companies: result.rows,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getCities(): Promise<Array<{ value: string; label: string }>> {
  const result = await db.query<{ value: string; label: string }>(
    `
      SELECT
        city_normalized AS value,
        MIN(city) AS label
      FROM companies
      WHERE city_normalized IS NOT NULL
        AND city_normalized <> ''
      GROUP BY city_normalized
      ORDER BY MIN(city) ASC
    `,
  );

  return result.rows;
}
