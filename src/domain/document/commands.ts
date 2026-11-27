import {
  type DocumentModel,
  type DocumentEntry,
  type Item,
  type Assets,
  emptyDocumentEntry,
  emptyPage,
  locate,
  uid,
  validateModel,
} from './model';
import { dimensions, move, roundWithin, type ItemSize } from './geometry';
import { LIMITS } from './schema';
import { PAPER_RANGE, type Paper, paperOf, paperSchema, paperSize } from './paper';
import { t } from '@/i18n/core';
import { mergeRows } from '../merge/merge';

export type Patch = Partial<
  Pick<
    Item,
    | 'text'
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'font_family'
    | 'font_size'
    | 'color'
    | 'bg_color'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'rotation'
    | 'z_index'
    | 'locked'
    | 'text_align'
    | 'letter_spacing'
    | 'comb_cells'
    | 'line_height'
    | 'fit'
    | 'stroke_width'
    | 'barcode_format'
    | 'group_id'
  >
>;
export type Align =
  'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distribute-h' | 'distribute-v';
/**
 * Where a new item goes. `pageNumber` wins over `pageId` and may point past the last
 * page (pages are then materialized). Without either, the first page is used.
 */
export type AddTarget = { documentId: string; pageId?: string; pageNumber?: number };
type AddCommand = { type: 'add'; item: Omit<Item, 'id'> } & AddTarget;
/** Adds ready-made items (ids included, e.g. from the clipboard) to one page. */
type AddManyCommand = { type: 'addMany'; items: Item[] } & AddTarget;
type AlignCommand = {
  type: 'align';
  ids: string[];
  action: Align;
  sizes?: Record<string, ItemSize>;
};
export type Command =
  | { type: 'patch'; ids: string[]; patch: Patch }
  | { type: 'patchMany'; patches: Record<string, Patch> }
  | AddCommand
  | AddManyCommand
  | { type: 'delete' | 'duplicate' | 'group' | 'ungroup'; ids: string[] }
  | AlignCommand
  | { type: 'addPage'; documentId: string }
  | { type: 'addDocument'; name: string }
  | MergeCommand
  | { type: 'setPaper'; paper: Paper };
/**
 * Fills a template document once per data row. With `replace`, the merged documents
 * replace every existing document; otherwise they are appended.
 */
export type MergeCommand = {
  type: 'merge';
  documentId: string;
  rows: Record<string, string>[];
  titleColumn?: string;
  replace: boolean;
};
type AddPageCommand = Extract<Command, { type: 'addPage' }>;
type ItemCommand = Extract<
  Command,
  { type: 'patch' | 'patchMany' | 'delete' | 'duplicate' | 'align' | 'group' | 'ungroup' }
>;
/** Maps one item to its replacement(s): `[]` deletes, two entries duplicate. */
type ItemTransform = (item: Item) => Item[];

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'rotation'] as const;
const DUPLICATE_OFFSET_MM = 5;

/** Applies a command and returns a new, validated model. Throws on invalid input. */
export function execute(document: DocumentModel, command: Command, assets: Assets): DocumentModel {
  if (command.type === 'setPaper') return setPaper(document, command.paper, assets);
  const entries = document.documents;
  let updated: DocumentEntry[];
  if (command.type === 'addDocument') {
    updated = [...entries, emptyDocumentEntry(command.name)];
  } else if (command.type === 'merge') {
    const template = entries.find((entry) => entry.id === command.documentId);
    if (!template) throw new Error(t('error.targetDocumentMissing'));
    if (!command.rows.length) throw new Error(t('merge.noRows'));
    const merged = mergeRows(template, command.rows, { titleColumn: command.titleColumn });
    updated = command.replace ? merged : [...entries, ...merged];
  } else if (command.type === 'add' || command.type === 'addMany' || command.type === 'addPage') {
    const target = findAddTarget(entries, command);
    updated = entries.map((entry) => {
      if (entry !== target) return entry;
      if (command.type === 'addPage') return appendPage(entry);
      const items =
        command.type === 'add' ? [{ ...command.item, id: uid() } as Item] : command.items;
      return addItems(entry, command, items);
    });
  } else {
    const transform = itemTransform(document, command);
    updated = entries.map((entry) => transformEntry(entry, transform));
  }
  const next: DocumentModel = { ...document, documents: updated };
  validateModel(next, assets);
  return next;
}

