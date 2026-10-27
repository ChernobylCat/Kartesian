import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Candidate } from '@/application/ports';
import { candidateSchema } from '../storage/workspace';
import {
  scanPdfDocument,
  deduplicateCandidates,
  normalizePlaceholderKey,
  applyFieldCandidates,
} from '../../pdf/field-detector.mjs';
import type { LegacyDocument } from '@/domain/document/schema';

export type ScanMode = 'auto' | 'pdfjs' | 'pymupdf' | 'paddleocr';
export { normalizePlaceholderKey };
const endpoint = 'http://127.0.0.1:8765';
async function timedFetch<T>(
  url: string,
  options: RequestInit,
  timeout: number,
  parent: AbortSignal | undefined,
  read: (response: Response) => Promise<T>,
) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Service lokal timeout.', 'TimeoutError')),
    timeout,
  );
  try {
    return await read(await fetch(url, { ...options, signal: controller.signal }));
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
export async function detectorHealth(signal?: AbortSignal) {
  try {
    const ok = await timedFetch(
      `${endpoint}/health`,
      {},
      2000,
      signal,
      async (response) => response.ok,
    );
    return ok ? 'Service lokal siap' : 'Service lokal belum lengkap';
  } catch {
    return 'Service lokal tidak tersedia; PDF.js tetap aktif';
  }
}
export async function scan(
  pdf: PDFDocumentProxy,
  bytes: Uint8Array,
  mode: ScanMode,
  ops: Record<string, number>,
  signal: AbortSignal,
  progress: (value: string) => void,
) {
  let browser: Candidate[] = [];
  const warnings: string[] = [];
  if (mode === 'auto' || mode === 'pdfjs') {
    browser = (await scanPdfDocument(pdf, {
      ops,
      nextFrame: async () => {
        signal.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
      onProgress: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        progress(`Memindai PDF.js ${pageNumber}/${totalPages}`),
    })) as Candidate[];
  }
  signal.throwIfAborted();
  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1).filter(
    (page) => mode !== 'auto' || !browser.some((candidate) => candidate.pageNumber === page),
  );
  let local: Candidate[] = [];
  if (mode !== 'pdfjs' && pages.length) {
    progress(`Memindai ${pages.length} halaman dengan service lokal…`);
    const query = new URLSearchParams({
      pages: pages.join(','),
      ocr: mode === 'paddleocr' ? 'always' : mode === 'pymupdf' ? 'never' : 'auto',
      mode: mode === 'paddleocr' ? 'ocr' : mode === 'pymupdf' ? 'pymupdf' : 'hybrid',
    });
    try {
      const payload = await timedFetch(
        `${endpoint}/v1/detect?${query}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
        },
        120000,
        signal,
        async (response) => {
          if (!response.ok) throw new Error(`Service lokal HTTP ${response.status}`);
          return (await response.json()) as { candidates?: unknown[]; warnings?: unknown[] };
        },
      );
      local = (payload.candidates ?? []).flatMap((raw) => {
        const result = candidateSchema.safeParse(raw);
        return result.success && pages.includes(result.data.pageNumber) ? [result.data] : [];
      });
      warnings.push(...(payload.warnings ?? []).map(String));
    } catch (error) {
      signal.throwIfAborted();
      if (mode !== 'auto') throw error;
      warnings.push('Service lokal tidak tersedia atau timeout. Hasil PDF.js dipertahankan.');
    }
  }
  signal.throwIfAborted();
  return { candidates: deduplicateCandidates([...browser, ...local]) as Candidate[], warnings };
}
export function applyCandidates(document: LegacyDocument, candidates: Candidate[]) {
  return applyFieldCandidates(document, candidates).data as LegacyDocument;
}
