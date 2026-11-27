import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Candidate } from '../application/ports';
import type { LegacyDocument } from '../domain/document/schema';
export function scanPdfDocument(
  pdf: PDFDocumentProxy,
  options?: {
    ops?: Record<string, number>;
    nextFrame?: () => Promise<unknown>;
    onProgress?: (progress: { pageNumber: number; totalPages: number; percent: number }) => void;
  },
): Promise<Candidate[]>;
export function deduplicateCandidates(candidates: Candidate[]): Candidate[];
export function normalizePlaceholderKey(value: string, fallback?: string): string;
export function applyFieldCandidates(
  document: LegacyDocument,
  candidates: Candidate[],
): { data: LegacyDocument; addedCount: number; appliedCandidateIds: string[] };
