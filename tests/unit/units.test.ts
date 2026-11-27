import { describe, expect, it } from 'vitest';
import { fromUnit, toUnit } from '@/domain/document/units';
import { rulerTicks } from '@/features/editor/components/ruler-ticks';

describe('display units', () => {
  it('converts for display and back onto the 0.1 mm grid', () => {
    expect(toUnit(215.9, 'in')).toBe(8.5);
    expect(toUnit(25.4, 'pt')).toBe(72);
    expect(fromUnit(8.5, 'in')).toBe(215.9);
    expect(fromUnit(1, 'in')).toBe(25.4);
    expect(fromUnit(10, 'pt')).toBe(3.5);
    expect(toUnit(12.3, 'mm')).toBe(12.3);
  });

  it('draws inch rulers with eighth-inch ticks and a label per inch', () => {
    const { ticks, labels, labelText, scale } = rulerTicks(215.9, 1, 'in');
    expect(ticks).toHaveLength(8 * 8 + 5);
    expect(labels.map(labelText)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
    expect(ticks[8]).toMatchObject({ size: 9, position: 25.4 * scale });
    expect(ticks[4]!.size).toBe(6);
  });

  it('keeps millimetre rulers unchanged', () => {
    const { labels, labelText } = rulerTicks(210, 1);
    expect(labels.at(-1)).toBe(210);
    expect(labelText(200)).toBe('200');
  });
});
