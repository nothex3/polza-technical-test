-- 1. Топ-5 категорий по количеству компаний.
SELECT
  COALESCE(NULLIF(category, ''), 'Без категории') AS category,
  COUNT(*) AS companies_count
FROM companies
GROUP BY COALESCE(NULLIF(category, ''), 'Без категории')
ORDER BY companies_count DESC, category ASC
LIMIT 5;


-- 2. Средний рейтинг по городам среди компаний,
-- у которых не менее 10 отзывов и рейтинг заполнен.
SELECT
  COALESCE(NULLIF(city, ''), 'Город не указан') AS city,
  COUNT(*) AS companies_count,
  ROUND(AVG(rating), 2) AS average_rating
FROM companies
WHERE reviews_count >= 10
  AND rating IS NOT NULL
GROUP BY COALESCE(NULLIF(city, ''), 'Город не указан')
ORDER BY average_rating DESC, companies_count DESC, city ASC;


-- 3. Доля компаний с заполненным сайтом по категориям.
SELECT
  COALESCE(NULLIF(category, ''), 'Без категории') AS category,
  COUNT(*) AS companies_count,
  COUNT(*) FILTER (WHERE website_normalized IS NOT NULL) AS companies_with_website,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE website_normalized IS NOT NULL)
    / NULLIF(COUNT(*), 0),
    2
  ) AS website_share_percent
FROM companies
GROUP BY COALESCE(NULLIF(category, ''), 'Без категории')
ORDER BY website_share_percent DESC, companies_count DESC, category ASC;
