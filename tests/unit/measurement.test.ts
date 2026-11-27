import { describe, expect, it } from 'vitest';
import { measurementBounds, unionBounds } from '@/domain/document/measurement';
import { snap } from '@/domain/document/geometry';
import type { Item } from '@/domain/document/model';
import { rulerTicks } from '@/features/editor/components/ruler-ticks';

const item: Item = { id: 'a', text: 'Label', x: 20, y: 30, width: 20, height: 10 };
describe('canvas measurements', () => {
  it('measures rotated bounds around the same center as CSS', () => {
    const box = measurementBounds([{ ...item, rotation: 90 }])!;
    expect(box.x).toBeCloseTo(25);
    expect(box.y).toBeCloseTo(25);
    expect(box.width).toBeCloseTo(10);
    expect(box.height).toBeCloseTo(20);
    expect(unionBounds([box, { x: 5, y: 0, width: 5, height: 5 }])).toEqual({
      x: 5,
      y: 0,
      width: 30,
      height: 45,
    });
    expect(measurementBounds([])).toBeNull();
  });
  it('uses measured text dimensions when width and height are automatic', () => {
    const box = measurementBounds(
      [{ ...item, width: undefined, height: undefined }],
      new Map([['a', { width: 31.4, height: 5.2 }]]),
    )!;
    expect(box.x).toBe(20);
    expect(box.y).toBe(30);
    expect(box.width).toBeCloseTo(31.4, 8);
    expect(box.height).toBeCloseTo(5.2, 8);
  });
  it('includes session guides in the existing millimeter snap contract', () => {
    const result = snap({ ...item, width: 10, height: 5 }, 31.2, 21.4, [], 1.5, { x: 50, y: 50 });
    expect(result).toEqual({ dx: 30, dy: 20, guideX: 50, guideY: 50 });
  });
  it.each([0.4, 0.5, 0.65, 0.75, 1, 1.25, 1.5])(
    'keeps ruler marks physically spaced and labels readable at zoom %s',
    (zoom) => {
      for (const length of [210, 330]) {
        const { ticks, labels, scale } = rulerTicks(length, zoom);
        expect(labels[0]).toBe(0);
        expect(labels.at(-1)).toBe(length);
        expect(ticks.at(-1)!.position).toBeCloseTo(((length * 96) / 25.4) * zoom);
        expect(scale).toBeCloseTo((96 / 25.4) * zoom);
        if (zoom <= 0.5)
          for (let index = 1; index < labels.length; index++)
            expect(labels[index]! - labels[index - 1]!).toBeGreaterThanOrEqual(20);
      }
    },
  );
});
