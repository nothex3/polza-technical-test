import { db } from "@/lib/db";
import { closeDatabase } from "./_shared";

const topCategoriesSql = `
  SELECT
    COALESCE(NULLIF(category, ''), 'Без категории') AS category,
    COUNT(*)::int AS companies_count
  FROM companies
  GROUP BY COALESCE(NULLIF(category, ''), 'Без категории')
  ORDER BY companies_count DESC, category ASC
  LIMIT 5
`;

const cityRatingsSql = `
  SELECT
    COALESCE(NULLIF(city, ''), 'Город не указан') AS city,
    COUNT(*)::int AS companies_count,
    ROUND(AVG(rating), 2)::text AS average_rating
  FROM companies
  WHERE reviews_count >= 10
    AND rating IS NOT NULL
  GROUP BY COALESCE(NULLIF(city, ''), 'Город не указан')
  ORDER BY average_rating DESC, companies_count DESC, city ASC
  LIMIT 20
`;

const websiteShareSql = `
  SELECT
    COALESCE(NULLIF(category, ''), 'Без категории') AS category,
    COUNT(*)::int AS companies_count,
    COUNT(*) FILTER (WHERE website_normalized IS NOT NULL)::int
      AS companies_with_website,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE website_normalized IS NOT NULL)
      / NULLIF(COUNT(*), 0),
      2
    )::text AS website_share_percent
  FROM companies
  GROUP BY COALESCE(NULLIF(category, ''), 'Без категории')
  ORDER BY website_share_percent DESC, companies_count DESC, category ASC
`;

async function main(): Promise<void> {
  const [summary, categories, ratings, websites, issues, reviewSummary] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS companies,
        COUNT(email_normalized)::int AS valid_emails,
        COUNT(website_normalized)::int AS websites,
        COUNT(phone_normalized)::int AS phones,
        COUNT(*) FILTER (WHERE city_normalized IS NULL)::int AS missing_city
      FROM companies
    `),
    db.query(topCategoriesSql),
    db.query(cityRatingsSql),
    db.query(websiteShareSql),
    db.query(`
      SELECT severity, code, COUNT(*)::int AS count
      FROM import_issues
      GROUP BY severity, code
      ORDER BY severity, count DESC
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS rows_loaded,
        COUNT(*) FILTER (WHERE is_valid)::int AS rows_without_errors,
        COUNT(*) FILTER (WHERE NOT is_valid)::int AS rows_with_errors,
        COUNT(matched_company_id)::int AS matched_to_companies
      FROM review_rows
    `),
  ]);

  console.log("\nСводка по базе");
  console.table(summary.rows);

  console.log("\nТоп-5 категорий");
  console.table(categories.rows);

  console.log("\nСредний рейтинг по городам, компании с 10+ отзывами");
  console.table(ratings.rows);

  console.log("\nДоля компаний с сайтом по категориям");
  console.table(websites.rows);

  console.log("\nЗамечания импорта");
  console.table(issues.rows);

  console.log("\nСводка review.csv");
  console.table(reviewSummary.rows);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
