import { getLocale, type Locale } from '@/i18n/core';

/**
 * `{{key}}` or `{{key|format}}`, e.g. `{{nama}}`, `{{nominal|rupiah}}`,
 * `{{tanggal|date:dd MMMM yyyy}}`.
 */
const PLACEHOLDER = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;

/** Matches CSV headers and placeholder keys loosely: "Nama Lengkap" ≡ "nama_lengkap". */
export function normalizeKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Distinct placeholders as written (e.g. `{{nominal|rupiah}}`), in order of appearance. */
export function placeholderTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER))
    if (!tokens.includes(match[0])) tokens.push(match[0]);
  return tokens;
}

/** Distinct placeholder keys in a text, in order of appearance (normalized). */
export function placeholderKeys(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const key = normalizeKey(match[1]!);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

const numberLocale = (locale: Locale) => (locale === 'id' ? 'id-ID' : 'en-US');

/**
 * Reads a number written with either decimal convention: "1.250.000", "1,250,000.50",
 * "1250000,5". Returns undefined for anything that is not a number.
 */
export function parseLooseNumber(value: string): number | undefined {
  const cleaned = value.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(cleaned)) return undefined;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = cleaned.split(thousands).join('').replace(decimal, '.');
  } else {
    const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
    if (!separator) normalized = cleaned;
    else {
      const parts = cleaned.split(separator);
      // "1.250.000" or "1.250" (three digits after) are thousands; "1,5" is a decimal.
      const thousands = parts.length > 2 || parts.at(-1)!.length === 3;
      normalized = thousands ? parts.join('') : parts.join('.');
    }
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

/** Reads yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy and dd.mm.yyyy (day first, as on forms). */
export function parseLooseDate(value: string): Date | undefined {
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  let year: number, month: number, day: number;
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
    if (!match) return undefined;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (year < 100) year += 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : undefined;
}

function formatDate(date: Date, pattern: string, locale: Locale) {
  const tag = numberLocale(locale);
  const month = (style: 'long' | 'short') =>
    new Intl.DateTimeFormat(tag, { month: style, timeZone: 'UTC' }).format(date);
  const pad = (value: number) => String(value).padStart(2, '0');
  const tokens: Record<string, () => string> = {
    yyyy: () => String(date.getUTCFullYear()),
    yy: () => String(date.getUTCFullYear()).slice(-2),
    MMMM: () => month('long'),
    MMM: () => month('short'),
    MM: () => pad(date.getUTCMonth() + 1),
    M: () => String(date.getUTCMonth() + 1),
    dd: () => pad(date.getUTCDate()),
    d: () => String(date.getUTCDate()),
  };
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|M|dd|d/g, (token) => tokens[token]!());
}

const ID_UNITS = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];
/** Indonesian amount in words ("terbilang"), as written on financial forms. */
function wordsId(value: number): string {
  if (value < 12) return ID_UNITS[value]!;
  if (value < 20) return `${wordsId(value - 10)} belas`;
  if (value < 100) return `${wordsId(Math.floor(value / 10))} puluh ${wordsId(value % 10)}`.trim();
  if (value < 200) return `seratus ${wordsId(value - 100)}`.trim();
  if (value < 1000)
    return `${wordsId(Math.floor(value / 100))} ratus ${wordsId(value % 100)}`.trim();
  if (value < 2000) return `seribu ${wordsId(value - 1000)}`.trim();
  const scales: [number, string][] = [
    [1e12, 'triliun'],
    [1e9, 'miliar'],
    [1e6, 'juta'],
    [1e3, 'ribu'],
  ];
  for (const [size, name] of scales)
    if (value >= size)
      return `${wordsId(Math.floor(value / size))} ${name} ${wordsId(value % size)}`.trim();
  return '';
}
const EN_UNITS = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
function wordsEn(value: number): string {
  if (value < 20) return EN_UNITS[value]!;
  if (value < 100)
    return `${EN_TENS[Math.floor(value / 10)]}${value % 10 ? `-${EN_UNITS[value % 10]}` : ''}`;
  if (value < 1000)
    return `${EN_UNITS[Math.floor(value / 100)]} hundred ${wordsEn(value % 100)}`.trim();
  const scales: [number, string][] = [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  for (const [size, name] of scales)
    if (value >= size)
      return `${wordsEn(Math.floor(value / size))} ${name} ${wordsEn(value % size)}`.trim();
  return '';
}
const capitalizeWords = (text: string) =>
  text.replace(
    /(^|[\s-])(\p{L})/gu,
    (_, gap: string, letter: string) => gap + letter.toUpperCase(),
  );

/** Supported `|format` names, shown in the merge dialog help. */
export const FORMATS = ['upper', 'lower', 'title', 'number', 'rupiah', 'words', 'date:dd/MM/yyyy'];

/**
 * Applies one `|format` to a value. Unknown formats and values that do not parse
 * (e.g. `rupiah` on "abc") leave the value unchanged.
 */
export function formatValue(value: string, format: string | undefined, locale: Locale) {
  if (!format) return value;
  const [name, ...rest] = format.split(':');
  const argument = rest.join(':');
  switch (name!.trim().toLowerCase()) {
    case 'upper':
      return value.toLocaleUpperCase(numberLocale(locale));
    case 'lower':
      return value.toLocaleLowerCase(numberLocale(locale));
    case 'title':
      return capitalizeWords(value.toLocaleLowerCase(numberLocale(locale)));
    case 'number': {
      const number = parseLooseNumber(value);
      return number === undefined ? value : number.toLocaleString(numberLocale(locale));
    }
    case 'rupiah': {
      const number = parseLooseNumber(value);
      return number === undefined
        ? value
        : `Rp ${number.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
    }
    case 'words': {
      const number = parseLooseNumber(value);
      if (number === undefined || number < 0 || !Number.isInteger(number) || number >= 1e15)
        return value;
      if (number === 0) return locale === 'id' ? 'Nol' : 'Zero';
      return capitalizeWords(locale === 'id' ? wordsId(number) : wordsEn(number));
    }
    case 'date': {
      const date = parseLooseDate(value);
      return date ? formatDate(date, argument || 'dd/MM/yyyy', locale) : value;
    }
    default:
      return value;
  }
}

/**
 * Replaces every placeholder with the row value whose normalized column name matches.
 * Keys with no column are left as written and reported in `missing`.
 */
export function fillPlaceholders(
  text: string,
  row: Record<string, string>,
  locale: Locale = getLocale(),
): { text: string; missing: string[] } {
  const values = new Map(
    Object.entries(row).map(([column, value]) => [normalizeKey(column), value]),
  );
  const missing: string[] = [];
  const filled = text.replace(PLACEHOLDER, (whole, rawKey: string, format?: string) => {
    const key = normalizeKey(rawKey);
    if (!values.has(key)) {
      if (!missing.includes(key)) missing.push(key);
      return whole;
    }
    return formatValue(values.get(key)!, format, locale);
  });
  return { text: filled, missing };
}
