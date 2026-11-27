import { type Paper, paperOf } from './paper';
import {
  type LegacyDocument,
  type LegacyItem,
  type TitleKey,
  TITLE_KEYS,
  parseLegacy,
} from './schema';
import { t } from '@/i18n/core';

export type Item = LegacyItem & {
  id: string;
  assetId?: string;
  legacyIdentity?: Record<string, unknown>;
};
export const ITEM_DEFAULTS = Object.freeze({
  font_family: 'Courier New, Courier, monospace',
  font_size: 10,
  color: '#000000',
  // Legacy documents render text bold unless `bold: false` is stored explicitly.
  bold: true,
} as const);
export const isBold = (item: Pick<Item, 'bold'>) => item.bold ?? ITEM_DEFAULTS.bold;
export type Page = {
  id: string;
  page_number: number;
  items: Item[];
  extra: Record<string, unknown>;
};
export type DocumentEntry = {
  id: string;
  title: string;
  /** JSON key the title was read from, so export writes it back under the same key. */
  legacyKey?: TitleKey;
  pages: Page[];
  extra: Record<string, unknown>;
};
export type DocumentModel = {
  id: string;
  documents: DocumentEntry[];
  /** Sheet size shared by every page. Absent means F4 (see `paperOf`). */
  paper?: Paper;
};
export function createDocumentModel(
  id: string,
  documents: DocumentEntry[],
  paper?: Paper,
): DocumentModel {
  return paper ? { id, documents, paper } : { id, documents };
}
/** Value under the highest-priority title key that is present, if any. */
export function readTitle(entry: Partial<Record<TitleKey, unknown>>): unknown {
  const key = TITLE_KEYS.find((candidate) => entry[candidate] != null);
  return key && entry[key];
}
export function emptyPage(pageNumber: number): Page {
  return { id: uid(), page_number: pageNumber, extra: {}, items: [] };
}
export function emptyDocumentEntry(title: string): DocumentEntry {
  return { id: uid(), title, legacyKey: 'title', extra: {}, pages: [emptyPage(1)] };
}
export type Asset = { id: string; dataUrl: string };
export type Assets = Record<string, Asset>;
export type Settings = {
  offsetX: number;
  offsetY: number;
  overlay: 'none' | 'doc_1' | 'uploaded_pdf';
  overlayVisible: boolean;
  overlayOpacity: number;
  printOverlay: boolean;
  hideCalibration: boolean;
  hideCalibrationPreview: boolean;
  snap: boolean;
  dark: boolean;
};
export const defaultSettings: Settings = {
  offsetX: 0,
  offsetY: 0,
  overlay: 'doc_1',
  overlayVisible: true,
  overlayOpacity: 50,
  printOverlay: false,
  hideCalibration: false,
  hideCalibrationPreview: false,
  snap: true,
  dark: false,
};
export const uid = () => globalThis.crypto.randomUUID();
/** Starter document, titled in the active language. */
export const demo = (): LegacyDocument => [{ title: t('document.new'), pages: [] }];

