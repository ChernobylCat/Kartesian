import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { decodeLegacy, defaultSettings } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';
import { presetPaper } from '@/domain/document/paper';
import { emptyPdf } from '@/application/ports';
import { exportPdf, type ImageLoader } from '@/infrastructure/export/pdf';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const MM = 72 / 25.4;
const dataUrlLoader: ImageLoader = async (source) => ({
  bytes: Uint8Array.from(atob(source.split(',')[1]!), (char) => char.charCodeAt(0)),
  type: 'png',
});

function snapshot(items: Record<string, unknown>[], settings = {}) {
  const decoded = decodeLegacy([
    { title: 'PDF', pages: [{ page_number: 1, items }] },
    { title: 'Kedua', pages: [{ page_number: 1, items: [{ text: 'Dua', x: 10, y: 10 }] }] },
  ]);
  return {
    document: execute(
      decoded.document,
      { type: 'setPaper', paper: presetPaper('a4', false) },
      decoded.assets,
    ),
    assets: decoded.assets,
    settings: { ...defaultSettings, hideCalibration: true, ...settings },
    pdf: emptyPdf(),
  };
}

async function read(bytes: Uint8Array) {
  // PDF.js transfers the buffer it reads, so give it a copy.
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const [, , width, height] = page.view;
    const content = await page.getTextContent();
    pages.push({
      width,
      height,
      texts: content.items.flatMap((item) =>
        'str' in item && item.str.trim()
          ? [{ text: item.str, x: item.transform[4] as number, y: item.transform[5] as number }]
          : [],
      ),
    });
  }
  return pages;
}

describe('native PDF export', () => {
  it('writes one vector page per output page at the sheet size', async () => {
    const pages = await read(await exportPdf(snapshot([{ text: 'Halo', x: 20, y: 30 }])));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.width).toBeCloseTo(210 * MM, 1);
    expect(pages[0]!.height).toBeCloseTo(297 * MM, 1);
    const text = pages[0]!.texts.find((entry) => entry.text === 'Halo')!;
    expect(text.x).toBeCloseTo(20 * MM, 0);
    // Baseline sits below the item top by roughly the line box's ascent (10 pt, 1.5 lines).
    const top = pages[0]!.height - 30 * MM;
    expect(top - text.y).toBeGreaterThan(8);
    expect(top - text.y).toBeLessThan(14);
  });

  it('applies the printer offset, alignment, comb cells and the print scope', async () => {
    const data = snapshot(
      [
        {
          text: 'Kanan',
          x: 20,
          y: 30,
          width: 50,
          text_align: 'right',
          font_family: 'Arial, sans-serif',
        },
        { text: '1234', x: 20, y: 60, width: 40, comb_cells: 4 },
      ],
      { offsetX: 2, offsetY: 0 },
    );
    const second = data.document.documents[1]!.id;
    const pages = await read(
      await exportPdf(data, { documentIds: [data.document.documents[0]!.id], pages: '' }),
    );
    expect(pages).toHaveLength(1);
    const right = pages[0]!.texts.find((entry) => entry.text === 'Kanan')!;
    expect(right.x).toBeGreaterThan((22 + 30) * MM);
    const digits = pages[0]!.texts
      .filter((entry) => /^\d$/.test(entry.text))
      .map((entry) => entry.x);
    expect(digits).toHaveLength(4);
    const gaps = digits.slice(1).map((x, index) => x - digits[index]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(10 * MM, 0);
    expect(second).toBeTruthy();
  });

  it('draws images, graphics and codes, and replaces unencodable characters', async () => {
    const bytes = await exportPdf(
      snapshot([
        { type: 'image', text: PNG, x: 10, y: 10, width: 20, height: 20 },
        { type: 'mark', text: 'check', x: 40, y: 10, width: 5, height: 5 },
        {
          type: 'qr',
          text: 'https://example.com',
          x: 60,
          y: 10,
          width: 20,
          height: 20,
          rotation: 90,
        },
        { text: 'Halo ✓ 漢', x: 10, y: 50 },
      ]),
      FULL,
      dataUrlLoader,
    );
    const pages = await read(bytes);
    expect(pages[0]!.texts.map((entry) => entry.text).join(' ')).toContain('Halo ? ?');
    expect(bytes.length).toBeGreaterThan(2000);
  });
});

const FULL = { documentIds: 'all' as const, pages: '' };
