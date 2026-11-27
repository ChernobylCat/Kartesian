import { describe, expect, it } from 'vitest';
import { decodeLegacy, encodeLegacy, defaultSettings } from '@/domain/document/model';
import { TITLE_KEYS } from '@/domain/document/schema';
import { emptyPdf } from '@/application/ports';
import { assertWorkspace, toStoredDocument } from '@/infrastructure/storage/workspace';

// The old key names are spelled out here on purpose: they are what existing JSON files,
// IndexedDB records and backups contain.
const OLD_LIST_KEY = 'debtors';
const OLD_TITLE_KEY = 'debitur';

const workspaceWith = (document: unknown) =>
  ({
    schemaVersion: 2,
    document,
    assets: {},
    settings: { ...defaultSettings },
    pdf: emptyPdf(),
    revision: 0,
  }) as unknown as Parameters<typeof assertWorkspace>[0];

const entry = (extra: Record<string, unknown> = {}) => ({
  id: 'entry',
  title: 'Dokumen A',
  legacyKey: 'title',
  extra: {},
  pages: [{ id: 'page', page_number: 1, extra: {}, items: [] }],
  ...extra,
});

describe('generic document naming', () => {
  it('accepts every title key, with title first', () => {
    expect(TITLE_KEYS[0]).toBe('title');
    expect(TITLE_KEYS).toContain(OLD_TITLE_KEY);
  });

  it('reads JSON that names documents with the old key and writes it back unchanged', () => {
    const raw = [{ [OLD_TITLE_KEY]: 'Lama', pages: [] }];
    const { document, assets } = decodeLegacy(raw);
    expect(document.documents[0]!.title).toBe('Lama');
    expect(document.documents[0]).not.toHaveProperty(OLD_TITLE_KEY);
    expect(encodeLegacy(document, assets)).toEqual(raw);
  });

  it('gives new documents a plain title key', () => {
    const { document, assets } = decodeLegacy([{ pages: [] }]);
    expect(encodeLegacy(document, assets)).toEqual([{ title: 'Dokumen 1', pages: [] }]);
  });

  it('opens stored records that only have the old document-list key', () => {
    const result = assertWorkspace(workspaceWith({ id: 'doc', [OLD_LIST_KEY]: [entry()] }));
    expect(result.document.documents.map((value) => value.id)).toEqual(['entry']);
    expect(Object.keys(result.document)).toEqual(['id', 'documents']);
  });

  it('drops per-entry title copies from older records, falling back to them when needed', () => {
    const result = assertWorkspace(
      workspaceWith({ id: 'doc', documents: [entry({ title: ' ', [OLD_TITLE_KEY]: 'Cadangan' })] }),
    );
    expect(result.document.documents[0]!.title).toBe('Cadangan');
    expect(result.document.documents[0]).not.toHaveProperty(OLD_TITLE_KEY);
  });

  it('keeps a rollback copy under the old key only in what is written to storage', () => {
    const { document } = decodeLegacy([{ title: 'A', pages: [] }]);
    const stored = toStoredDocument(document) as Record<string, unknown>;
    expect(stored[OLD_LIST_KEY]).toBe(document.documents);
    expect(document).not.toHaveProperty(OLD_LIST_KEY);
    expect(assertWorkspace(workspaceWith(stored)).document).not.toHaveProperty(OLD_LIST_KEY);
  });
});
