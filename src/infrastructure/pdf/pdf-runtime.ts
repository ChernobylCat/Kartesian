import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LIMITS } from '@/domain/document/schema';

export async function openPdf(bytes: Uint8Array) {
  const library = await import('pdfjs-dist');
  library.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  const task = library.getDocument({
    data: bytes.slice(),
    cMapUrl: '/vendor/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/standard_fonts/',
    wasmUrl: '/vendor/wasm/',
  });
  const pdf = await task.promise;
  if (pdf.numPages > LIMITS.pdfPages) {
    await task.destroy();
    throw new Error('PDF melebihi 50 halaman.');
  }
  return { pdf, ops: library.OPS };
}
export async function renderPdf(
  pdf: PDFDocumentProxy,
  signal: AbortSignal,
  progress: (value: string) => void,
) {
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    signal.throwIfAborted();
    progress(`Merender PDF ${number}/${pdf.numPages}`);
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1.5 });
    if (viewport.width * viewport.height > LIMITS.pdfPixels)
      throw new Error('Dimensi PDF melebihi 20 juta piksel.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas tidak tersedia.');
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
export function guideSource(number: number) {
  return number <= 1
    ? `/assets/doc_1/showcase-${number}.png`
    : '';
}
