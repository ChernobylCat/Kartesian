import { z } from 'zod';
import {
  decodeLegacy,
  demo,
  type Assets,
  type DocumentEntry,
  type DocumentModel,
  validateModel,
  uid,
  defaultSettings,
  emptyDocumentEntry,
  emptyPage,
  encodeLegacy,
} from '@/domain/document/model';
import { imageSource, LIMITS, TITLE_KEYS } from '@/domain/document/schema';
import { DETECTOR_SPACE } from '@/domain/document/background';
import { paperSchema } from '@/domain/document/paper';
import {
  emptyPdf,
  type PdfData,
  type Workspace,
  type WorkspaceRepository,
} from '@/application/ports';
import {
  settingsSchema,
  readLegacySettings,
  writeLegacySettings,
  LEGACY_SETTINGS_KEY,
  LEGACY_THEME_KEY,
} from '../serialization/settings';
import { t } from '@/i18n/core';

export const DB_NAME = 'KartesianWorkspaceDB';
export const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(t('error.transactionAborted')));
  });
export function openDatabase(name: string, version?: number, upgrade?: (db: IDBDatabase) => void) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
    let failed = false;
    req.onupgradeneeded = () => upgrade?.(req.result);
    req.onblocked = () => {
      failed = true;
      reject(new Error(t('error.databaseBlocked')));
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      if (failed) {
        req.result.close();
        return;
      }
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
  });
}
export const candidateSchema = z.object({
  id: z.string(),
  pageNumber: z.number().int().min(1).max(100),
  source: z.string(),
  label: z.string().max(120),
  key: z.string(),
  placeholder: z.string(),
  x: z.number().finite().min(0).max(DETECTOR_SPACE.width),
  y: z.number().finite().min(0).max(DETECTOR_SPACE.height),
  width: z.number().finite().positive().max(DETECTOR_SPACE.width),
  height: z.number().finite().positive().max(DETECTOR_SPACE.height),
  confidence: z.number().min(0).max(1),
});
/**
 * Builds up to commit 6cb21b9 stored the document list under this key and read nothing
 * else. Stored records and backups keep a copy there so a rollback can still open them,
 * and records that only have this key are still read.
 */
const LEGACY_DOCUMENTS_KEY = 'debtors';
type StoredDocument = Partial<DocumentModel> & {
  id: string;
  [LEGACY_DOCUMENTS_KEY]?: DocumentEntry[];
};
/** Document entries of a stored record, whichever key it was written under. */
function storedEntries(document: StoredDocument): DocumentEntry[] {
  return document.documents ?? document[LEGACY_DOCUMENTS_KEY] ?? [];
}
/** The shape written to IndexedDB and backups: the model plus the rollback copy. */
export function toStoredDocument(document: DocumentModel): StoredDocument {
  return { ...document, [LEGACY_DOCUMENTS_KEY]: document.documents };
}
/**
 * Older records also copied the title into another title key on each entry. Keep the
 * first non-blank one as `title` and drop the copies.
 */
function normalizeEntry(entry: DocumentEntry, index: number): DocumentEntry {
  const copy: Record<string, unknown> = { ...entry };
  const title = TITLE_KEYS.map((key) => copy[key]).find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  for (const key of TITLE_KEYS) if (key !== 'title') delete copy[key];
  return {
    ...(copy as DocumentEntry),
    title: title?.trim() || t('document.numbered', { number: index + 1 }),
    legacyKey: entry.legacyKey ?? 'title',
  };
}
const documentStructure = z
  .object({
    id: z.string().min(1),
    documents: z
      .array(
        z.object({
          id: z.string().min(1),
          ...Object.fromEntries(TITLE_KEYS.map((key) => [key, z.string().optional()])),
          extra: z.record(z.string(), z.unknown()),
          pages: z.array(
            z.object({
              id: z.string().min(1),
              page_number: z.number(),
              extra: z.record(z.string(), z.unknown()),
              items: z.array(z.object({ id: z.string().min(1) }).passthrough()),
            }),
          ),
        }),
      )
      .optional(),
    [LEGACY_DOCUMENTS_KEY]: z.array(z.unknown()).optional(),
    paper: paperSchema.optional(),
  })
  .passthrough();

