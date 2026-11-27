import type { Item } from './model';
import type { PageGuides } from './measurement';
import type { Paper } from './paper';
/** Rounds to the 0.1 mm grid used by stored coordinates. */
export const round = (value: number) => Math.round(value * 10) / 10;
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
/**
 * Clamps then rounds to 0.1 mm without leaving [min, max]. Plain `round(clamp())`
 * can round up past the limit (e.g. 176.67 → 176.7 with width 33.33 overflows 210 mm),
 * which makes schema validation reject the whole command.
 */
export function roundWithin(value: number, min: number, max: number) {
  const upper = Math.max(min, max);
  const rounded = round(clamp(value, min, upper));
  if (rounded > upper) return Math.floor(upper * 10) / 10;
  if (rounded < min) return Math.ceil(min * 10) / 10;
  return rounded;
}
export type ItemSize = { width: number; height: number };
export function dimensions(item: Item, measured?: ItemSize) {
  return {
    width:
      Number(item.width) ||
      measured?.width ||
      Math.min(60, Math.max(5, item.text.length * (Number(item.font_size) || 10) * 0.18)),
    height: Number(item.height) || measured?.height || (Number(item.font_size) || 10) * 0.5 + 1,
  };
}
/** Converts a pointer position over the rendered sheet to paper millimetres. */
export function position(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  paper: Paper,
) {
  return {
    x: round(((clientX - rect.left) / rect.width) * paper.width),
    y: round(((clientY - rect.top) / rect.height) * paper.height),
  };
}
export function move(item: Item, dx: number, dy: number, paper: Paper) {
  const { width, height } = dimensions(item);
  // Auto-sized text has no stored width/height, so only its origin is kept on the sheet.
  return {
    x: roundWithin(item.x + dx, 0, paper.width - (item.width ? width : 0)),
    y: roundWithin(item.y + dy, 0, paper.height - (item.height ? height : 0)),
  };
}
export function resize(
  item: Item,
  paper: Paper,
  direction: string,
  dx: number,
  dy: number,
  aspect = false,
  center = false,
  measured?: ItemSize,
) {
  const size = dimensions(item, measured);
  const rad = (-(Number(item.rotation) || 0) * Math.PI) / 180;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad),
    localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  let width =
    size.width +
    (direction.includes('e') ? localX : direction.includes('w') ? -localX : 0) * (center ? 2 : 1);
  let height =
    size.height +
    (direction.includes('s') ? localY : direction.includes('n') ? -localY : 0) * (center ? 2 : 1);
  if (aspect) {
    if (Math.abs(width / size.width - 1) > Math.abs(height / size.height - 1))
      height = (width * size.height) / size.width;
    else width = (height * size.width) / size.height;
  }
  width = Math.max(1, width);
  height = Math.max(1, height);
  // CSS rotates around the center. Keep the opposite handle fixed in world
  // coordinates instead of moving the unrotated top-left by the local delta.
  const angle = -rad,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const ax = center ? 0.5 : direction.includes('e') ? 0 : direction.includes('w') ? 1 : 0.5;
  const ay = center ? 0.5 : direction.includes('s') ? 0 : direction.includes('n') ? 1 : 0.5;
  const oldX = (ax - 0.5) * size.width,
    oldY = (ay - 0.5) * size.height;
  const anchorX = item.x + size.width / 2 + oldX * cos - oldY * sin;
  const anchorY = item.y + size.height / 2 + oldX * sin + oldY * cos;
  const boxAt = (fraction: number) => {
    const w = size.width + (width - size.width) * fraction;
    const h = size.height + (height - size.height) * fraction;
    const localAnchorX = (ax - 0.5) * w,
      localAnchorY = (ay - 0.5) * h;
    return {
      width: w,
      height: h,
      x: anchorX - localAnchorX * cos + localAnchorY * sin - w / 2,
      y: anchorY - localAnchorX * sin - localAnchorY * cos - h / 2,
    };
  };
  const inside = (box: ReturnType<typeof boxAt>) =>
    box.x >= -1e-9 &&
    box.y >= -1e-9 &&
    box.x + box.width <= paper.width + 1e-9 &&
    box.y + box.height <= paper.height + 1e-9;
  let box = boxAt(1);
  if (!inside(box) && inside(boxAt(0))) {
    let low = 0,
      high = 1;
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (inside(boxAt(middle))) low = middle;
      else high = middle;
    }
    box = boxAt(low);
  }
  const x = round(clamp(box.x, 0, paper.width - 1));
  const y = round(clamp(box.y, 0, paper.height - 1));
  return {
    x,
    y,
    width: roundWithin(box.width, 0.1, paper.width - x),
    height: roundWithin(box.height, 0.1, paper.height - y),
  };
}
export function snap(
  item: Item,
  paper: Paper,
  dx: number,
  dy: number,
  others: Item[],
  threshold = 1.5,
  guides: PageGuides = {},
  sizes?: ReadonlyMap<string, ItemSize>,
  /** Grid spacing in mm; the item's top-left corner also snaps to grid lines. */
  grid = 0,
) {
  const { width, height } = dimensions(item, sizes?.get(item.id));
  let x = item.x + dx,
    y = item.y + dy;
  let guideX: number | undefined, guideY: number | undefined;
  // Sheet edges and centre lines.
  const xs = [0, paper.width / 2, paper.width],
    ys = [0, paper.height / 2, paper.height];
  if (guides.x !== undefined) xs.push(guides.x);
  if (guides.y !== undefined) ys.push(guides.y);
  others.forEach((other) => {
    const d = dimensions(other, sizes?.get(other.id));
    xs.push(other.x, other.x + d.width / 2, other.x + d.width);
    ys.push(other.y, other.y + d.height / 2, other.y + d.height);
  });
  let bestX = threshold,
    bestY = threshold;
  for (const target of xs)
    for (const edge of [0, width / 2, width]) {
      const delta = target - (item.x + dx + edge);
      if (Math.abs(delta) < bestX) {
        bestX = Math.abs(delta);
        x = item.x + dx + delta;
        guideX = target;
      }
    }
  for (const target of ys)
    for (const edge of [0, height / 2, height]) {
      const delta = target - (item.y + dy + edge);
      if (Math.abs(delta) < bestY) {
        bestY = Math.abs(delta);
        y = item.y + dy + delta;
        guideY = target;
      }
    }
  if (grid > 0) {
    // Grid lines never draw a guide; they only pull the top-left corner.
    const gridDelta = (value: number) => Math.round(value / grid) * grid - value;
    const deltaX = gridDelta(item.x + dx);
    const deltaY = gridDelta(item.y + dy);
    if (Math.abs(deltaX) < bestX) {
      x = item.x + dx + deltaX;
      guideX = undefined;
    }
    if (Math.abs(deltaY) < bestY) {
      y = item.y + dy + deltaY;
      guideY = undefined;
    }
  }
  return { dx: x - item.x, dy: y - item.y, guideX, guideY };
}
