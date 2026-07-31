import type { CompanyInput, ExtractionIssue } from "@/types/company";
import {
  cleanText,
  createDedupeKey,
  isPlausibleEmail,
  isSuspiciousEmail,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  normalizeWebsite,
  parseOptionalInteger,
  parseOptionalNumber,
  toScalarString,
} from "@/lib/normalization";

type ExtractionContext = {
  sourceFile: string;
  sourcePage: number | null;
  sourceRow: number;
};

type ExtractionResult = {
  company: CompanyInput | null;
  issues: ExtractionIssue[];
};

const FIELD_ALIASES = {
  externalId: [
    "id", "uuid", "company_id", "companyid", "organization_id", "organizationid",
    "external_id", "externalid", "идентификатор"
  ],
  name: [
    "name", "title", "company", "company_name", "companyname", "organization",
    "organization_name", "organizationname", "название", "наименование", "компания"
  ],
  category: [
    "category", "category_name", "categoryname", "rubric", "rubrics", "industry",
    "type", "категория", "рубрика", "отрасль"
  ],
  city: [
    "city", "town", "locality", "settlement", "location_city", "город",
    "населенныйпункт", "населённыйпункт"
  ],
  address: [
    "address", "full_address", "fulladdress", "formatted_address", "formattedaddress",
    "street_address", "streetaddress", "адрес"
  ],
  rating: [
    "rating", "rate", "score", "stars", "average_rating", "averagerating",
    "рейтинг", "оценка"
  ],
  reviewsCount: [
    "reviews_count", "reviewscount", "review_count", "reviewcount", "reviews",
    "reviews_number", "reviewsnumber", "rating_count", "ratingcount",
    "числоотзывов", "количествоотзывов", "отзывов"
  ],
  website: [
    "website", "site", "url", "web_site", "web", "homepage", "сайт"
  ],
  email: [
    "email", "e_mail", "e-mail", "mail", "emails", "contact_email",
    "contactemail", "почта", "электроннаяпочта"
  ],
  phone: [
    "phone", "telephone", "tel", "phone_number", "phonenumber", "phones",
    "contact_phone", "contactphone", "телефон"
  ],
} as const;

function normalizeKey(key: string): string {
  return key
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
    field,
    new Set(aliases.map(normalizeKey)),
  ]),
) as Record<keyof typeof FIELD_ALIASES, Set<string>>;

function flattenRecord(
  value: unknown,
  output = new Map<string, unknown>(),
  depth = 0,
): Map<string, unknown> {
  if (!value || typeof value !== "object" || depth > 5) {
    return output;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeKey(key);
    if (!output.has(normalizedKey)) {
      output.set(normalizedKey, nestedValue);
    }

    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      flattenRecord(nestedValue, output, depth + 1);
    }
  }

  return output;
}

function pickValue(
  flattened: Map<string, unknown>,
  field: keyof typeof FIELD_ALIASES,
): unknown {
  const aliases = NORMALIZED_ALIASES[field];
  for (const [key, value] of flattened.entries()) {
    if (aliases.has(key)) {
      return value;
    }
  }

  return null;
}

function countCompanyLikeKeys(record: Record<string, unknown>): number {
  const flattened = flattenRecord(record);
  let score = 0;

  for (const field of ["name", "city", "category", "address", "website", "phone", "email"] as const) {
    if (pickValue(flattened, field) !== null) {
      score += field === "name" ? 4 : 1;
    }
  }

  return score;
}

