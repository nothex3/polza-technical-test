export type CsvRecord = {
  lineNumber: number;
  values: string[];
};

export type ParsedCsv = {
  headers: string[];
  records: CsvRecord[];
};

/**
 * Небольшой RFC-совместимый парсер CSV для тестовой выгрузки.
 * Поддерживает запятые и переводы строк внутри кавычек, экранирование "",
 * CRLF/LF и сохраняет строки, состоящие только из разделителей.
 */
export function parseCsv(input: string, delimiter = ","): ParsedCsv {
  if (delimiter.length !== 1) {
    throw new Error("CSV delimiter must contain exactly one character.");
  }

  const rows: CsvRecord[] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  const finishField = (): void => {
    currentRow.push(currentField);
    currentField = "";
  };

  const finishRow = (): void => {
    finishField();
    rows.push({ lineNumber: rowStartLine, values: currentRow });
    currentRow = [];
    rowStartLine = lineNumber + 1;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += character;
        if (character === "\n") {
          lineNumber += 1;
        }
      }
      continue;
    }

    if (character === '"' && currentField.length === 0) {
      inQuotes = true;
      continue;
    }

    if (character === delimiter) {
      finishField();
      continue;
    }

    if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
      finishRow();
      lineNumber += 1;
      continue;
    }

    currentField += character;
  }

  if (inQuotes) {
    throw new Error(`Unclosed quoted field starting near line ${rowStartLine}.`);
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    finishRow();
  }

  const [headerRow, ...records] = rows;
  if (!headerRow) {
    return { headers: [], records: [] };
  }

  const headers = headerRow.values.map((value, index) =>
    index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim(),
  );

  return {
    headers,
    records: records.map((record) => ({
      lineNumber: record.lineNumber,
      values: record.values.map((value) => value.trim()),
    })),
  };
}

export function recordToObject(
  headers: string[],
  record: CsvRecord,
): Record<string, string> {
  return Object.fromEntries(
    headers.map((header, index) => [header, record.values[index] ?? ""]),
  );
}
