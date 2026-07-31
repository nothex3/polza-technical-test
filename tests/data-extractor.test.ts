import assert from "node:assert/strict";
import test from "node:test";
import { extractCompany, extractRecords } from "@/lib/data-extractor";

test("extractRecords supports nested API wrappers", () => {
  const payload = {
    meta: { page: 1 },
    data: {
      items: [
        { company_name: "Alpha", city: "Москва" },
        { company_name: "Beta", city: "Казань" },
      ],
    },
  };

  assert.equal(extractRecords(payload).length, 2);
});

test("extractCompany maps English aliases and normalizes contacts", () => {
  const result = extractCompany(
    {
      company_name: "  Alpha Studio ",
      category_name: "Маркетинг",
      location: { city: "Москва" },
      rating: "4,8",
      reviews_count: "25",
      website: "https://alpha.example",
      contact: {
        email: "HELLO@ALPHA.EXAMPLE",
        phone: "8 999 000-00-00",
      },
    },
    {
      sourceFile: "page_001.json",
      sourcePage: 1,
      sourceRow: 1,
    },
  );

  if (!result.company) {
    throw new Error("Компания не была извлечена");
  }

  assert.equal(result.company.name, "Alpha Studio");
  assert.equal(result.company.city, "Москва");
  assert.equal(result.company.rating, 4.8);
  assert.equal(result.company.reviewsCount, 25);
  assert.equal(result.company.emailNormalized, "hello@alpha.example");
  assert.equal(result.company.phoneNormalized, "+79990000000");
});

test("extractCompany rejects a row without company name", () => {
  const result = extractCompany(
    { city: "Москва", phone: "+79990000000" },
    { sourceFile: "page_001.json", sourcePage: 1, sourceRow: 2 },
  );

  assert.equal(result.company, null);
  assert.equal(result.issues[0]?.code, "MISSING_NAME");
});
