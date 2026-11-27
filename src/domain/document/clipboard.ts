import { type Assets, type Item, encodeItem, uid } from './model';
import { dimensions, roundWithin } from './geometry';
import { imageSource, type LegacyItem } from './schema';
import type { Paper } from './paper';

/** Marks clipboard text written by Kartesian, so pasting other text is ignored. */
export const CLIPBOARD_FORMAT = 'kartesian/items';
const VERSION = 1;
/** Offset applied when pasting onto the page the items were copied from. */
export const PASTE_OFFSET_MM = 5;

/**
 * Clipboard text for the selected items. Images are embedded as data URLs, so the
 * text can be pasted into another tab or workspace.
 */
export function serializeClipboard(items: Item[], assets: Assets) {
  return JSON.stringify({
    format: CLIPBOARD_FORMAT,
    version: VERSION,
    items: items.map((item) => encodeItem(item, assets)),
  });
}

/** Items from clipboard text, or undefined when the text is not a Kartesian copy. */
export function parseClipboard(text: string): LegacyItem[] | undefined {
  try {
    const value = JSON.parse(text) as { format?: unknown; version?: unknown; items?: unknown };
    if (value?.format !== CLIPBOARD_FORMAT || value.version !== VERSION) return undefined;
    if (!Array.isArray(value.items) || !value.items.length) return undefined;
    const valid = value.items.every(
      (item: unknown) =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as LegacyItem).text === 'string' &&
        Number.isFinite(Number((item as LegacyItem).x)) &&
        Number.isFinite(Number((item as LegacyItem).y)),
    );
    return valid ? (value.items as LegacyItem[]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turns copied items into new items for a page: fresh ids, images moved into assets,
 * groups kept together under new group ids, and positions shifted by `offset` but
 * kept on the sheet. The schema still validates the result when it is added.
 */
export function prepareItemsForPaste(source: LegacyItem[], paper: Paper, offset = 0) {
  const assets: Assets = {};
  const groups = new Map<string, string>();
  const items = source.map((legacy) => {
    const {
      id: _id,
      assetId: _assetId,
      legacyIdentity: _identity,
      ...value
    } = legacy as LegacyItem & { id?: unknown; assetId?: unknown; legacyIdentity?: unknown };
    const item = { ...value, id: uid(), x: Number(value.x), y: Number(value.y) } as Item;
    if (item.type === 'image' && imageSource.test(item.text)) {
      const assetId = uid();
      assets[assetId] = { id: assetId, dataUrl: item.text };
      item.assetId = assetId;
      item.text = '';
    }
    if (item.group_id) {
      if (!groups.has(item.group_id)) groups.set(item.group_id, uid());
      item.group_id = groups.get(item.group_id);
    }
    const size = dimensions(item);
    item.x = roundWithin(item.x + offset, 0, paper.width - (item.width ? size.width : 0));
    item.y = roundWithin(item.y + offset, 0, paper.height - (item.height ? size.height : 0));
    return item;
  });
  return { items, assets };
}
