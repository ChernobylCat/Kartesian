import { describe, expect, it } from 'vitest';
import { decodeLegacy, expandGroups } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';
import { snap } from '@/domain/document/geometry';
import { DEFAULT_PAPER as F4 } from '@/domain/document/paper';
import { layerOrder } from '@/features/editor/components/LayersPanel';

const workspace = () =>
  decodeLegacy([
    {
      title: 'T',
      pages: [
        {
          page_number: 1,
          items: [
            { text: 'A', x: 10, y: 10 },
            { text: 'B', x: 30, y: 10 },
            { text: 'C', x: 50, y: 10, z_index: 5 },
          ],
        },
        { page_number: 2, items: [{ text: 'D', x: 10, y: 10 }] },
      ],
    },
  ]);
const page = (document: ReturnType<typeof workspace>['document'], index = 0) =>
  document.documents[0]!.pages[index]!.items;

describe('groups', () => {
  it('groups items on one page, expands selection and ungroups', () => {
    const { document, assets } = workspace();
    const [a, b, c] = page(document).map((item) => item.id);
    const grouped = execute(document, { type: 'group', ids: [a!, b!] }, assets);
    const groupId = page(grouped)[0]!.group_id;
    expect(groupId).toBeTruthy();
    expect(page(grouped)[1]!.group_id).toBe(groupId);
    expect(page(grouped)[2]!.group_id).toBeUndefined();
    expect(expandGroups(grouped, [a!])).toEqual([a, b]);
    expect(expandGroups(grouped, [c!])).toEqual([c]);
    const ungrouped = execute(grouped, { type: 'ungroup', ids: [b!] }, assets);
    expect(page(ungrouped).every((item) => !item.group_id)).toBe(true);
  });

  it('refuses groups across pages and gives duplicates their own group', () => {
    const { document, assets } = workspace();
    const [a, b] = page(document).map((item) => item.id);
    const d = page(document, 1)[0]!.id;
    expect(() => execute(document, { type: 'group', ids: [a!, d] }, assets)).toThrow();
    const grouped = execute(document, { type: 'group', ids: [a!, b!] }, assets);
    const copies = execute(grouped, { type: 'duplicate', ids: [a!, b!] }, assets);
    const items = page(copies);
    expect(items).toHaveLength(5);
    expect(items[1]!.group_id).toBe(items[3]!.group_id);
    expect(items[1]!.group_id).not.toBe(items[0]!.group_id);
  });
});

describe('grid snapping', () => {
  it('pulls the top-left corner onto the grid without drawing a guide', () => {
    const item = page(workspace().document)[0]!;
    const snapped = snap(item, F4, 3.6, 1.2, [], 1.5, {}, undefined, 5);
    expect(item.x + snapped.dx).toBeCloseTo(15);
    expect(item.y + snapped.dy).toBeCloseTo(10);
    expect(snapped.guideX).toBeUndefined();
    expect(snap(item, F4, 3.6, 0, [], 1.5).dx).toBeCloseTo(3.6);
  });
});

describe('layer order', () => {
  it('lists items front to back, later items first on equal layers', () => {
    expect(layerOrder(page(workspace().document)).map((item) => item.text)).toEqual([
      'C',
      'B',
      'A',
    ]);
  });
});
