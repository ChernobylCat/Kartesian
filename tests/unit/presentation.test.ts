import { describe, expect, it } from 'vitest';
import { decodeLegacy } from '@/domain/document/model';
import {
  combCells,
  renderedFontSize,
  textStyle,
  type TextMeasurer,
} from '@/domain/document/presentation';
import { itemCss } from '@/infrastructure/export/html';
import { outputPages } from '@/infrastructure/export/html';
import { defaultSettings } from '@/domain/document/model';
import { emptyPdf } from '@/application/ports';

const item = (fields: Record<string, unknown>) =>
  decodeLegacy([{ title: 'T', pages: [{ page_number: 1, items: [{ x: 10, y: 10, ...fields }] }] }])
    .document.documents[0]!.pages[0]!.items[0]!;
/** 1 mm per character at 10 pt, scaled linearly with the font size. */
const measure: TextMeasurer = (text, font) =>
  Array.from(text).length * (Number(/([\d.]+)pt/.exec(font)![1]) / 10);

describe('presentation', () => {
  it('adds alignment, spacing and line height only when set', () => {
    expect(textStyle(item({ text: 'A' }))).not.toHaveProperty('text-align');
    const css = textStyle(
      item({ text: 'A', width: 40, text_align: 'center', letter_spacing: 1.5, line_height: 1.2 }),
    );
    expect(css).toMatchObject({
      'text-align': 'center',
      'letter-spacing': '1.5mm',
      'line-height': '1.2',
    });
  });

  it('splits comb text into a fixed number of cells', () => {
    expect(combCells(item({ text: '3271', width: 30, comb_cells: 6 }))).toEqual([
      '3',
      '2',
      '7',
      '1',
      '',
      '',
    ]);
    expect(combCells(item({ text: '1234567', width: 30, comb_cells: 3 }))).toEqual(['1', '2', '3']);
    expect(combCells(item({ text: '12' }))).toBeUndefined();
  });

  it('shrinks the font until every line fits the box', () => {
    // 20 characters need 20 mm at 10 pt; a 10 mm box needs 5 pt.
    const long = item({ text: 'x'.repeat(20), width: 10, font_size: 10, fit: 'shrink' });
    expect(renderedFontSize(long, measure)).toBe(5);
    expect(renderedFontSize({ ...long, fit: undefined }, measure)).toBe(10);
    const tiny = item({ text: 'x'.repeat(200), width: 10, font_size: 10, fit: 'shrink' });
    expect(renderedFontSize(tiny, measure)).toBe(4);
  });

  it('prints the same layout rules as the canvas', () => {
    const comb = item({ text: '32', width: 20, comb_cells: 4, text_align: 'center' });
    expect(itemCss(comb, defaultSettings, measure)).toContain('text-align:center');
    const html = outputPages({
      document: decodeLegacy([
        {
          title: 'T',
          pages: [
            { page_number: 1, items: [{ text: '32', x: 1, y: 1, width: 20, comb_cells: 4 }] },
          ],
        },
      ]).document,
      assets: {},
      settings: { ...defaultSettings, hideCalibration: true },
      pdf: emptyPdf(),
    });
    expect(html).toContain(
      '<span class="comb"><span class="comb-cell">3</span><span class="comb-cell">2</span><span class="comb-cell"></span><span class="comb-cell"></span></span>',
    );
  });
});
