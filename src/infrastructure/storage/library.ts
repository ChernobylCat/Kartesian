/**
 * Saved workspaces and templates. Kept in their own database so the main workspace
 * database (and builds that only know it) is untouched. Each entry stores a full
 * workspace backup (the same checksummed format as "Full workspace backup").
 */
import { z } from 'zod';
import { complete, openDatabase, request } from './workspace';
import { paperSchema, type Paper } from '@/domain/document/paper';

export const LIBRARY_DB = 'KartesianLibraryDB';
const ENTRIES = 'entries';
const META = 'meta';
const CURRENT_KEY = 'current';

export type LibraryKind = 'workspace' | 'template';
export type LibraryEntry = {
  id: string;
  kind: LibraryKind;
  name: string;
  updatedAt: number;
  documents: number;
  paper: Paper;
  /** `backupWorkspace()` output. */
  payload: string;
};
export type LibrarySummary = Omit<LibraryEntry, 'payload'>;
/** The workspace currently open in the editor. */
export type CurrentWorkspace = { id: string; name: string };

export const NAME_MAX = 80;
const entrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['workspace', 'template']),
  name: z.string().min(1).max(NAME_MAX),
  updatedAt: z.number(),
  documents: z.number().int().min(0),
  paper: paperSchema,
  payload: z.string(),
});
const currentSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(NAME_MAX) });

let connection: Promise<IDBDatabase> | undefined;
const database = () =>
  (connection ??= openDatabase(LIBRARY_DB, 1, (db) => {
    if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  }));

/** Saved entries without their payloads, newest first. */
export async function listEntries(): Promise<LibrarySummary[]> {
  const db = await database();
  const all = (await request(db.transaction(ENTRIES).objectStore(ENTRIES).getAll())) as unknown[];
  return all
    .flatMap((raw) => {
      const parsed = entrySchema.safeParse(raw);
      if (!parsed.success) return [];
      const { payload: _payload, ...summary } = parsed.data;
      return [summary];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEntry(id: string): Promise<LibraryEntry | undefined> {
  const db = await database();
  const raw = await request(db.transaction(ENTRIES).objectStore(ENTRIES).get(id));
  const parsed = entrySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function putEntry(entry: LibraryEntry) {
  const valid = entrySchema.parse(entry);
  const db = await database();
  const tx = db.transaction(ENTRIES, 'readwrite');
  tx.objectStore(ENTRIES).put(valid);
  await complete(tx);
}

/** Changes the name without touching the stored workspace. */
export async function renameEntry(id: string, name: string) {
  const entry = await getEntry(id);
  if (entry) await putEntry({ ...entry, name });
}

export async function deleteEntry(id: string) {
  const db = await database();
  const tx = db.transaction(ENTRIES, 'readwrite');
  tx.objectStore(ENTRIES).delete(id);
  await complete(tx);
}

export async function getCurrent(): Promise<CurrentWorkspace | undefined> {
  const db = await database();
  const raw = await request(db.transaction(META).objectStore(META).get(CURRENT_KEY));
  const parsed = currentSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function setCurrent(current: CurrentWorkspace) {
  const db = await database();
  const tx = db.transaction(META, 'readwrite');
  tx.objectStore(META).put(currentSchema.parse(current), CURRENT_KEY);
  await complete(tx);
}
