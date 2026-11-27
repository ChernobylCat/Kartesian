/** A parsed CSV file: column names from the first row, then one record per data row. */
export type CsvTable = { columns: string[]; rows: Record<string, string>[]; delimiter: string };

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * Picks the delimiter that splits the header line into the most columns. Excel in
 * Indonesian and many European locales writes ';' instead of ','.
 */
function detectDelimiter(text: string) {
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = splitRecords(header, delimiter)[0]?.length ?? 0;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 records: quoted fields may contain delimiters, quotes ("") and newlines. */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * Parses CSV text (UTF-8, with or without BOM). The first non-empty row names the
 * columns; blank lines are skipped and missing trailing cells become ''.
 */
export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const records = splitRecords(text, delimiter).filter((record) =>
    record.some((cell) => cell.trim() !== ''),
  );
  const [header, ...data] = records;
  if (!header) return { columns: [], rows: [], delimiter };
  const columns = header.map((name, index) => name.trim() || `column_${index + 1}`);
  const unique = columns.map((name, index) =>
    columns.indexOf(name) === index ? name : `${name}_${index + 1}`,
  );
  return {
    columns: unique,
    delimiter,
    rows: data.map((record) =>
      Object.fromEntries(unique.map((name, index) => [name, (record[index] ?? '').trim()])),
    ),
  };
}
