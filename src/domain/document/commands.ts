import { type DocumentModel, type Item, type Assets, uid, locate, validateModel } from './model';
import { dimensions, move, round, clamp } from './geometry';
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
  >
>;
export type Align =
  'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'distribute-h' | 'distribute-v';
export type Command =
  | { type: 'patch'; ids: string[]; patch: Patch }
  | { type: 'patchMany'; patches: Record<string, Patch> }
  | {
      type: 'add';
      debtorId?: string;
      docId?: string;
      pageId?: string;
      pageNumber?: number;
      item: Omit<Item, 'id'>;
    }
  | { type: 'delete' | 'duplicate'; ids: string[] }
  | { type: 'align'; ids: string[]; action: Align }
  | { type: 'addPage'; debtorId?: string; docId?: string }
  | { type: 'addDebtor'; name: string }
  | { type: 'addDocument'; name: string };

export function execute(document: DocumentModel, command: Command, assets: Assets): DocumentModel {
  const targetDocId =
    command.type === 'add' || command.type === 'addPage'
      ? (command.docId ?? command.debtorId)
      : undefined;
  const ids =
    'ids' in command
      ? new Set(command.ids)
      : command.type === 'patchMany'
        ? new Set(Object.keys(command.patches))
        : new Set<string>();
  let patches: Record<string, Patch> = command.type === 'patchMany' ? command.patches : {};
  if (command.type === 'align') {
    const selected = command.ids
      .map((id) => locate(document, id))
      .filter((value) => value !== undefined);
    if (selected.length < 2 || selected.some((entry) => entry.page.id !== selected[0]!.page.id))
      throw new Error('Pilih minimal dua elemen pada halaman yang sama.');
    if (selected.some((entry) => entry.item.locked))
      throw new Error('Buka kunci elemen sebelum meratakan.');
    const entries = selected.map((entry) => ({ item: entry.item, ...dimensions(entry.item) }));
    const left = Math.min(...entries.map((e) => e.item.x)),
      top = Math.min(...entries.map((e) => e.item.y));
    const right = Math.max(...entries.map((e) => e.item.x + e.width)),
      bottom = Math.max(...entries.map((e) => e.item.y + e.height));
    patches = {};
    for (const entry of entries) {
      const { item, width, height } = entry;
      const patch: Patch = {};
      if (command.action === 'left') patch.x = left;
      if (command.action === 'hcenter') patch.x = round((left + right - width) / 2);
      if (command.action === 'right') patch.x = round(right - width);
      if (command.action === 'top') patch.y = top;
      if (command.action === 'vcenter') patch.y = round((top + bottom - height) / 2);
      if (command.action === 'bottom') patch.y = round(bottom - height);
      patches[item.id] = patch;
    }
    if (command.action.startsWith('distribute')) {
      const horizontal = command.action === 'distribute-h';
      const key = horizontal ? 'x' : 'y';
      const dimension = horizontal ? 'width' : 'height';
      entries.sort((a, b) => a.item[key] - b.item[key]);
      let cursor = entries[0]!.item[key];
      const last = entries.at(-1)!;
      const gap =
        (last.item[key] +
          last[dimension] -
          cursor -
          entries.reduce((sum, e) => sum + e[dimension], 0)) /
        (entries.length - 1);
      for (const entry of entries) {
        patches[entry.item.id] = { [key]: round(cursor) };
        cursor += entry[dimension] + gap;
      }
    }
  }
  const next: DocumentModel = {
    ...document,
    debtors: document.debtors.map((docEntry) => {
      const isTarget = targetDocId === docEntry.id;
      const pages = docEntry.pages.map((page) => {
        let changed = false;
        const items: Item[] = [];
        for (const item of page.items) {
          if (!ids.has(item.id)) {
            items.push(item);
            continue;
          }
          if (command.type === 'delete') {
            changed = true;
            continue;
          }
          if (command.type === 'duplicate') {
            const size = dimensions(item);
            changed = true;
            items.push(item, {
              ...item,
              id: uid(),
              x: round(clamp(item.x + 5, 0, 210 - size.width)),
              y: round(clamp(item.y + 5, 0, 330 - size.height)),
            });
            continue;
          }
          const patch = command.type === 'patch' ? command.patch : patches[item.id];
          if (!patch) {
            items.push(item);
            continue;
          }
          const moving = ['x', 'y', 'width', 'height', 'rotation'].some((key) => key in patch);
          if (item.locked && moving) {
            items.push(item);
            continue;
          }
          changed = true;
          items.push({ ...item, ...patch });
        }
        if (
          command.type === 'add' &&
          isTarget &&
          (command.pageNumber
            ? command.pageNumber === page.page_number
            : command.pageId === page.id || (!command.pageId && page === docEntry.pages[0]))
        ) {
          items.push({ ...command.item, id: uid() } as Item);
          changed = true;
        }
        return changed ? { ...page, items } : page;
      });
      if (
        command.type === 'add' &&
        isTarget &&
        command.pageNumber &&
        command.pageNumber > pages.length
      ) {
        while (pages.length < command.pageNumber)
          pages.push({
            id: uid(),
            page_number: pages.length + 1,
            extra: {},
            items:
              pages.length + 1 === command.pageNumber
                ? [{ ...command.item, id: uid() } as Item]
                : [],
          });
      } else if (
        (command.type === 'addPage' || (command.type === 'add' && !pages.length)) &&
        isTarget
      )
        pages.push({
          id: uid(),
          page_number: pages.length + 1,
          extra: {},
          items: command.type === 'add' ? [{ ...command.item, id: uid() } as Item] : [],
        });
      return pages.some((page, index) => page !== docEntry.pages[index]) ||
        pages.length !== docEntry.pages.length
        ? { ...docEntry, pages }
        : docEntry;
    }),
  };
  if (command.type === 'addDebtor' || command.type === 'addDocument')
    next.debtors.push({
      id: uid(),
      title: command.name,
      debitur: command.name,
      legacyKey: 'title',
      extra: {},
      pages: [{ id: uid(), page_number: 1, extra: {}, items: [] }],
    });
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
      ids.map((id) => {
        const item = locate(document, id)?.item;
        return [id, item ? move(item, dx, dy) : {}];
      }),
    ),
  };
}
