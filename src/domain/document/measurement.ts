import type { Item } from './model';
import { dimensions } from './geometry';

export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
export type PageGuides = { x?: number; y?: number };
export type ItemSizes = Map<string, { width: number; height: number }>;

export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

export function measurementBounds(items: Item[], sizes: ItemSizes = new Map()): Bounds | null {
  return unionBounds(
    items.map((item) => {
      const measured = sizes.get(item.id) ?? dimensions(item);
      const width = item.width ?? measured.width;
      const height = item.height ?? measured.height;
      const angle = ((item.rotation ?? 0) * Math.PI) / 180;
      const w = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
      const h = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle));
      return { x: item.x + (width - w) / 2, y: item.y + (height - h) / 2, width: w, height: h };
    }),
  );
}