export function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value),
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const preferredPaths = [
    root.data,
    root.items,
    root.results,
    root.companies,
    root.records,
    root.organizations,
  ];

  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const nestedData = root.data as Record<string, unknown>;
    preferredPaths.push(
      nestedData.items,
      nestedData.results,
      nestedData.companies,
      nestedData.records,
    );
  }

  for (const candidate of preferredPaths) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object" && !Array.isArray(value),
      );
    }
  }

  const candidateArrays: Record<string, unknown>[][] = [];

  function collectArrays(value: unknown, depth = 0): void {
    if (depth > 5 || !value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      const objects = value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
      if (objects.length > 0) {
        candidateArrays.push(objects);
      }
      return;
    }

    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectArrays(nested, depth + 1);
    }
  }

  collectArrays(root);

  return candidateArrays
    .map((records) => ({
      records,
      score:
        records.length *
        Math.max(...records.slice(0, 10).map(countCompanyLikeKeys), 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.records ?? [];
}

export function extractCompany(
  record: Record<string, unknown>,
  context: ExtractionContext,
): ExtractionResult {
  const flattened = flattenRecord(record);
  const issues: ExtractionIssue[] = [];

  const externalId = cleanText(toScalarString(pickValue(flattened, "externalId")));
  const name = cleanText(toScalarString(pickValue(flattened, "name")));

  if (!name) {
    return {
      company: null,
      issues: [{
        severity: "error",
        code: "MISSING_NAME",
        message: "Строка пропущена: не удалось определить название компании.",
      }],
    };
  }

  const category = cleanText(toScalarString(pickValue(flattened, "category")));
  const city = cleanText(toScalarString(pickValue(flattened, "city")));
  const address = cleanText(toScalarString(pickValue(flattened, "address")));

  const rawRating = pickValue(flattened, "rating");
  const rawRatingText = cleanText(toScalarString(rawRating));
  let rating = parseOptionalNumber(rawRating);
  if (rawRatingText && rating === null) {
    issues.push({
      severity: "warning",
      code: "INVALID_RATING_FORMAT",
      message: `Рейтинг "${rawRatingText}" не является числом и сохранён как NULL.`,
    });
  } else if (rating !== null && (rating < 0 || rating > 5)) {
    issues.push({
      severity: "warning",
      code: "INVALID_RATING",
      message: `Рейтинг "${toScalarString(rawRating)}" находится вне диапазона 0–5 и сохранён как NULL.`,
    });
    rating = null;
  }

  const rawReviewsCount = pickValue(flattened, "reviewsCount");
  const rawReviewsText = cleanText(toScalarString(rawReviewsCount));
  let reviewsCount = Array.isArray(rawReviewsCount)
    ? rawReviewsCount.length
    : parseOptionalInteger(rawReviewsCount);
  if (rawReviewsText && reviewsCount === null) {
    issues.push({
      severity: "warning",
      code: "INVALID_REVIEWS_COUNT_FORMAT",
      message: `Количество отзывов "${rawReviewsText}" не является целым числом и сохранено как NULL.`,
    });
  } else if (reviewsCount !== null && reviewsCount < 0) {
    issues.push({
      severity: "warning",
      code: "INVALID_REVIEWS_COUNT",
      message: `Количество отзывов "${toScalarString(rawReviewsCount)}" отрицательное и сохранено как NULL.`,
    });
    reviewsCount = null;
  }

  const rawWebsite = cleanText(toScalarString(pickValue(flattened, "website")));
  const normalizedWebsite = normalizeWebsite(rawWebsite);
  if (rawWebsite && !normalizedWebsite) {
    issues.push({
      severity: "warning",
      code: "INVALID_WEBSITE",
      message: `Сайт "${rawWebsite}" не удалось привести к корректному URL.`,
    });
  }

  const rawEmail = cleanText(toScalarString(pickValue(flattened, "email")));
  const normalizedEmail = normalizeEmail(rawEmail);
  if (rawEmail && !isPlausibleEmail(normalizedEmail)) {
    issues.push({
      severity: "warning",
      code: "INVALID_EMAIL",
      message: `Email "${rawEmail}" не прошёл синтаксическую проверку.`,
    });
  } else if (isSuspiciousEmail(normalizedEmail)) {
    issues.push({
      severity: "warning",
      code: "SUSPICIOUS_EMAIL",
      message: `Email "${normalizedEmail}" похож на тестовый, служебный или no-reply адрес.`,
    });
  }

  const rawPhone = cleanText(toScalarString(pickValue(flattened, "phone")));
  const normalizedPhone = normalizePhone(rawPhone);
  if (rawPhone && !normalizedPhone) {
    issues.push({
      severity: "warning",
      code: "INVALID_PHONE",
      message: `Телефон "${rawPhone}" содержит недопустимое количество цифр.`,
    });
  }

  const nameNormalized = normalizeText(name);
  const categoryNormalized = category ? normalizeText(category) : null;
  const cityNormalized = city ? normalizeText(city) : null;
  const emailNormalized =
    normalizedEmail && isPlausibleEmail(normalizedEmail) ? normalizedEmail : null;

  const dedupeKey = createDedupeKey({
    externalId,
    nameNormalized,
    cityNormalized,
    address,
    emailNormalized,
    phoneNormalized: normalizedPhone,
    websiteNormalized: normalizedWebsite?.host ?? null,
  });

  return {
    company: {
      externalId,
      name,
      nameNormalized,
      category,
      categoryNormalized,
      city,
      cityNormalized,
      address,
      rating,
      reviewsCount,
      website: normalizedWebsite?.value ?? null,
      websiteNormalized: normalizedWebsite?.host ?? null,
      email: emailNormalized,
      emailNormalized,
      phone: normalizedPhone ? rawPhone : null,
      phoneNormalized: normalizedPhone,
      sourceFile: context.sourceFile,
      sourcePage: context.sourcePage,
      sourceRow: context.sourceRow,
      dedupeKey,
      rawData: record,
    },
    issues,
  };
}

export const recognizedFieldAliases = new Set(
  Object.values(FIELD_ALIASES).flat().map(normalizeKey),
);

export { normalizeKey };
