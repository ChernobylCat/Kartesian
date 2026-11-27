import { type LegacyDocument, type LegacyItem, parseLegacy } from './schema';

export type Item = LegacyItem & {
  id: string;
  assetId?: string;
  legacyIdentity?: Record<string, unknown>;
};
export type Page = {
  id: string;
  page_number: number;
  items: Item[];
  extra: Record<string, unknown>;
};
export type DocumentEntry = {
  id: string;
  title: string;
  debitur?: string;
  legacyKey?: 'title' | 'debitur';
  pages: Page[];
  extra: Record<string, unknown>;
};
export type Debtor = DocumentEntry;
export type DocumentModel = { id: string; debtors: DocumentEntry[] };
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
export const demo: LegacyDocument = [
  {
    title: 'Dokumen Baru',
    pages: [],
  },
];

export function decodeLegacy(
  raw: unknown,
  previous?: DocumentModel,
  existing: Assets = {},
): { document: DocumentModel; assets: Assets } {
  const data = parseLegacy(raw);
  const assets: Assets = { ...existing };
  const bySource = new Map(Object.values(assets).map((asset) => [asset.dataUrl, asset.id]));
  const signature = (item: LegacyItem) => JSON.stringify(item);
  const old = new Map<string, string[]>();
  if (previous)
    previous.debtors.forEach((docEntry) =>
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
  const document: DocumentModel = {
    id: previous?.id ?? uid(),
    debtors: data.map((docEntry, di) => {
      const { pages, debitur: legacyDebitur, title, ...extra } = docEntry;
      const resolved = title ?? legacyDebitur ?? `Dokumen ${di + 1}`;
      const legacyKey =
        title !== undefined ? 'title' : legacyDebitur !== undefined ? 'debitur' : 'title';
      return {
        id: previous?.debtors[di]?.id ?? uid(),
        title: resolved,
        debitur: resolved,
        legacyKey,
        extra,
        pages: pages.map((page, pi) => {
          const { items, page_number, ...pageExtra } = page;
          return {
            id: previous?.debtors[di]?.pages[pi]?.id ?? uid(),
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
    }),
  };
  return { document, assets };
}
export function encodeItem(item: Item, assets: Assets): LegacyItem {
  const { id: _id, assetId, legacyIdentity, ...value } = item;
  if (assetId) {
    const asset = assets[assetId];
    if (!asset) throw new Error(`Aset gambar ${assetId} tidak ditemukan.`);
    value.text = asset.dataUrl;
  }
  return { ...value, ...legacyIdentity };
}
export function encodeLegacy(document: DocumentModel, assets: Assets): LegacyDocument {
  return document.debtors.map((docEntry) => {
    const key = docEntry.legacyKey === 'debitur' ? 'debitur' : 'title';
    const nameField = { [key]: docEntry.title };
    return {
      ...docEntry.extra,
      ...nameField,
      pages: docEntry.pages.map((page) => ({
        ...page.extra,
        page_number: page.page_number,
        items: page.items.map((item) => encodeItem(item, assets)),
      })),
    };
  });
}
export function locate(document: DocumentModel, id: string) {
  for (const docEntry of document.debtors)
    for (const page of docEntry.pages) {
      const item = page.items.find((item) => item.id === id);
      if (item) return { debtor: docEntry, docEntry, entry: docEntry, page, item };
    }
  return undefined;
}
export function validateModel(document: DocumentModel, assets: Assets) {
  parseLegacy(encodeLegacy(document, assets));
}
