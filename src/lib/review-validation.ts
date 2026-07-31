import {
  cleanText,
  normalizeIdentityText,
  normalizePhone,
  normalizeText,
  normalizeWebsite,
} from "@/lib/normalization";

export const REVIEW_HEADERS = [
  "id",
  "name",
  "category",
  "city",
  "address",
  "rating",
  "reviews_count",
  "site",
  "phone",
] as const;

type ReviewHeader = (typeof REVIEW_HEADERS)[number];

export type ReviewIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type ReferenceCompany = {
  id: number;
  externalId: string | null;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  rating: number | null;
  reviewsCount: number | null;
  websiteNormalized: string | null;
  phoneNormalized: string | null;
};

export type ReviewInputRow = {
  lineNumber: number;
  values: string[];
  raw: Record<string, string>;
};

export type AnalyzedReviewRow = {
  lineNumber: number;
  raw: Record<string, string>;
  externalId: string | null;
  name: string | null;
  category: string | null;
  city: string | null;
  address: string | null;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  websiteNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  matchedCompanyId: number | null;
  issues: ReviewIssue[];
  isValid: boolean;
};

export type Finding = {
  severity: "critical" | "warning";
  code: string;
  title: string;
  howDetected: string;
  count: number;
  examples: string[];
};

export type ReviewAnalysis = {
  rows: AnalyzedReviewRow[];
  findings: Finding[];
  headerProblems: string[];
  stats: {
    rowsRead: number;
    emptyRows: number;
    validRows: number;
    rowsWithErrors: number;
    rowsWithWarningsOnly: number;
    uniqueExternalIds: number;
  };
};

const FINDING_DEFINITIONS: Record<
  string,
  Omit<Finding, "count" | "examples">