export function assertWorkspace(raw: Workspace): Workspace {
  if (raw.schemaVersion !== 2) throw new Error(t('error.workspaceVersion'));
  const { [LEGACY_DOCUMENTS_KEY]: _rollbackCopy, ...document } = raw.document as StoredDocument;
  const entries = storedEntries(raw.document as StoredDocument);
  documentStructure.parse({ ...document, documents: entries });
  raw = { ...raw, document: { ...document, documents: entries.map(normalizeEntry) } };
  settingsSchema.parse(raw.settings);
  const seen = new Set<string>();
  const unique = (id: string) => {
    if (seen.has(id)) throw new Error(t('error.workspaceDuplicateId'));
    seen.add(id);
  };
  unique(raw.document.id);
  raw.document.documents.forEach((docEntry) => {
    unique(docEntry.id);
    docEntry.pages.forEach((page) => {
      unique(page.id);
      page.items.forEach((item) => unique(item.id));
    });
  });
  for (const [id, asset] of Object.entries(raw.assets))
    if (
      id !== asset.id ||
      !imageSource.test(asset.dataUrl) ||
      asset.dataUrl.length > LIMITS.imageBytes * 1.5
    )
      throw new Error(t('error.workspaceAsset'));
  validateModel(raw.document, raw.assets);
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0)
    throw new Error(t('error.workspaceRevision'));
  if (
    !Array.isArray(raw.pdf.pages) ||
    raw.pdf.pages.length > LIMITS.pdfPages ||
    raw.pdf.pages.some((page) => !imageSource.test(page))
  )
    throw new Error(t('error.pdfPagesInvalid'));
  if (raw.pdf.bytes && raw.pdf.bytes.byteLength > LIMITS.pdfBytes)
    throw new Error(t('error.pdfTooLarge'));
  z.array(candidateSchema).max(LIMITS.total).parse(raw.pdf.candidates);
  return raw;
}
export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export function dataUrlBlob(url: string) {
  const [prefix, body] = url.split(',');
  if (!prefix || !body) throw new Error(t('error.base64Asset'));
  const data = atob(body.replace(/\s/g, ''));
  const bytes = Uint8Array.from(data, (ch) => ch.charCodeAt(0));
  return new Blob([bytes], { type: prefix.slice(5, prefix.indexOf(';')) });
}
type Stored = Omit<Workspace, 'assets'> & {
  id: 'active';
  storageVersion: number;
  assetIds: string[];
};
type StoredAsset = { id: string; blob?: Blob; bytes?: ArrayBuffer; mimeType?: string };
/** Raw stored state for recovery; assets that cannot be decoded are skipped. */
export type RawWorkspace = { stored: Stored; assets: Assets };
type RawWorkspaceSource = WorkspaceRepository & { loadRaw(): Promise<RawWorkspace | null> };
const hasRawAccess = (repository: WorkspaceRepository): repository is RawWorkspaceSource =>
  typeof (repository as Partial<RawWorkspaceSource>).loadRaw === 'function';

export function referencedAssetIds(document: DocumentModel) {
  return new Set(
    document.documents.flatMap((entry) =>
      entry.pages.flatMap((page) =>
        page.items.flatMap((item) => (item.assetId ? [item.assetId] : [])),
      ),
    ),
  );
}
const storedAssetDataUrl = (asset: StoredAsset) =>
  blobDataUrl(asset.blob ?? new Blob([asset.bytes!], { type: asset.mimeType }));