export function decodeLegacy(
  raw: unknown,
  previous?: DocumentModel,
  existing: Assets = {},
): { document: DocumentModel; assets: Assets } {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      // Allow parseLegacy to throw syntax error
    }
  }
  if (Array.isArray(source)) {
    source = source.map((docEntry, di) => {
      if (docEntry && typeof docEntry === 'object' && !Array.isArray(docEntry)) {
        const entry = docEntry as Record<string, unknown>;
        const label = readTitle(entry);
        if (typeof label !== 'string' || !label.trim())
          return { ...entry, title: t('document.numbered', { number: di + 1 }) };
      }
      return docEntry;
    });
  }
  const data = parseLegacy(source, paperOf(previous ?? {}));
  const assets: Assets = { ...existing };
  const bySource = new Map(Object.values(assets).map((asset) => [asset.dataUrl, asset.id]));
  const signature = (item: LegacyItem) => JSON.stringify(item);
  const old = new Map<string, string[]>();
  const prevDocs = previous?.documents ?? [];
  prevDocs.forEach((docEntry) =>
    docEntry.pages.forEach((page) =>
      page.items.forEach((item) => {
        const external = encodeItem(item, existing);
        const key = signature(external);
        old.set(key, [...(old.get(key) ?? []), item.id]);
      }),
    ),
  );
  const occurrences = new Map<string, number>();
  data.forEach((docEntry) =>
    docEntry.pages.forEach((page) =>
      page.items.forEach((item) => {
        const key = signature(item);
        occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
      }),
    ),
  );
  const documents: DocumentEntry[] = data.map((docEntry, di) => {
    const { pages, ...rest } = docEntry;
    // The first title key present names the document; any other title keys stay in
    // `extra` so they survive a round-trip.
    const legacyKey = TITLE_KEYS.find((key) => rest[key] !== undefined) ?? 'title';
    const { [legacyKey]: title, ...extra } = rest;
    return {
      id: prevDocs[di]?.id ?? uid(),
      title: title ?? t('document.numbered', { number: di + 1 }),
      legacyKey,
      extra,
      pages: pages.map((page, pi) => {
        const { items, page_number, ...pageExtra } = page;
        return {
          id: prevDocs[di]?.pages[pi]?.id ?? uid(),
          page_number,
          extra: pageExtra,
          items: items.map((item) => {
            const ids = old.get(signature(item));
            const id =
              ids?.length === 1 && occurrences.get(signature(item)) === 1 ? ids[0]! : uid();
            const identity: Record<string, unknown> = {};
            for (const key of ['id', 'assetId', 'legacyIdentity'])
              if (Object.prototype.hasOwnProperty.call(item, key)) identity[key] = item[key];
            const legacyIdentity = Object.keys(identity).length ? identity : undefined;
            if (item.type !== 'image') return { ...item, id, assetId: undefined, legacyIdentity };
            let assetId = bySource.get(item.text);
            if (!assetId) {
              assetId = uid();
              assets[assetId] = { id: assetId, dataUrl: item.text };
              bySource.set(item.text, assetId);
            }
            return { ...item, id, assetId, legacyIdentity, text: '' };
          }),
        };
      }),
    };
  });
  const document = createDocumentModel(previous?.id ?? uid(), documents, previous?.paper);
  return { document, assets };
}
export function encodeItem(item: Item, assets: Assets): LegacyItem {
  const { id: _id, assetId, legacyIdentity, ...value } = item;
  if (assetId) {
    const asset = assets[assetId];
    if (!asset) throw new Error(t('error.imageAssetMissing', { id: assetId }));
    value.text = asset.dataUrl;
  }
  return { ...value, ...legacyIdentity };
}
export function encodeLegacy(document: DocumentModel, assets: Assets): LegacyDocument {
  return document.documents.map((docEntry, di) => {
    const title = docEntry.title?.trim() || t('document.numbered', { number: di + 1 });
    return {
      ...docEntry.extra,
      [docEntry.legacyKey ?? 'title']: title,
      pages: docEntry.pages.map((page) => ({
        ...page.extra,
        page_number: page.page_number,
        items: page.items.map((item) => encodeItem(item, assets)),
      })),
    };
  });
}
export function locate(document: DocumentModel, id: string) {
  for (const entry of document.documents)
    for (const page of entry.pages) {
      const item = page.items.find((item) => item.id === id);
      if (item) return { document: entry, page, item };
    }
  return undefined;
}
/**
 * The ids plus every item that shares a group with one of them (groups never span
 * pages), so a group is always selected, moved and formatted as one.
 */
export function expandGroups(document: DocumentModel, ids: readonly string[]): string[] {
  const result = [...ids];
  const seen = new Set(ids);
  for (const id of ids) {
    const found = locate(document, id);
    const group = found?.item.group_id;
    if (!group) continue;
    for (const item of found.page.items)
      if (item.group_id === group && !seen.has(item.id)) {
        seen.add(item.id);
        result.push(item.id);
      }
  }
  return result;
}
export function allItemIds(document: DocumentModel) {
  return new Set(
    document.documents.flatMap((entry) =>
      entry.pages.flatMap((page) => page.items.map((item) => item.id)),
    ),
  );
}
export function validateModel(document: DocumentModel, assets: Assets) {
  parseLegacy(encodeLegacy(document, assets), paperOf(document));
}
