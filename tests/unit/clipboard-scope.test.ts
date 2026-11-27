import { describe, expect, it } from 'vitest';
import { decodeLegacy, defaultSettings } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';
import { presetPaper } from '@/domain/document/paper';
import {
  parseClipboard,
  prepareItemsForPaste,
  serializeClipboard,
} from '@/domain/document/clipboard';
import { parsePageRange } from '@/domain/document/output-scope';
import { outputPages, scopedPageCount } from '@/infrastructure/export/html';
import { emptyPdf } from '@/application/ports';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const F4 = presetPaper('f4', false);

describe('clipboard', () => {
  it('round-trips items with embedded images and ignores foreign text', () => {
    const { document, assets } = decodeLegacy([
      {
        title: 'A',
        pages: [
          {
            page_number: 1,
            items: [
              { text: 'Halo', x: 10, y: 10, group_id: 'g1' },
              { type: 'image', text: PNG, x: 20, y: 20, width: 10, height: 10, group_id: 'g1' },
            ],
          },
        ],
      },
    ]);
    const items = document.documents[0]!.pages[0]!.items;
    const text = serializeClipboard(items, assets);
    const copied = parseClipboard(text)!;
    expect(copied).toHaveLength(2);
    expect(copied[1]!.text).toBe(PNG);
    expect(parseClipboard('hello')).toBeUndefined();
    expect(parseClipboard('{"format":"other","version":1,"items":[]}')).toBeUndefined();

    const pasted = prepareItemsForPaste(copied, F4, 5);
    expect(pasted.items.map((item) => [item.x, item.y])).toEqual([
      [15, 15],
      [25, 25],
    ]);
    expect(pasted.items[0]!.id).not.toBe(items[0]!.id);
    expect(pasted.items[0]!.group_id).toBe(pasted.items[1]!.group_id);
    expect(pasted.items[0]!.group_id).not.toBe('g1');
    expect(pasted.items[1]!.text).toBe('');
    expect(pasted.assets[pasted.items[1]!.assetId!]!.dataUrl).toBe(PNG);
  });

  it('keeps pasted items on the sheet and adds them as one command', () => {
    const { document, assets } = decodeLegacy([{ title: 'A', pages: [] }]);
    const copied = parseClipboard(
      serializeClipboard(
        [{ id: 'x', text: 'Box', x: 200, y: 320, width: 10, height: 10 } as never],
        {},
      ),
    )!;
    const { items, assets: added } = prepareItemsForPaste(copied, F4, 5);
    expect(items[0]).toMatchObject({ x: 200, y: 320 });
    const next = execute(
      document,
      { type: 'addMany', documentId: document.documents[0]!.id, pageNumber: 2, items },
      { ...assets, ...added },
    );
    expect(next.documents[0]!.pages.map((page) => page.items.length)).toEqual([0, 1]);
  });
});

describe('output scope', () => {
  it('parses page ranges', () => {
    expect(parsePageRange('')).toBeNull();
    expect([...parsePageRange('1-3, 5')!]).toEqual([1, 2, 3, 5]);
    expect([...parsePageRange('2;4-4')!]).toEqual([2, 4]);
    expect(parsePageRange('3-1')).toBeUndefined();
    expect(parsePageRange('0')).toBeUndefined();
    expect(parsePageRange('a')).toBeUndefined();
  });

  it('prints only the chosen documents and pages', () => {
    const { document, assets } = decodeLegacy(
      ['A', 'B', 'C'].map((title) => ({
        title,
        pages: [1, 2, 3].map((page_number) => ({
          page_number,
          items: [{ text: `${title}${page_number}`, x: 1, y: 1 }],
        })),
      })),
    );
    const snapshot = {
      document,
      assets,
      settings: { ...defaultSettings, hideCalibration: true },
      pdf: emptyPdf(),
    };
    const scope = { documentIds: [document.documents[1]!.id], pages: '1, 3' };
    const html = outputPages(snapshot, {}, scope);
    expect(html.match(/<section/g)).toHaveLength(2);
    expect(html).toContain('B1');
    expect(html).toContain('B3');
    expect(html).not.toContain('A1');
    expect(scopedPageCount(snapshot, scope)).toBe(2);
    expect(scopedPageCount(snapshot, { documentIds: 'all', pages: '' })).toBe(9);
    expect(scopedPageCount(snapshot, { documentIds: 'all', pages: '7' })).toBe(0);
  });
});
