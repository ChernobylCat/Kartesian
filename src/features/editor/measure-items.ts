import type { ItemSize } from '@/domain/document/geometry';

export function measureItem(node: HTMLElement): ItemSize {
  const style = getComputedStyle(node);
  return {
    width: (parseFloat(style.width) * 25.4) / 96,
    height: (parseFloat(style.height) * 25.4) / 96,
  };
}

export function measureSelection(ids: readonly string[]) {
  const sizes: Record<string, ItemSize> = {};
  const selected = new Set(ids);
  document.querySelectorAll<HTMLElement>('#printContainer [data-item-id]').forEach((node) => {
    const id = node.dataset.itemId!;
    if (selected.has(id)) sizes[id] = measureItem(node);
  });
  return sizes;
}