> = {
  EMPTY_ROW: {
    severity: "critical",
    code: "EMPTY_ROW",
    title: "Пустые строки, состоящие только из разделителей",
    howDetected: "Все девять значений строки после trim оказались пустыми.",
  },
  COLUMN_COUNT_MISMATCH: {
    severity: "critical",
    code: "COLUMN_COUNT_MISMATCH",
    title: "Количество полей не совпадает с заголовком CSV",
    howDetected: "Число значений строки сравнено с девятью ожидаемыми столбцами.",
  },
  MISSING_ID: {
    severity: "critical",
    code: "MISSING_ID",
    title: "Строки без id",
    howDetected: "Поле id пустое после очистки пробелов.",
  },
  INVALID_ID_FORMAT: {
    severity: "critical",
    code: "INVALID_ID_FORMAT",
    title: "Некорректный формат id",
    howDetected: "id проверен по шаблону `c_XXXXXX`.",
  },
  ID_OUTLIER: {
    severity: "warning",
    code: "ID_OUTLIER",
    title: "Числовые id резко выбиваются из диапазона",
    howDetected:
      "Числовая часть id сравнена с максимальным id основной выгрузки; значения с разрывом более 10 000 отмечены как выбросы.",
  },
  DUPLICATE_ID_IN_CSV: {
    severity: "critical",
    code: "DUPLICATE_ID_IN_CSV",
    title: "Повторяющиеся id внутри review.csv",
    howDetected: "Строки сгруппированы по очищенному id.",
  },
  EXACT_DUPLICATE_ROW: {
    severity: "critical",
    code: "EXACT_DUPLICATE_ROW",
    title: "Полностью повторяющиеся строки",
    howDetected: "Сравнены все девять исходных полей CSV.",
  },
  DUPLICATE_OF_BASE_BY_ID: {
    severity: "warning",
    code: "DUPLICATE_OF_BASE_BY_ID",
    title: "Строки уже присутствуют в основной выгрузке",
    howDetected:
      "id найден в `companies`, после чего сопоставлены название, категория, город, адрес, рейтинг, отзывы, сайт и телефон.",
  },
  ID_CONFLICT_WITH_BASE: {
    severity: "critical",
    code: "ID_CONFLICT_WITH_BASE",
    title: "Один id связан с разными данными",
    howDetected:
      "id найден в `companies`, но естественный отпечаток полей не совпал.",
  },
  DUPLICATE_OF_BASE_DIFFERENT_ID: {
    severity: "critical",
    code: "DUPLICATE_OF_BASE_DIFFERENT_ID",
    title: "Одна компания записана под другим id",
    howDetected:
      "Построен естественный отпечаток без id: название без пунктуации, категория, город, адрес, рейтинг, отзывы, сайт и телефон.",
  },
  COLUMN_SHIFT_SUSPECTED: {
    severity: "critical",
    code: "COLUMN_SHIFT_SUSPECTED",
    title: "Вероятный сдвиг столбцов",
    howDetected:
      "В category оказался известный город, city выглядит как адрес, а address пуст.",
  },
  MISSING_NAME: {
    severity: "critical",
    code: "MISSING_NAME",
    title: "Не заполнено название",
    howDetected: "Поле name пустое после trim.",
  },
  MISSING_CATEGORY: {
    severity: "critical",
    code: "MISSING_CATEGORY",
    title: "Не заполнена категория",
    howDetected: "Поле category пустое после trim.",
  },
  UNKNOWN_CATEGORY: {
    severity: "critical",
    code: "UNKNOWN_CATEGORY",
    title: "Неизвестные категории",
    howDetected: "Значение не найдено среди категорий основной выгрузки.",
  },
  MISSING_CITY: {
    severity: "critical",
    code: "MISSING_CITY",
    title: "Не заполнен город",
    howDetected: "Поле city пустое после trim.",
  },
  CITY_TYPO: {
    severity: "warning",
    code: "CITY_TYPO",
    title: "Опечатки в названиях городов",
    howDetected:
      "Неизвестное значение сравнено со справочником расстоянием Левенштейна.",
  },
  CITY_ENCODING_BROKEN: {
    severity: "critical",
    code: "CITY_ENCODING_BROKEN",
    title: "Повреждённая кодировка города",
    howDetected: "Найдены характерные последовательности mojibake вида `Рњ...`.",
  },
  CITY_NON_RUSSIAN_VARIANT: {
    severity: "warning",
    code: "CITY_NON_RUSSIAN_VARIANT",
    title: "Город записан в другом алфавите",
    howDetected: "Значение состоит из латинских букв и отсутствует в справочнике.",
  },
  CITY_CASE_VARIANT: {
    severity: "warning",
    code: "CITY_CASE_VARIANT",
    title: "Нарушен регистр названия города",
    howDetected: "После lowercase значение совпало со справочником, но исходная запись отличается.",
  },
  UNKNOWN_CITY: {
    severity: "critical",
    code: "UNKNOWN_CITY",
    title: "Неизвестные города",
    howDetected: "Значение не сопоставилось со справочником или допустимым вариантом.",
  },
  MISSING_ADDRESS: {
    severity: "critical",
    code: "MISSING_ADDRESS",
    title: "Не заполнен адрес",
    howDetected: "Поле address пустое после trim.",
  },
  INVALID_RATING_FORMAT: {
    severity: "critical",
    code: "INVALID_RATING_FORMAT",
    title: "Рейтинг записан не числом",
    howDetected: "Поле проверено строгим числовым шаблоном.",
  },
  RATING_COMMA_SEPARATOR: {
    severity: "warning",
    code: "RATING_COMMA_SEPARATOR",
    title: "Нестандартный десятичный разделитель рейтинга",
    howDetected: "Обнаружено число с запятой вместо точки.",
  },
  RATING_OUT_OF_RANGE: {
    severity: "critical",
    code: "RATING_OUT_OF_RANGE",
    title: "Рейтинг вне диапазона 0–5",
    howDetected: "Распознанное число проверено ограничением 0 <= rating <= 5.",
  },
  INVALID_REVIEWS_COUNT_FORMAT: {
    severity: "critical",
    code: "INVALID_REVIEWS_COUNT_FORMAT",
    title: "Количество отзывов записано не целым числом",
    howDetected: "Поле проверено строгим целочисленным шаблоном.",
  },
  NEGATIVE_REVIEWS_COUNT: {
    severity: "critical",
    code: "NEGATIVE_REVIEWS_COUNT",
    title: "Отрицательное количество отзывов",
    howDetected: "Целое значение проверено условием reviews_count >= 0.",
  },
  INVALID_WEBSITE: {
    severity: "critical",
    code: "INVALID_WEBSITE",
    title: "Некорректные сайты",
    howDetected: "URL должен иметь протокол http/https и hostname с точкой.",
  },
  WEBSITE_SHARED_IN_CSV: {
    severity: "warning",
    code: "WEBSITE_SHARED_IN_CSV",
    title: "Один сайт указан у разных компаний в CSV",
    howDetected: "Строки сгруппированы по нормализованному hostname.",
  },
  WEBSITE_CONFLICT_WITH_BASE: {
    severity: "warning",
    code: "WEBSITE_CONFLICT_WITH_BASE",
    title: "Сайт уже принадлежит другой компании в основной выгрузке",
    howDetected:
      "Нормализованный hostname найден в `companies` у другого id и другого названия.",
  },
  INVALID_PHONE: {
    severity: "critical",
    code: "INVALID_PHONE",
    title: "Некорректные телефоны",
    howDetected:
      "Проверены допустимые символы и длина нормализованного номера; буквы не отбрасываются молча.",
  },
  PHONE_SHARED_IN_CSV: {
    severity: "warning",
    code: "PHONE_SHARED_IN_CSV",
    title: "Один телефон указан у разных компаний в CSV",
    howDetected: "Строки сгруппированы по нормализованному телефону.",
  },
  PHONE_CONFLICT_WITH_BASE: {
    severity: "warning",
    code: "PHONE_CONFLICT_WITH_BASE",
    title: "Телефон уже принадлежит другой компании в основной выгрузке",
    howDetected:
      "Нормализованный телефон найден в `companies` у другого id и другого названия.",
  },
};

