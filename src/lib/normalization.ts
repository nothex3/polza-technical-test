import { createHash } from "node:crypto";

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}

export function normalizeIdentityText(
  value: string | null | undefined,
): string {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(value: string | null | undefined): string | null {
  const cleaned = (value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

export function toScalarString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return cleanText(String(value));
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    const values = value
      .map(toScalarString)
      .filter((item): item is string => Boolean(item));

    return values.length > 0 ? values.join(", ") : null;
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    for (const key of ["name", "title", "label", "value", "text", "email", "phone", "url"]) {
      const candidate = toScalarString(objectValue[key]);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

export function parseOptionalNumber(value: unknown): number | null {
  const scalar = toScalarString(value);
  if (!scalar) {
    return null;
  }

  const compact = scalar.replace(/\s/g, "");
  if (!/^[-+]?\d+(?:[.,]\d+)?$/.test(compact)) {
    return null;
  }

  const result = Number(compact.replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

export function parseOptionalInteger(value: unknown): number | null {
  const scalar = toScalarString(value);
  if (!scalar) {
    return null;
  }

  const compact = scalar.replace(/\s/g, "");
  if (!/^[-+]?\d+$/.test(compact)) {
    return null;
  }

  const result = Number(compact);
  return Number.isSafeInteger(result) ? result : null;
}

export function normalizeEmail(value: string | null): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const withoutMailto = cleaned.replace(/^mailto:/i, "");
  const firstCandidate = withoutMailto.match(
    /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i,
  )?.[0];

  return firstCandidate ? firstCandidate.toLocaleLowerCase("en-US") : null;
}

export function isPlausibleEmail(value: string | null): boolean {
  if (!value) {
    return false;
  }

  if (value.length > 254 || /[\s\u0400-\u04FF]/u.test(value)) {
    return false;
  }

  const match = value.match(
    /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i,
  );
  if (!match) {
    return false;
  }

  const [, localPart, domain] = match;
  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    domain.split(".").some((part) => part.startsWith("-") || part.endsWith("-"))
  ) {
    return false;
  }

  return true;
}

export function isSuspiciousEmail(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const [localPart = "", domain = ""] = value.split("@");
  const placeholderDomains = new Set([
    "example.com",
    "example.org",
    "example.net",
    "test.com",
    "localhost.local",
  ]);

  return (
    placeholderDomains.has(domain) ||
    /^(test|demo|sample|fake|invalid)([+._-]|$)/i.test(localPart) ||
    /^(no-?reply|donotreply)$/i.test(localPart)
  );
}

export function normalizePhone(value: string | null): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  // Буквы и прочие неожиданные символы нельзя молча отбрасывать:
  // строка "8 (925) abc-12-34" не должна превращаться в валидный телефон.
  if (/[^\d+()\-.\s]/u.test(cleaned)) {
    return null;
  }

  let digits = cleaned.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }

  if (digits.startsWith("7")) {
    return digits.length === 11 ? `+${digits}` : null;
  }

  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return `+${digits}`;
}

export type NormalizedWebsite = {
  value: string;
  host: string;
};

export function normalizeWebsite(value: string | null): NormalizedWebsite | null {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  // Для исходной выгрузки ожидаем явный http/https. Это не позволяет
  // случайно принять "нет сайта" или "htp://..." за корректный URL.
  if (!/^https?:\/\//i.test(cleaned)) {
    return null;
  }

  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");

    if (!host.includes(".") || host.length > 253) {
      return null;
    }

    return {
      value: url.toString(),
      host,
    };
  } catch {
    return null;
  }
}

type DedupeInput = {
  externalId: string | null;
  nameNormalized: string;
  cityNormalized: string | null;
  address: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  websiteNormalized: string | null;
};

export function createDedupeKey(input: DedupeInput): string {
  let identity: string;

  if (input.externalId) {
    identity = `external:${normalizeText(input.externalId)}`;
  } else if (input.emailNormalized) {
    identity = `email:${input.emailNormalized}|name:${input.nameNormalized}`;
  } else if (input.phoneNormalized) {
    identity = `phone:${input.phoneNormalized}|name:${input.nameNormalized}`;
  } else if (input.websiteNormalized) {
    identity = `website:${input.websiteNormalized}|name:${input.nameNormalized}`;
  } else {
    identity = [
      `name:${input.nameNormalized}`,
      `city:${input.cityNormalized ?? ""}`,
      `address:${normalizeText(input.address)}`,
    ].join("|");
  }

  return createHash("sha256").update(identity).digest("hex");
}
