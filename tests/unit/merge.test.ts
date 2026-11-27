import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/domain/merge/csv';
import {
  fillPlaceholders,
  formatValue,
  normalizeKey,
  parseLooseDate,
  parseLooseNumber,
  placeholderKeys,
} from '@/domain/merge/placeholders';
import { mergeCoverage, mergeRows, templateKeys } from '@/domain/merge/merge';
import { decodeLegacy, encodeLegacy } from '@/domain/document/model';
import { execute } from '@/domain/document/commands';

const template = () =>
  decodeLegacy([
    {
      title: 'Formulir',
      pages: [
        {
          page_number: 1,
          items: [
            { text: 'Nama: {{Nama Lengkap}}', x: 10, y: 10 },
            { text: '{{nominal|rupiah}} ({{nominal|words}})', x: 10, y: 20 },
            { text: '{{nik}}', x: 10, y: 30, width: 80, comb_cells: 16 },
            { type: 'qr', text: 'REG-{{nik}}', x: 150, y: 10, width: 20, height: 20 },
            { type: 'mark', text: 'check', x: 10, y: 40, width: 4, height: 4 },
          ],
        },
      ],
    },
  ]);

describe('parseCsv', () => {
  it('reads quoted fields, CRLF, BOM and Excel-style semicolons', () => {
    const table = parseCsv(
      '﻿nama;alamat;nominal\r\n"Budi; S.";"Jl. ""A"", 1";1.250.000\r\n\r\nSiti;Jl. B;\r\n',
    );
    expect(table.delimiter).toBe(';');
    expect(table.columns).toEqual(['nama', 'alamat', 'nominal']);
    expect(table.rows).toEqual([
      { nama: 'Budi; S.', alamat: 'Jl. "A", 1', nominal: '1.250.000' },
      { nama: 'Siti', alamat: 'Jl. B', nominal: '' },
    ]);
  });

  it('keeps newlines inside quotes and names blank or duplicate headers', () => {
    const table = parseCsv('a,,a\n"x\ny",2,3');
    expect(table.columns).toEqual(['a', 'column_2', 'a_3']);
    expect(table.rows[0]).toEqual({ a: 'x\ny', column_2: '2', a_3: '3' });
  });

  it('detects tab-separated files', () => {
    expect(parseCsv('a\tb\n1\t2').rows).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('placeholders', () => {
  it('normalizes keys so headers and placeholders match loosely', () => {
    expect(normalizeKey(' Nama Lengkap ')).toBe('nama_lengkap');
    expect(normalizeKey('Tgl. Lahir')).toBe('tgl_lahir');
    expect(placeholderKeys('{{A}} {{ a | upper }} {{b}}')).toEqual(['a', 'b']);
  });

  it('parses numbers and dates in either convention', () => {
    expect(parseLooseNumber('1.250.000')).toBe(1250000);
    expect(parseLooseNumber('1,250,000.50')).toBe(1250000.5);
    expect(parseLooseNumber('2,5')).toBe(2.5);
    expect(parseLooseNumber('Rp 15.000')).toBe(15000);
    expect(parseLooseNumber('abc')).toBeUndefined();
    expect(parseLooseDate('2026-11-19')?.toISOString().slice(0, 10)).toBe('2026-11-19');
    expect(parseLooseDate('19/11/2026')?.toISOString().slice(0, 10)).toBe('2026-11-19');
    expect(parseLooseDate('31/02/2026')).toBeUndefined();
  });

  it('formats values', () => {
    expect(formatValue('1250000', 'rupiah', 'id')).toBe('Rp 1.250.000');
    expect(formatValue('250000000', 'words', 'id')).toBe('Dua Ratus Lima Puluh Juta');
    expect(formatValue('1115', 'words', 'id')).toBe('Seribu Seratus Lima Belas');
    expect(formatValue('21', 'words', 'en')).toBe('Twenty-One');
    expect(formatValue('1250000', 'number', 'en')).toBe('1,250,000');
    expect(formatValue('budi santoso', 'title', 'id')).toBe('Budi Santoso');
    expect(formatValue('2026-11-19', 'date:dd MMMM yyyy', 'id')).toBe('19 November 2026');
    expect(formatValue('2026-08-17', 'date:d MMMM yyyy', 'id')).toBe('17 Agustus 2026');
    expect(formatValue('2026-08-17', 'date:MMMM d, yyyy', 'en')).toBe('August 17, 2026');
    expect(formatValue('not a date', 'date:dd/MM/yyyy', 'id')).toBe('not a date');
    expect(formatValue('x', 'unknown', 'id')).toBe('x');
  });

  it('fills placeholders and reports missing columns', () => {
    const result = fillPlaceholders('Yth. {{nama|upper}}, {{kota}}', { Nama: 'Budi' }, 'id');
    expect(result).toEqual({ text: 'Yth. BUDI, {{kota}}', missing: ['kota'] });
  });
});

describe('mergeRows', () => {
  it('lists the template keys and their CSV coverage', () => {
    const entry = template().document.documents[0]!;
    expect(templateKeys(entry)).toEqual(['nama_lengkap', 'nominal', 'nik']);
    expect(mergeCoverage(entry, ['Nama Lengkap', 'NIK', 'kota'])).toEqual({
      keys: ['nama_lengkap', 'nominal', 'nik'],
      missing: ['nominal'],
      unused: ['kota'],
    });
  });

  it('creates one document per row with fresh ids and filled text', () => {
    const entry = template().document.documents[0]!;
    const rows = [
      { 'Nama Lengkap': 'Budi', nominal: '1500000', nik: '3271' },
      { 'Nama Lengkap': 'Siti', nominal: '2000', nik: '3272' },
    ];
    const merged = mergeRows(entry, rows, { titleColumn: 'Nama Lengkap', locale: 'id' });
    expect(merged.map((doc) => doc.title)).toEqual(['Budi', 'Siti']);
    const texts = merged[0]!.pages[0]!.items.map((item) => item.text);
    expect(texts).toEqual([
      'Nama: Budi',
      'Rp 1.500.000 (Satu Juta Lima Ratus Ribu)',
      '3271',
      'REG-3271',
      'check',
    ]);
    const ids = merged.flatMap((doc) => [
      doc.id,
      ...doc.pages.flatMap((page) => [page.id, ...page.items.map((item) => item.id)]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(entry.id);
    expect(entry.pages[0]!.items[0]!.text).toBe('Nama: {{Nama Lengkap}}');
  });

  it('runs as one command that replaces or appends documents', () => {
    const { document, assets } = template();
    const rows = [{ 'Nama Lengkap': 'A' }, { 'Nama Lengkap': 'B' }];
    const documentId = document.documents[0]!.id;
    const replaced = execute(document, { type: 'merge', documentId, rows, replace: true }, assets);
    expect(replaced.documents.map((doc) => doc.title)).toEqual(['Formulir 1', 'Formulir 2']);
    const appended = execute(document, { type: 'merge', documentId, rows, replace: false }, assets);
    expect(appended.documents).toHaveLength(3);
    expect(() =>
      execute(document, { type: 'merge', documentId, rows: [], replace: true }, assets),
    ).toThrow();
    // The merged result is ordinary JSON that round-trips.
    expect(() => decodeLegacy(encodeLegacy(replaced, assets))).not.toThrow();
  });
});