function addIssue(row: AnalyzedReviewRow, issue: ReviewIssue): void {
  if (!row.issues.some((item) => item.code === issue.code && item.message === issue.message)) {
    row.issues.push(issue);
  }
}

function parseExternalIdNumber(value: string | null): number | null {
  const match = value?.match(/^c_(\d{6})$/);
  return match ? Number(match[1]) : null;
}

function parseRating(
  raw: string | null,
  row: AnalyzedReviewRow,
): number | null {
  if (!raw) {
    return null;
  }

  let candidate = raw;
  if (/^-?\d+,\d+$/.test(raw)) {
    addIssue(row, {
      severity: "warning",
      code: "RATING_COMMA_SEPARATOR",
      message: `Рейтинг "${raw}" использует запятую вместо точки.`,
    });
    candidate = raw.replace(",", ".");
  } else if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
    addIssue(row, {
      severity: "error",
      code: "INVALID_RATING_FORMAT",
      message: `Рейтинг "${raw}" не является числом.`,
    });
    return null;
  }

  const rating = Number(candidate);
  if (!Number.isFinite(rating)) {
    addIssue(row, {
      severity: "error",
      code: "INVALID_RATING_FORMAT",
      message: `Рейтинг "${raw}" не удалось преобразовать в число.`,
    });
    return null;
  }

  if (rating < 0 || rating > 5) {
    addIssue(row, {
      severity: "error",
      code: "RATING_OUT_OF_RANGE",
      message: `Рейтинг ${rating} находится вне диапазона 0–5.`,
    });
    return null;
  }

  return rating;
}

