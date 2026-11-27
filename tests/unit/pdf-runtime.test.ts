import { beforeEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  OPS: {},
}));
vi.mock('pdfjs-dist', () => runtime);
import { openPdf } from '@/infrastructure/pdf/pdf-runtime';
beforeEach(() => runtime.getDocument.mockReset());

it('destroys a failed PDF loading task', async () => {
  const task = {
    promise: Promise.reject(new Error('Invalid PDF')),
    destroy: vi.fn(async () => {}),
  };
  runtime.getDocument.mockReturnValue(task);
  await expect(openPdf(new Uint8Array([1]))).rejects.toThrow('Invalid PDF');
  expect(task.destroy).toHaveBeenCalledOnce();
});
it('destroys oversized PDFs and leaves successful task ownership with its caller', async () => {
  const task = { promise: Promise.resolve({ numPages: 51 }), destroy: vi.fn(async () => {}) };
  runtime.getDocument.mockReturnValue(task);
  await expect(openPdf(new Uint8Array([1]))).rejects.toThrow('50 halaman');
  expect(task.destroy).toHaveBeenCalledOnce();
  const success = { promise: Promise.resolve({ numPages: 1 }), destroy: vi.fn(async () => {}) };
  runtime.getDocument.mockReturnValue(success);
  await openPdf(new Uint8Array([1]));
  expect(success.destroy).not.toHaveBeenCalled();
});
it('cancels and cleans a PDF that is still opening', async () => {
  const controller = new AbortController();
  let reject!: (error: Error) => void;
  const task = {
    promise: new Promise((_, fail) => (reject = fail)),
    destroy: vi.fn(async () => {
      reject(new Error('Destroyed'));
    }),
  };
  runtime.getDocument.mockReturnValue(task);
  const pending = openPdf(new Uint8Array([1]), controller.signal);
  await vi.waitFor(() => expect(runtime.getDocument).toHaveBeenCalledOnce());
  controller.abort();
  await expect(pending).rejects.toThrow('Destroyed');
  expect(task.destroy).toHaveBeenCalledOnce();
});
it('does not create a task for an already cancelled request', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(openPdf(new Uint8Array([1]), controller.signal)).rejects.toThrow();
  expect(runtime.getDocument).not.toHaveBeenCalled();
});
