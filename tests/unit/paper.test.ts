import { describe, expect, it } from 'vitest';
import { decodeLegacy, encodeLegacy, defaultSettings, locate } from '@/domain/document/model';
import { execute, moveSelection } from '@/domain/document/commands';
import {
  DEFAULT_PAPER,
  PAPER_PRESETS,
  paperLabel,
  paperOf,
  paperPreset,
  presetPaper,
} from '@/domain/document/paper';
import { position } from '@/domain/document/geometry';
import { pageCss } from '@/infrastructure/export/html';
import { applyFieldCandidates } from '@/infrastructure/pdf/field-detector';
import { assertWorkspace } from '@/infrastructure/storage/workspace';
import { emptyPdf } from '@/application/ports';

const A4 = presetPaper('a4', false);
const A4_LANDSCAPE = presetPaper('a4', true);
const withItems = (items: Record<string, unknown>[]) =>
  decodeLegacy([{ title: 'Uji', pages: [{ page_number: 1, items }] }]);
const onPaper = (items: Record<string, unknown>[], paper = A4) => {
  const { document, assets } = withItems(items);
  return { document: execute(document, { type: 'setPaper', paper }, assets), assets };
};
const firstItem = (document: ReturnType<typeof withItems>['document']) =>
  document.documents[0]!.pages[0]!.items[0]!;

describe('paper presets', () => {
  it('names presets in either orientation and falls back to custom', () => {
    expect(paperLabel(DEFAULT_PAPER)).toBe('F4 · 210 × 330 mm');
    expect(paperLabel(A4_LANDSCAPE)).toBe('A4 lanskap · 297 × 210 mm');
    expect(paperLabel({ width: 215.9, height: 279.4 })).toBe('Letter · 215,9 × 279,4 mm');
    expect(paperLabel({ width: 200, height: 300 })).toBe('Kustom · 200 × 300 mm');
    expect(paperPreset(A4_LANDSCAPE)?.id).toBe('a4');
    expect(new Set(PAPER_PRESETS.map((preset) => preset.id)).size).toBe(PAPER_PRESETS.length);
  });

  it('treats documents without a stored paper as F4', () => {
    const { document } = withItems([]);
    expect(document).not.toHaveProperty('paper');
    expect(paperOf(document)).toEqual(DEFAULT_PAPER);
  });
});

describe('changing the paper', () => {
  it('switches to A4 when every element fits and keeps coordinates', () => {
    const { document } = onPaper([{ text: 'A', x: 10, y: 20, width: 50, height: 5 }]);
    expect(document.paper).toEqual(A4);
    expect(firstItem(document)).toMatchObject({ x: 10, y: 20 });
  });

  it('refuses a smaller sheet while elements would fall outside it', () => {
    expect(() => onPaper([{ text: 'A', x: 10, y: 310 }])).toThrow(/1 elemen berada di luar kertas/);
    expect(() =>
      onPaper([{ text: 'A', x: 150, y: 20, width: 60, height: 5 }], presetPaper('a5', false)),
    ).toThrow(/di luar kertas 148 × 210 mm/);
  });

  it('refuses sizes outside the supported range', () => {
    expect(() => onPaper([], { width: 20, height: 300 })).toThrow('50–500 mm');
    expect(() => onPaper([], { width: Number.NaN, height: 300 })).toThrow('50–500 mm');
  });

  it('allows coordinates beyond F4 width on a landscape sheet', () => {
    const { document, assets } = onPaper([], A4_LANDSCAPE);
    const next = execute(
      document,
      {
        type: 'add',
        documentId: document.documents[0]!.id,
        item: { text: 'Kanan', x: 280, y: 10, width: 15, height: 5 },
      },
      assets,
    );
    expect(firstItem(next).x).toBe(280);
  });

  it('keeps the paper across JSON edits, which do not carry it', () => {
    const { document, assets } = onPaper([{ text: 'A', x: 10, y: 20 }]);
    const json = encodeLegacy(document, assets);
    expect(JSON.stringify(json)).not.toContain('paper');
    expect(decodeLegacy(json, document, assets).document.paper).toEqual(A4);
    expect(() =>
      decodeLegacy(
        [{ title: 'Uji', pages: [{ page_number: 1, items: [{ text: 'B', x: 10, y: 300 }] }] }],
        document,
        assets,
      ),
    ).toThrow('Posisi Y berada di luar kertas.');
  });
});

describe('geometry follows the paper', () => {
  it('clamps moves and duplicates to the sheet edges', () => {
    const { document, assets } = onPaper([{ text: 'A', x: 100, y: 280, width: 40, height: 10 }]);
    const id = firstItem(document).id;
    const moved = execute(document, moveSelection(document, [id], 0, 100), assets);
    expect(locate(moved, id)!.item.y).toBe(287);
    const duplicated = execute(moved, { type: 'duplicate', ids: [id] }, assets);
    expect(duplicated.documents[0]!.pages[0]!.items[1]).toMatchObject({ x: 105, y: 287 });
  });

  it('maps pointer positions onto the sheet size', () => {
    const rect = { left: 0, top: 0, width: 297, height: 210 };
    expect(position(148.5, 105, rect, A4_LANDSCAPE)).toEqual({ x: 148.5, y: 105 });
  });

  it('prints and exports pages at the sheet size', () => {
    expect(pageCss(A4)).toContain('@page{size:210mm 297mm;margin:0}');
    expect(pageCss(A4)).toContain('.output-page{width:210mm;height:297mm}');
  });

  it('clamps applied field candidates to the sheet', () => {
    const { document, assets } = onPaper([]);
    const { data } = applyFieldCandidates(
      encodeLegacy(document, assets),
      [
        {
          id: 'c1',
          pageNumber: 1,
          source: 'test',
          label: 'Nama',
          key: 'nama',
          placeholder: '{{nama}}',
          x: 20,
          y: 295,
          width: 50,
          height: 8,
          confidence: 1,
        },
      ],
      A4,
    );
    expect(() => decodeLegacy(data, document, assets)).not.toThrow();
    const item = data[0]!.pages[0]!.items[0]!;
    expect(item.y + item.height!).toBeLessThanOrEqual(297);
  });
});

describe('stored workspaces', () => {
  const workspace = (paper: unknown) =>
    ({
      schemaVersion: 2,
      document: { ...withItems([]).document, paper },
      assets: {},
      settings: { ...defaultSettings },
      pdf: emptyPdf(),
      revision: 0,
    }) as unknown as Parameters<typeof assertWorkspace>[0];

  it('keeps a valid paper and rejects an invalid one', () => {
    expect(assertWorkspace(workspace(A4)).document.paper).toEqual(A4);
    expect(() => assertWorkspace(workspace({ width: 10, height: 10 }))).toThrow();
  });
});