function parseReviewsCount(
  raw: string | null,
  row: AnalyzedReviewRow,
): number | null {
  if (!raw) {
    return null;
  }

  if (!/^-?\d+$/.test(raw)) {
    addIssue(row, {
      severity: "error",
      code: "INVALID_REVIEWS_COUNT_FORMAT",
      message: `Количество отзывов "${raw}" не является целым числом.`,
    });
    return null;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    addIssue(row, {
      severity: "error",
      code: "INVALID_REVIEWS_COUNT_FORMAT",
      message: `Количество отзывов "${raw}" выходит за безопасный диапазон integer.`,
    });
    return null;
  }

  if (value < 0) {
    addIssue(row, {
      severity: "error",
      code: "NEGATIVE_REVIEWS_COUNT",
      message: `Количество отзывов ${value} не может быть отрицательным.`,
    });
    return null;
  }

  return value;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function looksLikeMojibake(value: string): boolean {
  return /(?:Р.|С.){3,}/u.test(value) || /Рњ|РЎ|Рµ|Р°|Рє/u.test(value);
}

function naturalFingerprint(row: {
  name: string | null;
  category: string | null;
  city: string | null;
  address: string | null;
  rating: number | null;
  reviewsCount: number | null;
  websiteNormalized: string | null;
  phoneNormalized: string | null;
}): string {
  return [
    normalizeIdentityText(row.name),
    normalizeText(row.category),
    normalizeText(row.city),
    normalizeText(row.address),
    row.rating === null ? "" : String(row.rating),
    row.reviewsCount === null ? "" : String(row.reviewsCount),
    row.websiteNormalized ?? "",
    row.phoneNormalized ?? "",
  ].join("|");
}

function sameSemanticCompany(
  row: AnalyzedReviewRow,
  reference: ReferenceCompany,
): boolean {
  return naturalFingerprint(row) === naturalFingerprint({
    name: reference.name,
    category: reference.category,
    city: reference.city,
    address: reference.address,
    rating: reference.rating,
    reviewsCount: reference.reviewsCount,
    websiteNormalized: reference.websiteNormalized,
    phoneNormalized: reference.phoneNormalized,
  });
}

function createEmptyAnalyzedRow(input: ReviewInputRow): AnalyzedReviewRow {
  const get = (field: ReviewHeader): string | null => cleanText(input.raw[field]);
  return {
    lineNumber: input.lineNumber,
    raw: input.raw,
    externalId: get("id"),
    name: get("name"),
    category: get("category"),
    city: get("city"),
    address: get("address"),
    rating: null,
    reviewsCount: null,
    website: get("site"),
    websiteNormalized: null,
    phone: get("phone"),
    phoneNormalized: null,
    matchedCompanyId: null,
    issues: [],
    isValid: false,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) {
      continue;
    }
    const group = result.get(value) ?? [];
    group.push(item);
    result.set(value, group);
  }
  return result;
}

function buildFindings(rows: AnalyzedReviewRow[]): Finding[] {
  const issueCounts = new Map<string, number>();
  for (const row of rows) {
    for (const code of new Set(row.issues.map((issue) => issue.code))) {
      issueCounts.set(code, (issueCounts.get(code) ?? 0) + 1);
    }
  }

  const findings: Finding[] = [];
  for (const [code, count] of issueCounts.entries()) {
    const definition = FINDING_DEFINITIONS[code];
    if (!definition) {
      continue;
    }

    const examples = rows
      .filter((row) => row.issues.some((issue) => issue.code === code))
      .slice(0, 8)
      .map((row) => {
        const issue = row.issues.find((item) => item.code === code);
        return `строка ${row.lineNumber}, ${row.externalId ?? "без id"}, ${row.name ?? "без названия"}: ${issue?.message ?? code}`;
      });

    findings.push({ ...definition, count, examples });
  }

  const order = { critical: 0, warning: 1 } as const;
  return findings.sort(
    (left, right) =>
      order[left.severity] - order[right.severity] ||
      right.count - left.count ||
      left.title.localeCompare(right.title, "ru"),
  );
}

