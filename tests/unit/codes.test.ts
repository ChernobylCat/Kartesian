import { describe, expect, it } from 'vitest';
import {
  barcodeSvg,
  code128Modules,
  code128Symbols,
  ean13CheckDigit,
  ean13Pattern,
  qrModules,
  qrSvg,
} from '@/domain/document/codes';
import { itemGraphic } from '@/domain/document/graphics';
import { decodeLegacy } from '@/domain/document/model';

/** Bars as '1' and spaces as '0', one character per module. */
const bits = (modules: number[]) =>
  modules.map((width, index) => (index % 2 ? '0' : '1').repeat(width)).join('');

// Reference patterns generated with python-barcode 0.15.1 for values where both
// encoders choose the same code sets.
const CODE128_REFERENCE: Record<string, string> = {
  'Hello World':
    '110100100001100010100010110010000110010100001100101000010001111010110110011001110100011010001111010100100111101100101000010000100110101100011101100011101011',
  '1234567890':
    '110100111001011001110010001011000111000101101100001010011011110110100111100101100011101011',
  'ABC-123456':
    '110100100001010001100010001011000100010001101001101110010111011110101100111001000101100011100010110101100001001100011101011',
  x: '1101001000011110010010110110111101100011101011',
  '3271021994080001':
    '110100111001100011011010011010000110011001101100101110010001011110100011001001101100110011001101100101001100001100011101011',
};
const EAN13_REFERENCE: Record<string, string> = {
  '400638133393':
    '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101',
  '590123412345':
    '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101',
  '9780201379624':
    '10101110110001001010011100100110100111001100101010100001010001001110100101000011011001011100101',
};

describe('Code 128', () => {
  it('matches the reference encoder', () => {
    for (const [value, expected] of Object.entries(CODE128_REFERENCE))
      expect(bits(code128Modules(value)!), value).toBe(expected);
  });

  it('switches to code set C for long digit runs and rejects non-ASCII', () => {
    expect(code128Symbols('AB123456')!.slice(0, 4)).toEqual([104, 33, 34, 99]);
    expect(code128Modules('Kartesian 2026')).toBeDefined();
    expect(code128Symbols('é')).toBeUndefined();
    expect(code128Symbols('')).toBeUndefined();
  });
});

describe('EAN-13', () => {
  it('matches the reference encoder and checks the check digit', () => {
    for (const [value, expected] of Object.entries(EAN13_REFERENCE))
      expect(ean13Pattern(value), value).toBe(expected);
    expect(ean13CheckDigit('978020137962')).toBe(4);
    expect(ean13Pattern('9780201379625')).toBeUndefined();
    expect(ean13Pattern('12345')).toBeUndefined();
  });
});

describe('QR and graphics', () => {
  it('encodes UTF-8 text and draws placeholders for unfilled templates', () => {
    const modules = qrModules('https://example.com/ä')!;
    expect(modules.length).toBeGreaterThanOrEqual(21);
    expect(modules.length % 4).toBe(1);
    expect(qrSvg('{{nik}}', 20, 20, '#000000')).toContain('{{nik}}');
    expect(barcodeSvg('ID-{{nik}}', 'code128', 40, 10, '#000000')).toContain('{{nik}}');
    expect(qrSvg('ABC', 20, 20, '#000000')).toContain('<path fill="#000000"');
    expect(barcodeSvg('12345', 'ean13', 30, 10, '#000000')).toContain('stroke-dasharray');
  });

  it('draws marks, lines and cover boxes inside the item box', () => {
    const items = decodeLegacy([
      {
        title: 'T',
        pages: [
          {
            page_number: 1,
            items: [
              { type: 'mark', text: 'check', x: 1, y: 1, width: 5, height: 5 },
              {
                type: 'line',
                text: 'diagonal',
                x: 1,
                y: 1,
                width: 30,
                height: 10,
                stroke_width: 0.5,
              },
              {
                type: 'rect',
                text: '',
                x: 1,
                y: 1,
                width: 40,
                height: 8,
                color: '#ff0000',
                stroke_width: 0.4,
              },
              { text: 'plain', x: 1, y: 1 },
            ],
          },
        ],
      },
    ]).document.documents[0]!.pages[0]!.items;
    expect(itemGraphic(items[0]!)).toContain('viewBox="0 0 5 5"');
    expect(itemGraphic(items[1]!)).toContain('d="M0 0 L30 10"');
    expect(itemGraphic(items[1]!)).toContain('stroke-width="0.5"');
    expect(itemGraphic(items[2]!)).toContain('fill="#ffffff" stroke="#ff0000" stroke-width="0.4"');
    expect(itemGraphic(items[3]!)).toBeUndefined();
    expect(() =>
      decodeLegacy([
        {
          title: 'T',
          pages: [
            {
              page_number: 1,
              items: [{ type: 'mark', text: 'star', x: 1, y: 1, width: 5, height: 5 }],
            },
          ],
        },
      ]),
    ).toThrow();
  });
});
