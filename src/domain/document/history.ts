import type { DocumentModel } from './model';
export type HistoryEntry = { document: DocumentModel; bytes: number };
export function pushHistory(stack: HistoryEntry[], document: DocumentModel) {
  const entry = { document, bytes: JSON.stringify(document).length * 2 };
  const next = [...stack, entry];
  let size = next.reduce((sum, value) => sum + value.bytes, 0);
  while (next.length > 1 && (next.length > 50 || size > 32 * 1024 ** 2))
    size -= next.shift()!.bytes;
  return next;
}