export function moveSelection(
  document: DocumentModel,
  ids: string[],
  dx: number,
  dy: number,
): Command {
  return {
    type: 'patchMany',
    patches: Object.fromEntries(
      ids.flatMap((id) => {
        const item = locate(document, id)?.item;
        return item ? [[id, move(item, dx, dy, paperOf(document))]] : [];
      }),
    ),
  };
}

function findAddTarget(
  entries: DocumentEntry[],
  command: AddCommand | AddManyCommand | AddPageCommand,
) {
  const target = entries.find((entry) => entry.id === command.documentId);
  if (!target) throw new Error(t('error.targetDocumentMissing'));
  if (command.type === 'addPage') return target;
  if (command.pageNumber !== undefined) {
    if (
      !Number.isInteger(command.pageNumber) ||
      command.pageNumber < 1 ||
      command.pageNumber > LIMITS.pages
    )
      throw new Error(t('error.targetPageNumber'));
  } else if (command.pageId && !target.pages.some((page) => page.id === command.pageId)) {
    throw new Error(t('error.targetPageGone'));
  }
  return target;
}

function addItems(entry: DocumentEntry, command: AddTarget, items: Item[]): DocumentEntry {
  const pageNumber =
    command.pageNumber ??
    (command.pageId ? entry.pages.findIndex((page) => page.id === command.pageId) + 1 : 1);
  const pages = [...entry.pages];
  while (pages.length < pageNumber) pages.push(emptyPage(pages.length + 1));
  const page = pages[pageNumber - 1]!;
  pages[pageNumber - 1] = {
    ...page,
    items: [...page.items, ...items],
  };
  return { ...entry, pages };
}

function appendPage(entry: DocumentEntry): DocumentEntry {
  return { ...entry, pages: [...entry.pages, emptyPage(entry.pages.length + 1)] };
}

/** Rebuilds only the pages and entries whose items actually changed. */
function transformEntry(entry: DocumentEntry, transform: ItemTransform): DocumentEntry {
  let entryChanged = false;
  const pages = entry.pages.map((page) => {
    let changed = false;
    const items = page.items.flatMap((item) => {
      const result = transform(item);
      if (result.length !== 1 || result[0] !== item) changed = true;
      return result;
    });
    if (!changed) return page;
    entryChanged = true;
    return { ...page, items };
  });
  return entryChanged ? { ...entry, pages } : entry;
}

function itemTransform(document: DocumentModel, command: ItemCommand): ItemTransform {
  switch (command.type) {
    case 'delete': {
      const ids = new Set(command.ids);
      return (item) => (ids.has(item.id) ? [] : [item]);
    }
    case 'duplicate': {
      const ids = new Set(command.ids);
      const paper = paperOf(document);
      // Copies of grouped items form a new group instead of joining the original one.
      const groups = new Map<string, string>();
      const regroup = (copy: Item): Item => {
        if (!copy.group_id) return copy;
        if (!groups.has(copy.group_id)) groups.set(copy.group_id, uid());
        return { ...copy, group_id: groups.get(copy.group_id) };
      };
      return (item) => (ids.has(item.id) ? [item, regroup(duplicateItem(item, paper))] : [item]);
    }
    case 'group': {
      const located = command.ids
        .map((id) => locate(document, id))
        .filter((value) => value !== undefined);
      if (located.length < 2 || located.some(({ page }) => page.id !== located[0]!.page.id))
        throw new Error(t('error.groupSelection'));
      const ids = new Set(command.ids);
      const groupId = uid();
      return (item) => [ids.has(item.id) ? { ...item, group_id: groupId } : item];
    }
    case 'ungroup': {
      const groups = new Set(
        command.ids.flatMap((id) => locate(document, id)?.item.group_id ?? []),
      );
      return (item) => {
        if (!item.group_id || !groups.has(item.group_id)) return [item];
        const { group_id: _group, ...rest } = item;
        return [rest as Item];
      };
    }
    case 'patch': {
      const ids = new Set(command.ids);
      return (item) => [ids.has(item.id) ? applyPatch(item, command.patch) : item];
    }
    case 'patchMany':
      return patchesTransform(command.patches);
    case 'align':
      return patchesTransform(alignPatches(document, command));
  }
}