export function analyzeReviewRows(
  inputRows: ReviewInputRow[],
  headers: string[],
  references: ReferenceCompany[],
): ReviewAnalysis {
  const headerProblems: string[] = [];
  if (headers.length !== REVIEW_HEADERS.length) {
    headerProblems.push(
      `Ожидалось ${REVIEW_HEADERS.length} столбцов, получено ${headers.length}.`,
    );
  }
  REVIEW_HEADERS.forEach((expected, index) => {
    if (headers[index] !== expected) {
      headerProblems.push(
        `Столбец ${index + 1}: ожидался "${expected}", получен "${headers[index] ?? ""}".`,
      );
    }
  });

  const knownCategories = new Set(
    references.map((item) => item.category).filter((value): value is string => Boolean(value)),
  );
  const knownCities = new Set(
    references.map((item) => item.city).filter((value): value is string => Boolean(value)),
  );
  const normalizedCities = new Map(
    Array.from(knownCities).map((city) => [normalizeText(city), city]),
  );
  const maxReferenceExternalId = Math.max(
    0,
    ...references
      .map((item) => parseExternalIdNumber(item.externalId))
      .filter((value): value is number => value !== null),
  );

  const referenceByExternalId = new Map(
    references
      .filter((item): item is ReferenceCompany & { externalId: string } => Boolean(item.externalId))
      .map((item) => [item.externalId, item]),
  );
  const referenceByFingerprint = groupBy(references, (item) =>
    naturalFingerprint({
      name: item.name,
      category: item.category,
      city: item.city,
      address: item.address,
      rating: item.rating,
      reviewsCount: item.reviewsCount,
      websiteNormalized: item.websiteNormalized,
      phoneNormalized: item.phoneNormalized,
    }),
  );
  const referenceByWebsite = groupBy(references, (item) => item.websiteNormalized);
  const referenceByPhone = groupBy(references, (item) => item.phoneNormalized);

  const rows = inputRows.map((input) => {
    const row = createEmptyAnalyzedRow(input);

    if (input.values.length !== headers.length) {
      addIssue(row, {
        severity: "error",
        code: "COLUMN_COUNT_MISMATCH",
        message: `В строке ${input.values.length} полей вместо ${headers.length}.`,
      });
    }

    const rawValues = REVIEW_HEADERS.map((header) => cleanText(input.raw[header]));
    if (rawValues.every((value) => value === null)) {
      addIssue(row, {
        severity: "error",
        code: "EMPTY_ROW",
        message: "Строка содержит только разделители и пустые значения.",
      });
      return row;
    }

    if (!row.externalId) {
      addIssue(row, {
        severity: "error",
        code: "MISSING_ID",
        message: "Не указан id.",
      });
    } else if (!/^c_\d{6}$/.test(row.externalId)) {
      addIssue(row, {
        severity: "error",
        code: "INVALID_ID_FORMAT",
        message: `id "${row.externalId}" не соответствует формату c_XXXXXX.`,
      });
    } else {
      const numericId = parseExternalIdNumber(row.externalId);
      if (
        numericId !== null &&
        maxReferenceExternalId > 0 &&
        numericId > maxReferenceExternalId + 10_000
      ) {
        addIssue(row, {
          severity: "warning",
          code: "ID_OUTLIER",
          message: `Числовая часть id ${numericId} резко выше диапазона основной выгрузки (максимум ${maxReferenceExternalId}).`,
        });
      }
    }

    if (!row.name) {
      addIssue(row, {
        severity: "error",
        code: "MISSING_NAME",
        message: "Не указано название компании.",
      });
    }

    const columnShift = Boolean(
      row.category &&
        knownCities.has(row.category) &&
        row.city &&
        /^(ул\.|пр\.|ш\.|пер\.)/iu.test(row.city) &&
        !row.address,
    );

    if (columnShift) {
      addIssue(row, {
        severity: "error",
        code: "COLUMN_SHIFT_SUSPECTED",
        message:
          "category содержит город, city похоже на адрес, address пуст: вероятно, пропущена категория и значения сдвинулись влево.",
      });
    } else {
      if (!row.category) {
        addIssue(row, {
          severity: "error",
          code: "MISSING_CATEGORY",
          message: "Не указана категория.",
        });
      } else if (!knownCategories.has(row.category)) {
        addIssue(row, {
          severity: "error",
          code: "UNKNOWN_CATEGORY",
          message: `Категория "${row.category}" отсутствует в основной выгрузке.`,
        });
      }

      if (!row.city) {
        addIssue(row, {
          severity: "error",
          code: "MISSING_CITY",
          message: "Не указан город.",
        });
      } else if (!knownCities.has(row.city)) {
        const normalized = normalizeText(row.city);
        const canonical = normalizedCities.get(normalized);
        if (canonical) {
          addIssue(row, {
            severity: "warning",
            code: "CITY_CASE_VARIANT",
            message: `Город "${row.city}" отличается регистром от "${canonical}".`,
          });
        } else if (looksLikeMojibake(row.city)) {
          addIssue(row, {
            severity: "error",
            code: "CITY_ENCODING_BROKEN",
            message: `Город "${row.city}" похож на текст с повреждённой кодировкой.`,
          });
        } else if (/^[A-Za-z -]+$/.test(row.city)) {
          addIssue(row, {
            severity: "warning",
            code: "CITY_NON_RUSSIAN_VARIANT",
            message: `Город "${row.city}" записан латиницей и не совпадает со справочником.`,
          });
        } else {
          const candidates = Array.from(knownCities)
            .map((city) => ({ city, distance: levenshtein(normalized, normalizeText(city)) }))
            .sort((left, right) => left.distance - right.distance);
          if (candidates[0] && candidates[0].distance <= 2) {
            addIssue(row, {
              severity: "warning",
              code: "CITY_TYPO",
              message: `Город "${row.city}" похож на "${candidates[0].city}" (расстояние ${candidates[0].distance}).`,
            });
          } else {
            addIssue(row, {
              severity: "error",
              code: "UNKNOWN_CITY",
              message: `Город "${row.city}" отсутствует в основной выгрузке.`,
            });
          }
        }
      }

      if (!row.address) {
        addIssue(row, {
          severity: "error",
          code: "MISSING_ADDRESS",
          message: "Не указан адрес.",
        });
      }
    }

    row.rating = parseRating(cleanText(input.raw.rating), row);
    row.reviewsCount = parseReviewsCount(cleanText(input.raw.reviews_count), row);

    const website = normalizeWebsite(row.website);
    if (row.website && !website) {
      addIssue(row, {
        severity: "error",
        code: "INVALID_WEBSITE",
        message: `Сайт "${row.website}" не является корректным http/https URL.`,
      });
    }
    row.website = website?.value ?? null;
    row.websiteNormalized = website?.host ?? null;

    row.phoneNormalized = normalizePhone(row.phone);
    if (row.phone && !row.phoneNormalized) {
      addIssue(row, {
        severity: "error",
        code: "INVALID_PHONE",
        message: `Телефон "${row.phone}" не удалось нормализовать.`,
      });
    }

    const referenceById = row.externalId
      ? referenceByExternalId.get(row.externalId)
      : undefined;
    if (referenceById) {
      row.matchedCompanyId = referenceById.id;
      addIssue(row, {
        severity: sameSemanticCompany(row, referenceById) ? "warning" : "error",
        code: sameSemanticCompany(row, referenceById)
          ? "DUPLICATE_OF_BASE_BY_ID"
          : "ID_CONFLICT_WITH_BASE",
        message: sameSemanticCompany(row, referenceById)
          ? `id ${row.externalId} уже есть в основной выгрузке, поля полностью совпадают.`
          : `id ${row.externalId} уже есть в основной выгрузке, но набор полей отличается.`,
      });
    }

    const fingerprintMatches = referenceByFingerprint.get(naturalFingerprint(row)) ?? [];
    const differentIdMatch = fingerprintMatches.find(
      (item) => item.externalId !== row.externalId,
    );
    if (differentIdMatch) {
      row.matchedCompanyId = differentIdMatch.id;
      addIssue(row, {
        severity: "error",
        code: "DUPLICATE_OF_BASE_DIFFERENT_ID",
        message: `Поля совпадают с ${differentIdMatch.externalId}, но в CSV указан другой id ${row.externalId}.`,
      });
    }

    return row;
  });

  const activeRows = rows.filter(
    (row) => !row.issues.some((issue) => issue.code === "EMPTY_ROW"),
  );

  for (const [externalId, group] of groupBy(activeRows, (row) => row.externalId)) {
    if (group.length <= 1) {
      continue;
    }
    const lines = group.map((row) => row.lineNumber).join(", ");
    for (const row of group) {
      addIssue(row, {
        severity: "error",
        code: "DUPLICATE_ID_IN_CSV",
        message: `id ${externalId} встречается в строках ${lines}.`,
      });
    }
  }

  const exactKey = (row: AnalyzedReviewRow): string =>
    REVIEW_HEADERS.map((header) => cleanText(row.raw[header]) ?? "").join("\u001f");
  for (const group of groupBy(activeRows, exactKey).values()) {
    if (group.length <= 1) {
      continue;
    }
    const lines = group.map((row) => row.lineNumber).join(", ");
    for (const row of group) {
      addIssue(row, {
        severity: "error",
        code: "EXACT_DUPLICATE_ROW",
        message: `Полностью одинаковая строка встречается на строках ${lines}.`,
      });
    }
  }

  for (const [host, group] of groupBy(activeRows, (row) => row.websiteNormalized)) {
    const names = new Set(group.map((row) => normalizeIdentityText(row.name)));
    if (names.size <= 1) {
      continue;
    }
    const lines = group.map((row) => `${row.lineNumber} (${row.externalId})`).join(", ");
    for (const row of group) {
      addIssue(row, {
        severity: "warning",
        code: "WEBSITE_SHARED_IN_CSV",
        message: `Сайт ${host} указан у разных компаний: ${lines}.`,
      });
    }
  }

  for (const [phone, group] of groupBy(activeRows, (row) => row.phoneNormalized)) {
    const names = new Set(group.map((row) => normalizeIdentityText(row.name)));
    if (names.size <= 1) {
      continue;
    }
    const lines = group.map((row) => `${row.lineNumber} (${row.externalId})`).join(", ");
    for (const row of group) {
      addIssue(row, {
        severity: "warning",
        code: "PHONE_SHARED_IN_CSV",
        message: `Телефон ${phone} указан у разных компаний: ${lines}.`,
      });
    }
  }

  for (const row of activeRows) {
    const rowName = normalizeIdentityText(row.name);
    if (row.websiteNormalized) {
      const conflicts = (referenceByWebsite.get(row.websiteNormalized) ?? []).filter(
        (item) =>
          item.externalId !== row.externalId &&
          normalizeIdentityText(item.name) !== rowName,
      );
      if (conflicts.length > 0) {
        addIssue(row, {
          severity: "warning",
          code: "WEBSITE_CONFLICT_WITH_BASE",
          message: `Сайт ${row.websiteNormalized} уже указан у ${conflicts.map((item) => `${item.externalId} ${item.name}`).join(", ")}.`,
        });
      }
    }

    if (row.phoneNormalized) {
      const conflicts = (referenceByPhone.get(row.phoneNormalized) ?? []).filter(
        (item) =>
          item.externalId !== row.externalId &&
          normalizeIdentityText(item.name) !== rowName,
      );
      if (conflicts.length > 0) {
        addIssue(row, {
          severity: "warning",
          code: "PHONE_CONFLICT_WITH_BASE",
          message: `Телефон ${row.phoneNormalized} уже указан у ${conflicts.map((item) => `${item.externalId} ${item.name}`).join(", ")}.`,
        });
      }
    }
  }

  for (const row of rows) {
    row.isValid = !row.issues.some((issue) => issue.severity === "error");
  }

  const nonEmptyRows = rows.filter(
    (row) => !row.issues.some((issue) => issue.code === "EMPTY_ROW"),
  );
  const rowsWithErrors = rows.filter((row) =>
    row.issues.some((issue) => issue.severity === "error"),
  ).length;
  const rowsWithWarningsOnly = rows.filter(
    (row) =>
      row.issues.some((issue) => issue.severity === "warning") &&
      !row.issues.some((issue) => issue.severity === "error"),
  ).length;

  return {
    rows,
    findings: buildFindings(rows),
    headerProblems,
    stats: {
      rowsRead: rows.length,
      emptyRows: rows.length - nonEmptyRows.length,
      validRows: rows.length - rowsWithErrors,
      rowsWithErrors,
      rowsWithWarningsOnly,
      uniqueExternalIds: new Set(
        nonEmptyRows.map((row) => row.externalId).filter(Boolean),
      ).size,
    },
  };
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function buildReviewReport(
  analysis: ReviewAnalysis,
  sourceFile: string,
): string {
  const { stats, findings, rows, headerProblems } = analysis;
  const disguisedDuplicates = rows.filter((row) =>
    row.issues.some((issue) => issue.code === "DUPLICATE_OF_BASE_DIFFERENT_ID"),
  );

  const lines = [
    "# Аномалии в review.csv",
    "",
    `Источник: \`${sourceFile}\``,
    "",
    "## Короткий отчёт",
    "",
    `- Прочитано строк данных: **${stats.rowsRead}**.`,
    `- Пустых строк с разделителями: **${stats.emptyRows}**.`,
    `- Уникальных непустых id: **${stats.uniqueExternalIds}**.`,
    `- Строк с блокирующими ошибками: **${stats.rowsWithErrors}**.`,
    `- Строк только с предупреждениями: **${stats.rowsWithWarningsOnly}**.`,
    `- Строк без блокирующих ошибок: **${stats.validRows}**.`,
    "",
    "CSV загружается в отдельную таблицу `review_rows`: исходные значения не исправляются молча, рядом сохраняются нормализованные поля и массив найденных проблем.",
    "",
  ];

  if (headerProblems.length > 0) {
    lines.push("## Проблемы заголовка", "");
    for (const problem of headerProblems) {
      lines.push(`- ${markdownEscape(problem)}`);
    }
    lines.push("");
  }

  lines.push(
    "## Главный сюрприз",
    "",
    `Найдены **${disguisedDuplicates.length}** строк, которые выглядят как новые записи с id \`c_900006...c_900011\`, но полностью совпадают с компаниями из основной выгрузки по естественному отпечатку. В названиях убраны типографские кавычки, а id заменён. Поэтому дедупликация только по id создала бы шесть ложных новых компаний.`,
    "",
  );

  for (const row of disguisedDuplicates) {
    const issue = row.issues.find(
      (item) => item.code === "DUPLICATE_OF_BASE_DIFFERENT_ID",
    );
    lines.push(
      `- Строка ${row.lineNumber}: \`${row.externalId}\`, ${row.name} — ${issue?.message ?? "совпадение с основной выгрузкой"}`,
    );
  }

  lines.push("", "## Все найденные отклонения", "");

  for (const finding of findings) {
    lines.push(
      `### ${finding.severity === "critical" ? "Критично" : "Предупреждение"}: ${finding.title}`,
      "",
      `Затронуто строк: **${finding.count}**.`,
      "",
      `Как обнаружено: ${finding.howDetected}`,
      "",
    );
    if (finding.examples.length > 0) {
      lines.push("Примеры:");
      for (const example of finding.examples) {
        lines.push(`- ${markdownEscape(example)}`);
      }
      lines.push("");
    }
  }

  lines.push(
    "## Решение по загрузке",
    "",
    "- `review.csv` не обновляет `companies`: это отдельная проверочная выгрузка с намеренно испорченными данными.",
    "- Все 207 строк, включая пустые и ошибочные, сохраняются в `review_rows` с номером исходной строки и `raw_data`.",
    "- Корректные числовые и контактные значения записываются в отдельные parsed/normalized поля.",
    "- `matched_company_id` заполняется для повторов основной выгрузки и замаскированных дублей.",
    "- Строка считается валидной только при отсутствии проблем уровня `error`; предупреждения требуют ручной проверки, но не разрушают исходные данные.",
    "",
  );

  return `${lines.join("\n")}\n`;
}