export class IndexedWorkspaceRepository implements WorkspaceRepository {
  private connection: Promise<IDBDatabase> | null = null;
  private storageVersion = 0;
  private database() {
    return (this.connection ??= openDatabase(DB_NAME, 1, (db) => {
      db.createObjectStore('workspaces', { keyPath: 'id' });
      db.createObjectStore('assets', { keyPath: 'id' });
    }));
  }
  /** Reads the active record and its asset rows in one transaction. */
  private async readRecords() {
    const db = await this.database();
    const tx = db.transaction(['workspaces', 'assets'], 'readonly');
    const done = complete(tx);
    const stored = (await request(tx.objectStore('workspaces').get('active'))) as
      Stored | undefined;
    const assets = stored
      ? ((await Promise.all(
          stored.assetIds.map((id) => request(tx.objectStore('assets').get(id))),
        )) as (StoredAsset | undefined)[])
      : [];
    await done;
    this.storageVersion = stored?.storageVersion ?? 0;
    return { stored, assets };
  }
  async load() {
    const { stored, assets: records } = await this.readRecords();
    if (!stored) return null;
    const assets: Assets = {};
    for (const asset of records) {
      if (!asset || (!asset.blob && !asset.bytes)) throw new Error(t('error.storedAssetMissing'));
      assets[asset.id] = { id: asset.id, dataUrl: await storedAssetDataUrl(asset) };
    }
    return assertWorkspace({ ...stored, assets });
  }
  async loadRaw(): Promise<RawWorkspace | null> {
    const { stored, assets: records } = await this.readRecords();
    if (!stored) return null;
    const assets: Assets = {};
    for (const asset of records) {
      if (!asset || (!asset.blob && !asset.bytes)) continue;
      try {
        assets[asset.id] = { id: asset.id, dataUrl: await storedAssetDataUrl(asset) };
      } catch {
        /* Recovery keeps whatever assets are still readable. */
      }
    }
    return { stored, assets };
  }
  async save(workspace: Workspace) {
    workspace = assertWorkspace(workspace);
    const ids = referencedAssetIds(workspace.document);
    const blobs = await Promise.all(
      [...ids].map(async (id) => {
        const blob = dataUrlBlob(workspace.assets[id]!.dataUrl);
        return { id, bytes: await blob.arrayBuffer(), mimeType: blob.type };
      }),
    );
    const db = await this.database();
    const tx = db.transaction(['workspaces', 'assets'], 'readwrite');
    const done = complete(tx);
    try {
      const store = tx.objectStore('workspaces');
      const current = (await request(store.get('active'))) as Stored | undefined;
      if ((current?.storageVersion ?? 0) !== this.storageVersion) {
        tx.abort();
        await done.catch(() => {});
        throw new Error(t('error.workspaceChangedElsewhere'));
      }
      const { assets: _assets, ...rest } = workspace;
      const version = this.storageVersion + 1;
      store.put({
        ...rest,
        document: toStoredDocument(rest.document),
        id: 'active',
        storageVersion: version,
        assetIds: [...ids],
      });
      blobs.forEach((asset) => tx.objectStore('assets').put(asset));
      const keys = await request(tx.objectStore('assets').getAllKeys());
      keys.forEach((key) => {
        if (!ids.has(String(key))) tx.objectStore('assets').delete(key);
      });
      await done;
      this.storageVersion = version;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already committed/aborted by IndexedDB. */
      }
      await done.catch(() => {});
      throw error;
    }
  }
  close() {
    void this.connection?.then((db) => db.close());
    this.connection = null;
  }
}
export async function readLegacyWorkspace(): Promise<Workspace> {
  const serialized = localStorage.getItem(LEGACY_SETTINGS_KEY);
  const legacy = readLegacySettings(
    serialized ? (JSON.parse(serialized) as unknown) : {},
    localStorage.getItem(LEGACY_THEME_KEY) === 'dark',
  );
  const rawInput = legacy.jsonInput?.trim();
  const decoded = decodeLegacy(rawInput ? rawInput : demo());
  const pdf = emptyPdf();
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    let created = false;
    const req = indexedDB.open('OverlayPrintProDB');
    req.onupgradeneeded = () => {
      created = true;
      req.transaction?.abort();
    };
    req.onerror = () => (created ? resolve(null) : reject(req.error));
    req.onblocked = () => reject(new Error(t('error.legacyTabOpen')));
    req.onsuccess = () => resolve(req.result);
  });
  try {
    if (db?.objectStoreNames.contains('pdf_overlays')) {
      const tx = db.transaction('pdf_overlays');
      const done = complete(tx);
      const value = (await request(tx.objectStore('pdf_overlays').get('active_pdf'))) as
        | {
            pages?: string[];
            candidates?: PdfData['candidates'];
            pdfData?: Blob | ArrayBuffer | Uint8Array;
            pdfBlob?: Blob;
            fileName?: string;
          }
        | undefined;
      await done;
      if (value) {
        pdf.pages = value.pages ?? [];
        pdf.candidates = value.candidates ?? [];
        pdf.fileName = value.fileName ?? '';
        const source = value.pdfData ?? value.pdfBlob;
        pdf.bytes =
          source instanceof Blob
            ? new Uint8Array(await source.arrayBuffer())
            : source
              ? new Uint8Array(source)
              : null;
      }
    }
  } finally {
    db?.close();
  }
  return assertWorkspace({
    schemaVersion: 2,
    ...decoded,
    settings: legacy.settings,
    pdf,
    revision: 0,
    migratedAt: new Date().toISOString(),
  });
}
export async function loadOrMigrate(repository: WorkspaceRepository) {
  // A failed read is not an empty workspace. Recovery requires an explicit action.
  const stored = await repository.load();
  if (stored) return stored;
  const migrated = await readLegacyWorkspace();
  await repository.save(migrated);
  const check = await repository.load();
  const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const sameBytes = (a: Uint8Array | null, b: Uint8Array | null) =>
    a?.length === b?.length && !a?.some((byte, index) => byte !== b?.[index]);
  if (
    !check ||
    !sameJson(check.document, migrated.document) ||
    !sameJson(check.assets, migrated.assets) ||
    !sameJson(check.settings, migrated.settings) ||
    !sameJson(check.pdf.candidates, migrated.pdf.candidates) ||
    !sameJson(check.pdf.pages, migrated.pdf.pages) ||
    check.pdf.fileName !== migrated.pdf.fileName ||
    !sameBytes(check.pdf.bytes, migrated.pdf.bytes)
  )
    throw new Error(t('error.migrationVerify'));
  return check;
}
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
function base64(bytes: Uint8Array) {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192)
    text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(text);
}
export async function backupWorkspace(workspace: Workspace) {
  workspace = assertWorkspace(workspace);
  const referenced = referencedAssetIds(workspace.document);
  const payload = {
    ...workspace,
    document: toStoredDocument(workspace.document),
    assets: Object.fromEntries([...referenced].map((id) => [id, workspace.assets[id]])),
    pdf: { ...workspace.pdf, bytes: workspace.pdf.bytes ? base64(workspace.pdf.bytes) : null },
  };
  const json = JSON.stringify(payload);
  const result = JSON.stringify({
    format: 'kartesian-workspace',
    checksum: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))),
    payload: json,
  });
  if (new TextEncoder().encode(result).length > LIMITS.backupBytes)
    throw new Error(t('error.backupTooLargeExport'));
  return result;
}
export async function restoreWorkspace(text: string): Promise<Workspace> {
  if (new TextEncoder().encode(text).length > LIMITS.backupBytes)
    throw new Error(t('error.backupTooLarge'));
  const envelope = z
    .object({ format: z.literal('kartesian-workspace'), checksum: z.string(), payload: z.string() })
    .parse(JSON.parse(text) as unknown);
  if (
    hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(envelope.payload))) !==
    envelope.checksum
  )
    throw new Error(t('error.backupChecksum'));
  const parsed = JSON.parse(envelope.payload) as Workspace & { pdf: { bytes: string | null } };
  const encoded: unknown = parsed.pdf.bytes;
  if (encoded !== null && typeof encoded !== 'string') throw new Error(t('error.backupPdfBytes'));
  const bytes =
    typeof encoded === 'string' ? Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0)) : null;
  return assertWorkspace({ ...parsed, pdf: { ...parsed.pdf, bytes } });
}
/** A new workspace with one empty document and default settings. */
export function freshWorkspace(raw: unknown = demo()): Workspace {
  return {
    schemaVersion: 2,
    ...decodeLegacy(raw),
    settings: { ...defaultSettings },
    pdf: emptyPdf(),
    revision: 0,
  };
}
/** Best-effort rebuild of the stored workspace, filling in missing titles and pages. */
async function repairFromStored(repository: WorkspaceRepository): Promise<Workspace | null> {
  if (!hasRawAccess(repository)) return null;
  const raw = await repository.loadRaw();
  if (!raw) return null;
  const { stored, assets } = raw;
  const cloned: StoredDocument = stored.document
    ? structuredClone(stored.document as StoredDocument)
    : { id: uid() };
  let entries = storedEntries(cloned);
  if (!Array.isArray(entries) || entries.length === 0) {
    entries = [emptyDocumentEntry(t('document.new'))];
  } else {
    entries = entries.map((entry, index) => ({
      ...normalizeEntry(entry, index),
      pages: Array.isArray(entry.pages) && entry.pages.length ? entry.pages : [emptyPage(1)],
    }));
  }
  const { [LEGACY_DOCUMENTS_KEY]: _rollbackCopy, ...document } = cloned;
  return {
    schemaVersion: 2,
    document: { ...document, documents: entries },
    assets,
    settings: stored.settings ?? { ...defaultSettings },
    pdf: stored.pdf ?? emptyPdf(),
    revision: (stored.revision ?? 0) + 1,
  };
}
/** Rebuilds from the legacy localStorage JSON, or from the empty demo if that fails. */
function repairFromLegacy(): Workspace {
  try {
    const serialized = localStorage.getItem(LEGACY_SETTINGS_KEY);
    let rawJson: unknown = null;
    if (serialized) {
      try {
        const parsed = JSON.parse(serialized) as { jsonInput?: unknown };
        rawJson =
          typeof parsed.jsonInput === 'string' ? JSON.parse(parsed.jsonInput) : parsed.jsonInput;
      } catch {
        rawJson = null;
      }
    }
    return freshWorkspace(rawJson || demo());
  } catch {
    return freshWorkspace();
  }
}
export async function repairWorkspace(repository: WorkspaceRepository): Promise<Workspace> {
  const candidate = (await repairFromStored(repository).catch(() => null)) ?? repairFromLegacy();
  const repaired = assertWorkspace(candidate);
  await repository.save(repaired);
  try {
    const rawLegacy = writeLegacySettings(
      JSON.stringify(encodeLegacy(repaired.document, repaired.assets), null, 2),
      repaired.settings,
    );
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(rawLegacy));
  } catch {
    /* localStorage might be inaccessible */
  }
  return repaired;
}
export async function resetWorkspace(repository: WorkspaceRepository): Promise<Workspace> {
  const clean = freshWorkspace();
  await repository.save(clean);
  try {
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    /* ignore */
  }
  return clean;
}
