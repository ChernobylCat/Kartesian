import { type DocumentEntry, type Item, uid } from '../document/model';
import { getLocale, t, type Locale } from '@/i18n/core';
import { fillPlaceholders, normalizeKey, placeholderKeys, placeholderTokens } from './placeholders';

/** Item types whose `text` is user content that may hold placeholders. */
const MERGEABLE = new Set<Item['type']>([undefined, 'text', 'barcode', 'qr']);
const mergeable = (item: Item) => MERGEABLE.has(item.type);

/** Placeholder keys used anywhere in a document, in reading order. */
export function templateKeys(template: DocumentEntry): string[] {
  const keys: string[] = [];
  for (const page of template.pages)
    for (const item of page.items)
      if (mergeable(item))
        for (const key of placeholderKeys(item.text)) if (!keys.includes(key)) keys.push(key);
  return keys;
}

/** Placeholders as written in a document (with their formats), in reading order. */
export function templateTokens(template: DocumentEntry): string[] {
  const tokens: string[] = [];
  for (const page of template.pages)
    for (const item of page.items)
      if (mergeable(item))
        for (const token of placeholderTokens(item.text))
          if (!tokens.includes(token)) tokens.push(token);
  return tokens;
}

/** Which template keys the CSV columns cover, and which columns go unused. */
export function mergeCoverage(template: DocumentEntry, columns: string[]) {
  const keys = templateKeys(template);
  const available = new Set(columns.map(normalizeKey));
  return {
    keys,
    missing: keys.filter((key) => !available.has(key)),
    unused: columns.filter((column) => !keys.includes(normalizeKey(column))),
  };
}

export type MergeOptions = {
  /** Column whose value names each document; falls back to "<template> <n>". */
  titleColumn?: string;
  locale?: Locale;
};

/**
 * One document per row: a copy of the template with fresh ids and every placeholder
 * filled from the row. Images keep pointing at the same assets.
 */
export function mergeRows(
  template: DocumentEntry,
  rows: Record<string, string>[],
  { titleColumn, locale = getLocale() }: MergeOptions = {},
): DocumentEntry[] {
  return rows.map((row, index) => {
    const named = titleColumn ? row[titleColumn]?.trim() : '';
    return {
      ...structuredClone(template),
      id: uid(),
      title: named || t('merge.defaultTitle', { title: template.title, number: index + 1 }),
      pages: template.pages.map((page) => ({
        ...structuredClone(page),
        id: uid(),
        items: page.items.map((item) => ({
          ...structuredClone(item),
          id: uid(),
          legacyIdentity: undefined,
          text: mergeable(item) ? fillPlaceholders(item.text, row, locale).text : item.text,
        })),
      })),
    };
  });
}
