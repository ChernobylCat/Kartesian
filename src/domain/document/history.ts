import type { DocumentModel } from './model';
export type HistoryEntry = { document: DocumentModel; bytes: number };
const MAX_ENTRIES = 50;
const MAX_BYTES = 32 * 1024 ** 2;
/** Appends a snapshot, dropping the oldest ones past 50 entries or ~32 MB (UTF-16 estimate). */
export function pushHistory(stack: HistoryEntry[], document: DocumentModel) {
  const entry = { document, bytes: JSON.stringify(document).length * 2 };
  const next = [...stack, entry];
  let size = next.reduce((sum, value) => sum + value.bytes, 0);
  while (next.length > 1 && (next.length > MAX_ENTRIES || size > MAX_BYTES))
    size -= next.shift()!.bytes;
  return next;
}
