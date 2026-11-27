import type { DocumentModel } from './model';

/**
 * Which part of the workspace Print and Export HTML produce. `pages` is a range in
 * each document, e.g. "1-3, 5"; empty means every page.
 */
export type OutputScope = { documentIds: 'all' | string[]; pages: string };
export const FULL_SCOPE: OutputScope = Object.freeze({ documentIds: 'all', pages: '' });

/**
 * Page numbers in a range text such as "1-3, 5". Returns undefined for invalid text
 * (unknown characters, reversed or zero bounds) and null for "all pages".
 */
export function parsePageRange(text: string, max = Number.MAX_SAFE_INTEGER) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const pages = new Set<number>();
  for (const part of trimmed.split(/[,;]/)) {
    const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(part);
    if (!match) return undefined;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start) return undefined;
    for (let page = start; page <= Math.min(end, max); page++) pages.add(page);
  }
  return pages;
}

/** Document ids the scope prints; ids that no longer exist are dropped. */
export function scopedDocumentIds(document: DocumentModel, scope: OutputScope) {
  const existing = document.documents.map((entry) => entry.id);
  if (scope.documentIds === 'all') return new Set(existing);
  return new Set(scope.documentIds.filter((id) => existing.includes(id)));
}

export const isFullScope = (scope: OutputScope) =>
  scope.documentIds === 'all' && !scope.pages.trim();
