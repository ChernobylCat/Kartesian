import { describe, it, expect } from 'vitest';
import {
  normalizePlaceholderKey,
  deduplicateCandidates,
  applyFieldCandidates,
  multiplyTransform,
  convertPdfRectToCanvas,
} from '@/infrastructure/pdf/field-detector';
import type { Candidate } from '@/application/ports';
import type { LegacyDocument } from '@/domain/document/schema';

describe('field-detector (native TypeScript)', () => {
  it('normalizes placeholder keys properly', () => {
    expect(normalizePlaceholderKey('Nama Lengkap:')).toBe('nama_lengkap');
    expect(normalizePlaceholderKey('  Tanda Tangan  ')).toBe('tanda_tangan');
    expect(normalizePlaceholderKey('NIK / Paspor (WNA)')).toBe('nik_paspor_wna');
    expect(normalizePlaceholderKey('   ')).toBe('field');
    expect(normalizePlaceholderKey('', 'custom_fallback')).toBe('custom_fallback');
  });

  it('multiplies 2D affine transform matrices correctly', () => {
    const identity = [1, 0, 0, 1, 0, 0];
    const translation = [1, 0, 0, 1, 50, 100];
    const result = multiplyTransform(identity, translation);
    expect(result).toEqual([1, 0, 0, 1, 50, 100]);
  });

  it('converts PDF rect to canvas rect using viewport', () => {
    const mockViewport = {
      width: 1000,
      height: 1500,
      convertToViewportPoint(x: number, y: number): [number, number] {
        return [x * 2, y * 2];
      },
    };
    const rect = convertPdfRectToCanvas([10, 20, 110, 120], mockViewport);
    expect(rect).not.toBeNull();
    if (rect) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('deduplicates overlapping candidates respecting source priority', () => {
    const candidates: Candidate[] = [
      {
        id: '1',
        pageNumber: 1,
        source: 'vector-line',
        label: 'Nama',
        key: 'nama',
        placeholder: '{{nama}}',
        x: 20,
        y: 50,
        width: 60,
        height: 6,
        confidence: 0.8,
      },
      {
        id: '2',
        pageNumber: 1,
        source: 'acroform', // higher priority than vector-line
        label: 'Nama Debitur',
        key: 'nama_debitur',
        placeholder: '{{nama_debitur}}',
        x: 20.5,
        y: 50.2,
        width: 59.5,
        height: 6,
        confidence: 0.99,
      },
      {
        id: '3',
        pageNumber: 1,
        source: 'vector-line',
        label: 'Alamat',
        key: 'alamat',
        placeholder: '{{alamat}}',
        x: 20,
        y: 100,
        width: 80,
        height: 10,
        confidence: 0.85,
      },
    ];

    const deduplicated = deduplicateCandidates(candidates);
    expect(deduplicated).toHaveLength(2);
    // The acroform candidate should win over vector-line
    expect(deduplicated[0]?.source).toBe('acroform');
    expect(deduplicated[1]?.key).toBe('alamat');
  });

  it('applies field candidates cleanly to document data without duplicate pollution', () => {
    const doc: LegacyDocument = [
      {
        title: 'Dokumen Uji',
        pages: [
          {
            page_number: 1,
            items: [],
          },
        ],
      },
    ];

    const candidates: Candidate[] = [
      {
        id: 'cand-1',
        pageNumber: 1,
        source: 'table-cell',
        label: 'Nomor Kontrak',
        key: 'nomor_kontrak',
        placeholder: '{{nomor_kontrak}}',
        x: 30,
        y: 40,
        width: 50,
        height: 8,
        confidence: 0.9,
      },
    ];

    const result = applyFieldCandidates(doc, candidates);
    expect(result.addedCount).toBe(1);
    expect(result.appliedCandidateIds).toContain('cand-1');
    expect(result.data[0]?.pages[0]?.items).toHaveLength(1);
    expect(result.data[0]?.pages[0]?.items[0]?.text).toBe('{{nomor_kontrak}}');

    // Applying same candidate again should not duplicate
    const reapply = applyFieldCandidates(result.data, candidates);
    expect(reapply.addedCount).toBe(0);
    expect(reapply.data[0]?.pages[0]?.items).toHaveLength(1);
  });
});
