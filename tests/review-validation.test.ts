import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_HEADERS,
  analyzeReviewRows,
  type ReferenceCompany,
} from "@/lib/review-validation";

const references: ReferenceCompany[] = [
  {
    id: 1,
    externalId: "c_000001",
    name: "АО «Орион Групп»",
    category: "IT-интегратор",
    city: "Москва",
    address: "ул. Мира, д. 1",
    rating: 4.5,
    reviewsCount: 20,
    websiteNormalized: "orion.ru",
    phoneNormalized: "+74950000000",
  },
];

function input(lineNumber: number, values: string[]) {
  return {
    lineNumber,
    values,
    raw: Object.fromEntries(REVIEW_HEADERS.map((header, index) => [header, values[index] ?? ""])),
  };
}

test("review validator finds disguised duplicate with another id", () => {
  const analysis = analyzeReviewRows(
    [
      input(2, [
        "c_900006",
        "АО Орион Групп",
        "IT-интегратор",
        "Москва",
        "ул. Мира, д. 1",
        "4.5",
        "20",
        "https://orion.ru",
        "+7 (495) 000-00-00",
      ]),
    ],
    [...REVIEW_HEADERS],
    references,
  );

  const codes = analysis.rows[0]?.issues.map((issue) => issue.code);
  assert.ok(codes?.includes("ID_OUTLIER"));
  assert.ok(codes?.includes("DUPLICATE_OF_BASE_DIFFERENT_ID"));
});

test("review validator does not truncate decimal reviews_count", () => {
  const analysis = analyzeReviewRows(
    [
      input(2, [
        "c_001001",
        "ООО «Тест»",
        "IT-интегратор",
        "Москва",
        "ул. Тестовая, д. 1",
        "4.5",
        "45.5",
        "https://test.ru",
        "+7 (495) 111-11-11",
      ]),
    ],
    [...REVIEW_HEADERS],
    references,
  );

  assert.equal(analysis.rows[0]?.reviewsCount, null);
  assert.ok(
    analysis.rows[0]?.issues.some(
      (issue) => issue.code === "INVALID_REVIEWS_COUNT_FORMAT",
    ),
  );
});
