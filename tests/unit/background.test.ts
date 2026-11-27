import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAPER as F4 } from '@/domain/document/paper';
import { backgroundBounds, fitBackgroundRect } from '@/domain/document/background';
import { fitPdfCandidates } from '@/infrastructure/pdf/background';
import type { Candidate } from '@/application/ports';

describe('proportional F4 backgrounds', () => {
  it.each([
    { width: 1700, height: 2600 },
    { width: 595, height: 842 },
    { width: 400, height: 1000 },
    { width: 960, height: 612 },
    { width: 100, height: 100 },
    { width: 210, height: 330 },
  ])('fits $width × $height without cropping or stretching', (image) => {
    const bounds = backgroundBounds(image, F4);
    expect(bounds.width / bounds.height).toBeCloseTo(image.width / image.height, 10);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(210);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(330);
    expect(bounds.x * 2 + bounds.width).toBeCloseTo(210);
    expect(bounds.y * 2 + bounds.height).toBeCloseTo(330);
    expect(Math.min(210 - bounds.width, 330 - bounds.height)).toBeCloseTo(0);
  });
  it('maps existing normalized candidates into the centered image without mutating storage', () => {
    const rect = { id: 'saved-field', x: 21, y: 33, width: 42, height: 66 };
    expect(fitBackgroundRect(rect, { width: 100, height: 100 }, F4)).toEqual({
      id: 'saved-field',
      x: 21,
      y: 81,
      width: 42,
      height: 42,
    });
    expect(rect.y).toBe(33);
    expect(backgroundBounds({ width: 1700, height: 2600 }, F4).height).toBeCloseTo(321.176470588);
    expect(() => backgroundBounds({ width: 0, height: 100 }, F4)).toThrow();
    expect(() => backgroundBounds({ width: Infinity, height: 100 }, F4)).toThrow();
  });
  it('uses each cached PDF image dimensions once and refuses missing backgrounds', async () => {
    const decoded: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 100;
        naturalHeight = 100;
        async decode() {
          decoded.push(this.src);
        }
      },
    );
    try {
      const candidate: Candidate = {
        id: 'a',
        pageNumber: 1,
        source: 'acroform',
        label: 'Nama',
        key: 'nama',
        placeholder: '{{nama}}',
        x: 21,
        y: 33,
        width: 42,
        height: 66,
        confidence: 1,
      };
      const fitted = await fitPdfCandidates([candidate, { ...candidate, id: 'b' }], ['square'], F4);
      expect(fitted[0]!.y).toBe(81);
      expect(decoded).toEqual(['square']);
      expect(candidate.y).toBe(33);
      await expect(fitPdfCandidates([candidate], [], F4)).rejects.toThrow('Unggah ulang PDF');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
