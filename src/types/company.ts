export type CompanyInput = {
  externalId: string | null;
  name: string;
  nameNormalized: string;
  category: string | null;
  categoryNormalized: string | null;
  city: string | null;
  cityNormalized: string | null;
  address: string | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  websiteNormalized: string | null;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  sourceFile: string;
  sourcePage: number | null;
  sourceRow: number;
  dedupeKey: string;
  rawData: Record<string, unknown>;
};

export type ExtractionIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
};

export type CompanyRow = {
  id: number;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  rating: string | null;
  reviews_count: number | null;
  website: string | null;
  email: string | null;
  phone: string | null;
};

export type CompanyListResult = {
  companies: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
