import { z } from 'zod';
import {
  decodeLegacy,
  demo,
  type Asset,
  type Assets,
  validateModel,
} from '@/domain/document/model';
import { imageSource, LIMITS } from '@/domain/document/schema';
import {
  emptyPdf,
  type PdfData,
  type Workspace,
  type WorkspaceRepository,
} from '@/application/ports';
import { settingsSchema, readLegacySettings } from '../serialization/settings';

export const DB_NAME = 'KartesianWorkspaceDB';
const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaksi dibatalkan.'));
  });
function open(name: string, version?: number, upgrade?: (db: IDBDatabase) => void) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
    let failed = false;
    req.onupgradeneeded = () => upgrade?.(req.result);
    req.onblocked = () => {
      failed = true;
      reject(new Error('Database sedang dipakai tab lain. Tutup tab tersebut lalu coba lagi.'));
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
  x: z.number().finite().min(0).max(210),
  y: z.number().finite().min(0).max(330),
  width: z.number().finite().positive().max(210),
  height: z.number().finite().positive().max(330),
  confidence: z.number().min(0).max(1),
});
const documentStructure = z.object({
  id: z.string().min(1),
  debtors: z.array(
    z.object({
      id: z.string().min(1),
      debitur: z.string().optional(),
      title: z.string().optional(),
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
  ),
});
export function assertWorkspace(raw: Workspace): Workspace {
  if (raw.schemaVersion !== 2) throw new Error('Versi workspace tidak didukung.');
  documentStructure.parse(raw.document);
  settingsSchema.parse(raw.settings);
  const seen = new Set<string>();
  const unique = (id: string) => {
    if (seen.has(id)) throw new Error('ID workspace duplikat.');
    seen.add(id);
  };
  unique(raw.document.id);
  raw.document.debtors.forEach((docEntry) => {
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
      throw new Error('Aset workspace tidak valid.');
  validateModel(raw.document, raw.assets);
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0)
    throw new Error('Revisi workspace tidak valid.');
  if (
    !Array.isArray(raw.pdf.pages) ||
    raw.pdf.pages.length > LIMITS.pdfPages ||
    raw.pdf.pages.some((page) => !imageSource.test(page))
  )
    throw new Error('Halaman PDF tidak valid.');
  if (raw.pdf.bytes && raw.pdf.bytes.byteLength > LIMITS.pdfBytes)
    throw new Error('PDF melebihi batas 25 MB.');
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
  if (!prefix || !body) throw new Error('Aset base64 tidak valid.');
  const data = atob(body.replace(/\s/g, ''));
  const bytes = Uint8Array.from(data, (ch) => ch.charCodeAt(0));
  return new Blob([bytes], { type: prefix.slice(5, prefix.indexOf(';')) });
}
type Stored = Omit<Workspace, 'assets'> & {
  id: 'active';
  storageVersion: number;
  assetIds: string[];
};
export class IndexedWorkspaceRepository implements WorkspaceRepository {
  private connection: Promise<IDBDatabase> | null = null;
  private storageVersion = 0;
  private database() {
    return (this.connection ??= open(DB_NAME, 1, (db) => {
      db.createObjectStore('workspaces', { keyPath: 'id' });
      db.createObjectStore('assets', { keyPath: 'id' });
    }));
  }
  async load() {
    const db = await this.database();
    const tx = db.transaction(['workspaces', 'assets'], 'readonly');
    const done = complete(tx);
    const stored = (await request(tx.objectStore('workspaces').get('active'))) as
      Stored | undefined;
    const assetRecords = stored
      ? ((await Promise.all(
          stored.assetIds.map((id) => request(tx.objectStore('assets').get(id))),
        )) as { id: string; blob?: Blob; bytes?: ArrayBuffer; mimeType?: string }[])
      : [];
    await done;
    if (!stored) {
      this.storageVersion = 0;
      return null;
    }
    const assets: Assets = {};
    for (const asset of assetRecords) {
      if (!asset || (!asset.blob && !asset.bytes))
        throw new Error('Aset tersimpan hilang. Pulihkan dari backup.');
      assets[asset.id] = {
        id: asset.id,
        dataUrl: await blobDataUrl(
          asset.blob ?? new Blob([asset.bytes!], { type: asset.mimeType }),
        ),
      };
    }
    this.storageVersion = stored.storageVersion;
    return assertWorkspace({ ...stored, assets });
  }
  async save(workspace: Workspace) {
    assertWorkspace(workspace);
    const ids = new Set(
      workspace.document.debtors.flatMap((docEntry) =>
        docEntry.pages.flatMap((page) =>
          page.items.flatMap((item) => (item.assetId ? [item.assetId] : [])),
        ),
      ),
    );
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
        throw new Error('Workspace berubah di tab lain. Unduh backup sebelum memuat ulang.');
      }
      const { assets: _assets, ...rest } = workspace;
      const version = this.storageVersion + 1;
      store.put({ ...rest, id: 'active', storageVersion: version, assetIds: [...ids] });
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
  const serialized = localStorage.getItem('overlay_print_pro_settings');
  const legacy = readLegacySettings(
    serialized ? (JSON.parse(serialized) as unknown) : {},
    localStorage.getItem('theme_preference') === 'dark',
  );
  const decoded = decodeLegacy(legacy.jsonInput ?? demo);
  const pdf = emptyPdf();
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    let created = false;
    const req = indexedDB.open('OverlayPrintProDB');
    req.onupgradeneeded = () => {
      created = true;
      req.transaction?.abort();
    };
    req.onerror = () => (created ? resolve(null) : reject(req.error));
    req.onblocked = () => reject(new Error('Tutup tab legacy sebelum migrasi PDF.'));
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
              ? new Uint8Array(source instanceof Uint8Array ? source : source)
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
  const stored = await repository.load();
  if (stored) return stored;
  const migrated = await readLegacyWorkspace();
  await repository.save(migrated);
  const check = await repository.load();
  if (
    !check ||
    JSON.stringify(check.document) !== JSON.stringify(migrated.document) ||
    JSON.stringify(check.assets) !== JSON.stringify(migrated.assets) ||
    JSON.stringify(check.settings) !== JSON.stringify(migrated.settings) ||
    JSON.stringify(check.pdf.candidates) !== JSON.stringify(migrated.pdf.candidates) ||
    JSON.stringify(check.pdf.pages) !== JSON.stringify(migrated.pdf.pages) ||
    check.pdf.fileName !== migrated.pdf.fileName ||
    check.pdf.bytes?.length !== migrated.pdf.bytes?.length ||
    check.pdf.bytes?.some((byte, index) => byte !== migrated.pdf.bytes?.[index])
  )
    throw new Error('Verifikasi migrasi gagal. Data legacy tetap utuh.');
  return check;
}
export async function assetDigest(asset: Asset) {
  const bytes = new TextEncoder().encode(asset.dataUrl);
  return hex(await crypto.subtle.digest('SHA-256', bytes));
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
  assertWorkspace(workspace);
  const referenced = new Set(
    workspace.document.debtors.flatMap((docEntry) =>
      docEntry.pages.flatMap((page) =>
        page.items.flatMap((item) => (item.assetId ? [item.assetId] : [])),
      ),
    ),
  );
  const payload = {
    ...workspace,
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
    throw new Error('Backup melebihi 150 MB. Kurangi ukuran aset sebelum mengekspor.');
  return result;
}
export async function restoreWorkspace(text: string): Promise<Workspace> {
  if (new TextEncoder().encode(text).length > LIMITS.backupBytes)
    throw new Error('Backup melebihi 150 MB.');
  const envelope = z
    .object({ format: z.literal('kartesian-workspace'), checksum: z.string(), payload: z.string() })
    .parse(JSON.parse(text) as unknown);
  if (
    hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(envelope.payload))) !==
    envelope.checksum
  )
    throw new Error('Checksum backup tidak cocok.');
  const parsed = JSON.parse(envelope.payload) as Workspace & { pdf: { bytes: string | null } };
  const encoded: unknown = parsed.pdf.bytes;
  if (encoded !== null && typeof encoded !== 'string')
    throw new Error('Byte PDF backup tidak valid.');
  const bytes =
    typeof encoded === 'string' ? Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0)) : null;
  return assertWorkspace({ ...parsed, pdf: { ...parsed.pdf, bytes } });
}
