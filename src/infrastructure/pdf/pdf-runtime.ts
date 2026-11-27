import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LIMITS } from '@/domain/document/schema';
import type { Settings } from '@/domain/document/model';
import { t } from '@/i18n/core';

export async function openPdf(bytes: Uint8Array, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const library = await import('pdfjs-dist');
  signal?.throwIfAborted();
  library.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  const task = library.getDocument({
    data: bytes.slice(),
    cMapUrl: '/vendor/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/standard_fonts/',
    wasmUrl: '/vendor/wasm/',
  });
  let destruction: Promise<void> | undefined;
  const destroy = () => (destruction ??= task.destroy());
  const abort = () => {
    void destroy().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    signal?.throwIfAborted();
    if (pdf.numPages > LIMITS.pdfPages)
      throw new Error(t('error.pdfTooManyPages', { max: LIMITS.pdfPages }));
    return { pdf, ops: library.OPS };
  } catch (error) {
    await destroy().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
export async function renderPdf(
  pdf: PDFDocumentProxy,
  signal: AbortSignal,
  progress: (value: string) => void,
) {
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    signal.throwIfAborted();
    progress(t('pdf.rendering', { page: number, total: pdf.numPages }));
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1.5 });
    if (viewport.width * viewport.height > LIMITS.pdfPixels)
      throw new Error(t('error.pdfTooManyPixels'));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('error.canvasUnavailable'));
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const task = page.render({ canvas, canvasContext: context, viewport });
    const abort = () => task.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await task.promise;
      signal.throwIfAborted();
      pages.push(canvas.toDataURL('image/jpeg', 0.82));
    } finally {
      signal.removeEventListener('abort', abort);
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pages;
}
/** Number of pages in the bundled `doc_1` showcase guide. */
export const SHOWCASE_GUIDE_PAGES = 1;
export function guideSource(pageNumber: number) {
  return pageNumber >= 1 && pageNumber <= SHOWCASE_GUIDE_PAGES
    ? `/assets/doc_1/showcase-${pageNumber}.png`
    : '';
}
/** Pages every document shows so the chosen background is fully visible. */
export function overlayPageCount(overlay: Settings['overlay'], pdfPageCount: number) {
  if (overlay === 'doc_1') return SHOWCASE_GUIDE_PAGES;
  if (overlay === 'uploaded_pdf') return pdfPageCount;
  return 0;
}
/** Background image for a 1-based page number, or '' when there is none. */
export function overlaySource(
  overlay: Settings['overlay'],
  pageNumber: number,
  pdfPages: string[],
) {
  if (overlay === 'doc_1') return guideSource(pageNumber);
  if (overlay === 'uploaded_pdf') return pdfPages[pageNumber - 1] ?? '';
  return '';
}