function patchesTransform(patches: Record<string, Patch>): ItemTransform {
  return (item) => [Object.hasOwn(patches, item.id) ? applyPatch(item, patches[item.id]!) : item];
}

/** Locked items keep their geometry; other properties may still change. */
function applyPatch(item: Item, patch: Patch): Item {
  if (item.locked && GEOMETRY_KEYS.some((key) => key in patch)) return item;
  return { ...item, ...patch };
}

function duplicateItem(item: Item, paper: Paper): Item {
  const size = dimensions(item);
  return {
    ...item,
    id: uid(),
    x: roundWithin(item.x + DUPLICATE_OFFSET_MM, 0, paper.width - size.width),
    y: roundWithin(item.y + DUPLICATE_OFFSET_MM, 0, paper.height - size.height),
  };
}

/**
 * Changes the sheet size. Coordinates are kept as they are, so the change is refused
 * while any element would end up outside the new sheet.
 */
function setPaper(document: DocumentModel, paper: Paper, assets: Assets): DocumentModel {
  if (!paperSchema.safeParse(paper).success)
    throw new Error(t('error.paperRange', { min: PAPER_RANGE.min, max: PAPER_RANGE.max }));
  const outside = document.documents
    .flatMap((entry) => entry.pages.flatMap((page) => page.items))
    .filter(
      (item) =>
        item.x > paper.width ||
        item.y > paper.height ||
        (item.width !== undefined && item.x + item.width > paper.width) ||
        (item.height !== undefined && item.y + item.height > paper.height),
    ).length;
  if (outside)
    throw new Error(t('error.paperTooSmall', { count: outside, size: paperSize(paper) }));
  const next: DocumentModel = { ...document, paper };
  validateModel(next, assets);
  return next;
}

function alignPatches(document: DocumentModel, command: AlignCommand): Record<string, Patch> {
  const selected = command.ids
    .map((id) => locate(document, id))
    .filter((value) => value !== undefined);
  if (selected.length < 2 || selected.some((entry) => entry.page.id !== selected[0]!.page.id))
    throw new Error(t('error.alignSelection'));
  if (selected.some((entry) => entry.item.locked)) throw new Error(t('error.alignLocked'));
  const boxes = selected.map(({ item }) => ({
    item,
    ...dimensions(item, command.sizes?.[item.id]),
  }));
  if (command.action === 'distribute-h' || command.action === 'distribute-v')
    return distributePatches(
      boxes,
      command.action === 'distribute-h' ? 'x' : 'y',
      paperOf(document),
    );

  const left = Math.min(...boxes.map((box) => box.item.x));
  const top = Math.min(...boxes.map((box) => box.item.y));
  const right = Math.max(...boxes.map((box) => box.item.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.item.y + box.height));
  const paper = paperOf(document);
  const patches: Record<string, Patch> = {};
  for (const { item, width, height } of boxes) {
    const x = (value: number) => ({ x: roundWithin(value, 0, paper.width - width) });
    const y = (value: number) => ({ y: roundWithin(value, 0, paper.height - height) });
    patches[item.id] = {
      left: { x: left },
      hcenter: x((left + right - width) / 2),
      right: x(right - width),
      top: { y: top },
      vcenter: y((top + bottom - height) / 2),
      bottom: y(bottom - height),
    }[command.action];
  }
  return patches;
}

/** Keeps the outermost items in place and spreads equal gaps between the rest. */
function distributePatches(
  boxes: { item: Item; width: number; height: number }[],
  axis: 'x' | 'y',
  paper: Paper,
): Record<string, Patch> {
  const size = axis === 'x' ? 'width' : 'height';
  const limit = paper[size];
  const sorted = [...boxes].sort((a, b) => a.item[axis] - b.item[axis]);
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const occupied = sorted.reduce((sum, box) => sum + box[size], 0);
  const gap = (last.item[axis] + last[size] - first.item[axis] - occupied) / (sorted.length - 1);
  const patches: Record<string, Patch> = {};
  let cursor = first.item[axis];
  for (const box of sorted) {
    patches[box.item.id] = { [axis]: roundWithin(cursor, 0, limit - box[size]) };
    cursor += box[size] + gap;
  }
  return patches;
}
