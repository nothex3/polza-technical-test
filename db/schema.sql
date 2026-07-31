BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS import_runs (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL,
  source_path text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  files_processed integer NOT NULL DEFAULT 0,
  rows_seen integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_rejected integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS companies (
  id bigserial PRIMARY KEY,
  external_id text,
  name text NOT NULL,
  name_normalized text NOT NULL,
  category text,
  category_normalized text,
  city text,
  city_normalized text,
  address text,
  rating numeric(3, 1)
    CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  reviews_count integer
    CHECK (reviews_count IS NULL OR reviews_count >= 0),
  website text,
  website_normalized text,
  email text,
  email_normalized text,
  phone text,
  phone_normalized text,
  source_file text NOT NULL,
  source_page integer,
  source_row integer NOT NULL,
  dedupe_key text NOT NULL CHECK (length(dedupe_key) = 64) UNIQUE,
  raw_data jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_external_id_uidx
  ON companies (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS companies_name_trgm_idx
  ON companies USING gin (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS companies_city_idx
  ON companies (city_normalized);

CREATE INDEX IF NOT EXISTS companies_category_idx
  ON companies (category_normalized);

CREATE INDEX IF NOT EXISTS companies_reviews_idx
  ON companies (reviews_count)
  WHERE reviews_count IS NOT NULL;

CREATE INDEX IF NOT EXISTS companies_phone_idx
  ON companies (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS companies_website_idx
  ON companies (website_normalized)
  WHERE website_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS import_issues (
  id bigserial PRIMARY KEY,
  import_run_id bigint REFERENCES import_runs(id) ON DELETE CASCADE,
  source_file text NOT NULL,
  source_row integer,
  severity text NOT NULL CHECK (severity IN ('warning', 'error')),
  code text NOT NULL,
  message text NOT NULL,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_issues_run_idx
  ON import_issues (import_run_id);

-- review.csv намеренно загружается отдельно от companies.
-- raw_* сохраняют исходные строки, parsed/normalized поля — безопасный результат разбора.
CREATE TABLE IF NOT EXISTS review_rows (
  id bigserial PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  source_row integer NOT NULL,
  external_id text,
  name text,
  category text,
  city text,
  address text,
  raw_rating text,
  parsed_rating numeric(3, 1),
  raw_reviews_count text,
  parsed_reviews_count integer,
  raw_website text,
  normalized_website text,
  raw_phone text,
  normalized_phone text,
  matched_company_id bigint REFERENCES companies(id) ON DELETE SET NULL,
  is_valid boolean NOT NULL,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_run_id, source_row)
);

CREATE INDEX IF NOT EXISTS review_rows_run_idx
  ON review_rows (import_run_id);

CREATE INDEX IF NOT EXISTS review_rows_external_id_idx
  ON review_rows (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS review_rows_valid_idx
  ON review_rows (is_valid);

COMMIT;
