import assert from "node:assert/strict";
import test from "node:test";
import {
  createDedupeKey,
  isPlausibleEmail,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  normalizeWebsite,
} from "@/lib/normalization";

test("normalizeText removes duplicate whitespace and normalizes ё", () => {
  assert.equal(normalizeText("  Ёлка\u00a0  Сервис "), "елка сервис");
});

test("normalizeEmail extracts first email and lowercases it", () => {
  assert.equal(
    normalizeEmail("mailto:Sales@Example.RU; backup@example.ru"),
    "sales@example.ru",
  );
});

test("email validation rejects malformed values", () => {
  assert.equal(isPlausibleEmail("sales@example.ru"), true);
  assert.equal(isPlausibleEmail("bad@@example.ru"), false);
  assert.equal(isPlausibleEmail("почта@example.ru"), false);
});

test("normalizePhone converts Russian 8 prefix and rejects letters", () => {
  assert.equal(normalizePhone("8 (921) 555-12-34"), "+79215551234");
  assert.equal(normalizePhone("8 (925) abc-12-34"), null);
  assert.equal(normalizePhone("+7"), null);
});

test("normalizeWebsite accepts only explicit http/https URLs", () => {
  assert.deepEqual(normalizeWebsite("https://www.Example.ru/path"), {
    value: "https://www.example.ru/path",
    host: "example.ru",
  });
  assert.equal(normalizeWebsite("www.example.ru/path"), null);
  assert.equal(normalizeWebsite("нет сайта"), null);
});

test("dedupe key is stable for the same identity", () => {
  const input = {
    externalId: null,
    nameNormalized: "пример",
    cityNormalized: "санкт-петербург",
    address: "Невский проспект, 1",
    emailNormalized: "info@example.ru",
    phoneNormalized: "+78120000000",
    websiteNormalized: "example.ru",
  };

  assert.equal(createDedupeKey(input), createDedupeKey({ ...input }));
  assert.equal(createDedupeKey(input).length, 64);
});
