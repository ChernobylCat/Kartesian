import { describe, expect, it } from 'vitest';
import { DEFAULT_PAPER as F4 } from '@/domain/document/paper';
import { decodeLegacy, encodeLegacy, isBold, locate, validateModel } from '@/domain/document/model';
import { execute, moveSelection } from '@/domain/document/commands';
import { move, roundWithin } from '@/domain/document/geometry';
import { applyFieldCandidates } from '@/infrastructure/pdf/field-detector';
import { errorMessage } from '@/application/error-message';
import { pageSlotKey, slotPageNumber } from '@/features/editor/page-slots';
import { overlayPageCount, overlaySource } from '@/infrastructure/pdf/pdf-runtime';

const withItems = (items: Record<string, unknown>[]) =>
  decodeLegacy([{ title: 'Uji', pages: [{ page_number: 1, items }] }]);
const itemIds = (document: ReturnType<typeof withItems>['document']) =>
  document.documents[0]!.pages[0]!.items.map((item) => item.id);

describe('rounding never leaves the sheet', () => {
  it('roundWithin rounds down when rounding up would overflow', () => {
    expect(roundWithin(176.67, 0, 176.67)).toBe(176.6);
    expect(roundWithin(-3, 0, 10)).toBe(0);
    expect(roundWithin(5, 0, -2)).toBe(0);
  });

  it('duplicates an item with a fractional width at the right edge', () => {
    const { document, assets } = withItems([{ text: 'A', x: 176.67, y: 10, width: 33.33 }]);
    const next = execute(document, { type: 'duplicate', ids: itemIds(document) }, assets);
    expect(next.documents[0]!.pages[0]!.items).toHaveLength(2);
  });

  it('moves an item with a fractional width to the right edge', () => {
    const { document, assets } = withItems([{ text: 'A', x: 100, y: 10, width: 33.33 }]);
    const [id] = itemIds(document);
    const next = execute(document, moveSelection(document, [id!], 200, 0), assets);
    const item = locate(next, id!)!.item;
    expect(item.x + item.width!).toBeLessThanOrEqual(210);
    expect(move(item, 1, 0, F4).x).toBe(item.x);
  });

  it('right-aligns items whose union ends exactly at the sheet edge', () => {
    const { document, assets } = withItems([
      { text: 'A', x: 176.67, y: 10, width: 33.33 },
      { text: 'B', x: 20, y: 40, width: 10.04 },
    ]);
    const next = execute(
      document,
      { type: 'align', ids: itemIds(document), action: 'right' },
      assets,
    );
    for (const item of next.documents[0]!.pages[0]!.items)
      expect(item.x + item.width!).toBeLessThanOrEqual(210);
  });

  it('applies a detected field whose rounded box used to end past 210 mm', () => {
    const { document, assets } = withItems([]);
    const { data } = applyFieldCandidates(encodeLegacy(document, assets), [
      {
        id: 'c1',
        pageNumber: 1,
        source: 'test',
        label: 'Nama',
        key: 'nama',
        placeholder: '{{nama}}',
        x: 100.05,
        y: 10,
        width: 109.95,
        height: 5,
        confidence: 1,
      },
    ]);
    expect(() => decodeLegacy(data)).not.toThrow();
  });
});

describe('item identity across JSON edits', () => {
  it('keeps ids when JSON is re-parsed after a patch adds a key', () => {
    const { document, assets } = withItems([{ text: 'A', x: 10, y: 10 }]);
    const [id] = itemIds(document);
    const patched = execute(
      document,
      { type: 'patch', ids: [id!], patch: { bold: false } },
      assets,
    );
    validateModel(patched, assets);
    const raw = JSON.stringify(encodeLegacy(patched, assets));
    const reparsed = decodeLegacy(raw, patched, assets);
    expect(itemIds(reparsed.document)).toEqual([id]);
  });
});

describe('commands', () => {
  it('materializes pages up to pageNumber and adds the item to the last one', () => {
    const { document, assets } = withItems([]);
    const documentId = document.documents[0]!.id;
    const next = execute(
      document,
      { type: 'add', documentId, pageNumber: 3, item: { text: 'X', x: 1, y: 1 } },
      assets,
    );
    const pages = next.documents[0]!.pages;
    expect(pages.map((page) => page.page_number)).toEqual([1, 2, 3]);
    expect(pages.map((page) => page.items.length)).toEqual([0, 0, 1]);
    expect(Object.keys(next)).toEqual(['id', 'documents']);
  });

  it('keeps untouched pages and entries referentially equal', () => {
    const { document, assets } = withItems([{ text: 'A', x: 10, y: 10 }]);
    const next = execute(document, { type: 'delete', ids: ['missing'] }, assets);
    expect(next.documents[0]).toBe(document.documents[0]);
  });
});

describe('helpers', () => {
  it('treats a missing bold flag as bold, matching legacy rendering', () => {
    expect(isBold({})).toBe(true);
    expect(isBold({ bold: false })).toBe(false);
  });

  it('formats caught values without the "Error:" prefix', () => {
    expect(errorMessage(new Error('Gagal'))).toBe('Gagal');
    expect(errorMessage('teks')).toBe('teks');
    expect(errorMessage(undefined, 'Cadangan')).toBe('Cadangan');
  });

  it('round-trips page slot keys', () => {
    const key = pageSlotKey('doc-uuid', 2);
    expect(slotPageNumber(key, 'doc-uuid')).toBe(3);
    expect(slotPageNumber(key, 'other')).toBeUndefined();
    expect(slotPageNumber('doc-uuid-x', 'doc-uuid')).toBeUndefined();
    expect(slotPageNumber(null, 'doc-uuid')).toBeUndefined();
  });

  it('derives background page count and source from one place', () => {
    expect(overlayPageCount('doc_1', 9)).toBe(1);
    expect(overlayPageCount('uploaded_pdf', 9)).toBe(9);
    expect(overlayPageCount('none', 9)).toBe(0);
    expect(overlaySource('uploaded_pdf', 2, ['a', 'b'])).toBe('b');
    expect(overlaySource('doc_1', 2, [])).toBe('');
  });
});
