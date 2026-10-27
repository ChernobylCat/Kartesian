import { APP_CONFIG } from '../config.mjs';
import { debounce } from '../core/utils.mjs';
import { getLocalFieldServiceHealth, scanPdfWithMode } from '../pdf/local-field-service.mjs';
import { PdfOverlayStorage } from '../storage/pdf-storage.mjs';

const UPLOADED_VALUE = 'uploaded_pdf';

export function normalizeOverlayOpacity(
  value,
  { min = 5, max = 100, snapPoints = [25, 50, 75], threshold = 3 } = {},
) {
  let normalized = Math.min(max, Math.max(min, Number.parseInt(value, 10) || 50));
  const snapPoint = snapPoints.find((point) => Math.abs(normalized - point) <= threshold);
  if (snapPoint !== undefined) normalized = snapPoint;
  return normalized;
}

export function validatePdfFile(file, maxSize = APP_CONFIG.MAX_PDF_FILE_SIZE_BYTES) {
  if (!file) throw new TypeError('File PDF belum dipilih.');
  if (file.size === 0) throw new TypeError('File PDF kosong.');
  const hasPdfExtension = file.name?.toLowerCase().endsWith('.pdf');
  if (file.type !== 'application/pdf' && !hasPdfExtension) {
    throw new TypeError('File yang dipilih bukan PDF.');
  }
  if (file.size > maxSize) {
    throw new RangeError(`Ukuran PDF melebihi batas ${Math.round(maxSize / 1024 / 1024)} MB.`);
  }
  return true;
}

export function resolveOverlaySource({ documentValue, pageNumber, uploadedPages }) {
  if (documentValue === 'none') return null;
  if (documentValue === UPLOADED_VALUE) return uploadedPages?.[pageNumber - 1] ?? null;
  if (documentValue === 'doc_1' && pageNumber <= APP_CONFIG.DOC_1_PAGE_COUNT) {
    return encodeURI(
      `./assets/${documentValue}/showcase-${pageNumber}.png`,
    );
  }
  return null;
}

export async function renderPdfPages(
  pdf,
  {
    documentRef = document,
    nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve)),
    onProgress = () => {},
  } = {},
) {
  if (pdf.numPages > APP_CONFIG.MAX_PDF_PAGES) {
    throw new RangeError(
      `PDF memiliki ${pdf.numPages} halaman; batas maksimum adalah ${APP_CONFIG.MAX_PDF_PAGES}.`,
    );
  }

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    onProgress({
      pageNumber,
      totalPages: pdf.numPages,
      percent: Math.round((pageNumber / pdf.numPages) * 100),
    });
    await nextFrame();
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: APP_CONFIG.PDF_RENDER_SCALE });
    if (viewport.width * viewport.height > APP_CONFIG.MAX_PDF_CANVAS_PIXELS) {
      throw new RangeError(
        `Dimensi halaman ${pageNumber} terlalu besar untuk diproses dengan aman.`,
      );
    }

    const canvas = documentRef.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas PDF tidak tersedia.');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(canvas.toDataURL(APP_CONFIG.PDF_RENDER_FORMAT, APP_CONFIG.PDF_RENDER_QUALITY));
  }
  return pages;
}

export function createOverlayController({
  documentRef = document,
  windowRef = window,
  storage = new PdfOverlayStorage(),
  pdfLibrary = windowRef.pdfjsLib,
  pdfWorkerSrc = null,
  confirmDelete = () => Promise.resolve(false),
  showToast = () => {},
  onSave = () => {},
  onRender = () => {},
  onValidate = () => {},
  onCandidatesChange = () => {},
} = {}) {
  let uploadedPages = null;
  let uploadedPdfData = null;
  let uploadedPdfName = '';
  let fieldCandidates = [];
  let lifecycle = null;
  let statusTimer = null;

  const element = (id) => documentRef.getElementById(id);

  function ensureUploadedOption() {
    const select = element('overlayDocSelect');
    let option = select?.querySelector(`option[value="${UPLOADED_VALUE}"]`);
    if (!option && select) {
      option = documentRef.createElement('option');
      option.value = UPLOADED_VALUE;
      option.textContent = '-- PDF Unggahan Anda --';
      select.appendChild(option);
    }
    return option;
  }

  function setUploadedUi(available) {
    if (available) ensureUploadedOption();
    else element('overlayDocSelect')?.querySelector(`option[value="${UPLOADED_VALUE}"]`)?.remove();
    const deleteButton = element('btnDeletePdf');
    if (deleteButton) deleteButton.style.display = available ? 'inline-flex' : 'none';
    const scanControls = element('pdfFieldScanControls');
    if (scanControls) scanControls.hidden = !available;
    const canRescan = available && Boolean(uploadedPdfData);
    const scanButton = element('btnScanPdfFields');
    const scanMode = element('pdfFieldScanMode');
    if (scanButton) {
      scanButton.disabled = !canRescan;
      scanButton.title = canRescan ? '' : 'Unggah ulang PDF untuk mengaktifkan pemindaian manual.';
    }
    if (scanMode) scanMode.disabled = !canRescan;
    if (available && !canRescan) {
      updateDetectorStatus(
        'PDF tersimpan dari versi lama. Unggah ulang untuk memindai manual.',
        'warning',
      );
    }
  }

  function updateDetectorStatus(message, state = '') {
    const status = element('pdfDetectorStatus');
    if (!status) return;
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  }

  function updateStatus(message, percent = null) {
    const status = element('pdfUploadStatus');
    if (!status) return;
    status.style.display = 'block';
    status.replaceChildren();
    const label = documentRef.createElement('span');
    label.textContent = message;
    status.appendChild(label);
    if (percent !== null) {
      const wrapper = documentRef.createElement('div');
      wrapper.className = 'progress-bar-wrapper';
      const fill = documentRef.createElement('div');
      fill.className = 'progress-bar-fill';
      fill.style.width = `${percent}%`;
      wrapper.appendChild(fill);
      status.appendChild(wrapper);
    }
  }

  function updateOpacityBadge() {
    const input = element('overlayOpacity');
    if (!input) return 50;
    const opacity = normalizeOverlayOpacity(input.value);
    input.value = String(opacity);
    const badge = element('opacityVal');
    if (badge) badge.textContent = `${opacity}%`;
    return opacity;
  }

  function applyOverlayToPages() {
    const documentValue = element('overlayDocSelect')?.value ?? 'none';
    const visible = element('overlayToggle')?.checked ?? true;
    const opacity = updateOpacityBadge();
    documentRef.querySelectorAll('.page-overlay-guide').forEach((overlay) => {
      const pageNumber = Number.parseInt(overlay.dataset.pdfPage, 10) || 1;
      const source = resolveOverlaySource({ documentValue, pageNumber, uploadedPages });
      overlay.style.opacity = String(opacity / 100);
      if (source) overlay.src = source;
      else overlay.removeAttribute('src');
      overlay.style.display = source && visible ? 'block' : 'none';
    });
  }

  function afterRender() {
    applyOverlayToPages();
    applyPrintVisibility();
    onCandidatesChange(fieldCandidates);
  }

  function persistAndValidate() {
    onSave();
    onValidate();
  }

  function handleDocumentChange() {
    onRender();
    persistAndValidate();
  }

  function handleVisibilityChange() {
    applyOverlayToPages();
    onCandidatesChange(fieldCandidates);
    persistAndValidate();
  }

  const handleOpacityChange = debounce(() => {
    applyOverlayToPages();
    persistAndValidate();
  }, 100);

  function applyPrintVisibility() {
    element('printContainer')?.classList.toggle(
      'print-overlay-visible',
      element('printOverlayCheck')?.checked ?? false,
    );
  }

  function handlePrintVisibilityChange() {
    applyPrintVisibility();
    onSave();
  }

  function getActivePageCount() {
    const value = element('overlayDocSelect')?.value ?? 'none';
    if (value === UPLOADED_VALUE) return uploadedPages?.length ?? 0;
    if (value === 'doc_1') return APP_CONFIG.DOC_1_PAGE_COUNT;
    return 0;
  }

  function getSettings() {
    return {
      overlayDoc: element('overlayDocSelect')?.value ?? 'none',
      overlayToggle: element('overlayToggle')?.checked ?? true,
      overlayOpacity: element('overlayOpacity')?.value ?? '50',
      printOverlayCheck: element('printOverlayCheck')?.checked ?? false,
    };
  }

  function applySettings(settings = {}) {
    const select = element('overlayDocSelect');
    if (settings.overlayDoc !== undefined && select) {
      select.value =
        settings.overlayDoc === UPLOADED_VALUE && !uploadedPages ? 'none' : settings.overlayDoc;
    }
    if (settings.overlayToggle !== undefined)
      element('overlayToggle').checked = settings.overlayToggle;
    if (settings.overlayOpacity !== undefined)
      element('overlayOpacity').value = settings.overlayOpacity;
    if (settings.printOverlayCheck !== undefined)
      element('printOverlayCheck').checked = settings.printOverlayCheck;
    afterRender();
  }

  function setPdfControlsBusy(busy) {
    ['btnUploadPdf', 'btnDeletePdf', 'btnScanPdfFields', 'pdfFieldScanMode'].forEach((id) => {
      const control = element(id);
      if (control) control.disabled = busy;
    });
  }

  function scanModeLabel(mode) {
    if (mode === 'pdfjs') return 'PDF.js';
    if (mode === 'pymupdf') return 'PyMuPDF';
    if (mode === 'paddleocr') return 'PaddleOCR';
    return 'Otomatis';
  }

  async function readStoredPdfBytes() {
    if (uploadedPdfData?.arrayBuffer) return new Uint8Array(await uploadedPdfData.arrayBuffer());
    if (uploadedPdfData instanceof ArrayBuffer) return new Uint8Array(uploadedPdfData.slice(0));
    if (ArrayBuffer.isView(uploadedPdfData)) {
      return new Uint8Array(
        uploadedPdfData.buffer.slice(
          uploadedPdfData.byteOffset,
          uploadedPdfData.byteOffset + uploadedPdfData.byteLength,
        ),
      );
    }
    throw new Error('PDF asli tidak tersedia. Unggah ulang dokumen PDF terlebih dahulu.');
  }

  async function scanLoadedPdf(
    pdf,
    pdfBytes,
    mode = 'auto',
    { progressStart = 0, progressSpan = 100 } = {},
  ) {
    return scanPdfWithMode(pdf, pdfBytes, {
      mode,
      ops: pdfLibrary.OPS,
      nextFrame: () => new Promise((resolve) => windowRef.requestAnimationFrame(resolve)),
      fetchImpl: windowRef.fetch?.bind(windowRef) || globalThis.fetch,
      onProgress: ({ pageNumber, totalPages, percent }) => {
        updateStatus(
          `${scanModeLabel(mode)} memindai Halaman ${pageNumber} dari ${totalPages}...`,
          progressStart + Math.round((percent * progressSpan) / 100),
        );
      },
      onFallback: ({ pages: fallbackPages }) => {
        updateStatus(
          `${scanModeLabel(mode)} memproses ${fallbackPages.length} halaman melalui service lokal...`,
          Math.min(99, progressStart + progressSpan),
        );
      },
    });
  }

  async function refreshDetectorStatus() {
    if (!uploadedPdfData) return;
    const mode = element('pdfFieldScanMode')?.value || 'auto';
    if (mode === 'pdfjs') {
      updateDetectorStatus('PDF.js siap di browser.', 'ready');
      return;
    }
    updateDetectorStatus('Memeriksa service detector lokal...');
    const health = await getLocalFieldServiceHealth({
      fetchImpl: windowRef.fetch?.bind(windowRef) || globalThis.fetch,
    });
    if (!health.pymupdf) {
      updateDetectorStatus(
        'Service lokal belum berjalan. PDF.js tetap tersedia.',
        mode === 'auto' ? 'warning' : 'error',
      );
    } else if (mode === 'paddleocr' && !health.paddleocr) {
      updateDetectorStatus('PyMuPDF aktif, tetapi PaddleOCR belum terpasang.', 'warning');
    } else {
      updateDetectorStatus(
        health.paddleocr ? 'PyMuPDF dan PaddleOCR siap.' : 'PyMuPDF siap; PaddleOCR tidak aktif.',
        'ready',
      );
    }
  }

  async function handleManualFieldScan() {
    if (!pdfLibrary) {
      showToast('PDF.js tidak tersedia.', 'error', 6000);
      return;
    }
    const mode = element('pdfFieldScanMode')?.value || 'auto';
    setPdfControlsBusy(true);
    updateDetectorStatus(`${scanModeLabel(mode)} sedang memindai...`);
    updateStatus(`Menyiapkan pemindaian ${scanModeLabel(mode)}...`, 2);
    let pdf = null;
    try {
      if (mode === 'pymupdf' || mode === 'paddleocr') {
        const health = await getLocalFieldServiceHealth({
          fetchImpl: windowRef.fetch?.bind(windowRef) || globalThis.fetch,
        });
        if (!health.pymupdf)
          throw new Error('Service PyMuPDF belum berjalan. Jalankan npm run detector:start.');
        if (mode === 'paddleocr' && !health.paddleocr) {
          throw new Error('PaddleOCR belum terpasang pada service lokal.');
        }
      }
      const pdfBytes = await readStoredPdfBytes();
      pdf = await pdfLibrary.getDocument({ data: pdfBytes.slice() }).promise;
      const result = await scanLoadedPdf(pdf, pdfBytes, mode);
      if ((mode === 'pymupdf' || mode === 'paddleocr') && !result.localServiceAvailable) {
        throw new Error(result.warnings?.[0] || 'Service detector lokal tidak tersedia.');
      }
      fieldCandidates = result.candidates;
      await storage.saveCandidates(fieldCandidates);
      onCandidatesChange(fieldCandidates);
      const message = fieldCandidates.length
        ? `${scanModeLabel(mode)} menemukan ${fieldCandidates.length} kandidat. Tinjau sebelum menerapkan.`
        : `${scanModeLabel(mode)} selesai tanpa kandidat field.`;
      updateStatus(message, 100);
      updateDetectorStatus(message, fieldCandidates.length ? 'ready' : 'warning');
      showToast(message, fieldCandidates.length ? 'success' : 'info', 6000);
      if (result.warnings?.length) showToast(result.warnings[0], 'warning', 6000);
    } catch (error) {
      console.warn('Pemindaian manual field PDF gagal:', error);
      updateStatus('Pemindaian manual gagal.');
      updateDetectorStatus(error.message, 'error');
      showToast(`Pemindaian gagal: ${error.message}`, 'error', 7000);
    } finally {
      try {
        await pdf?.destroy?.();
      } catch {
        // PDF.js cleanup failure must not leave the controls disabled.
      }
      setPdfControlsBusy(false);
      if (!uploadedPdfData) setUploadedUi(Boolean(uploadedPages?.length));
    }
  }

  async function hydrate(preferredDocument = 'none') {
    try {
      const payload = await storage.getPayload();
      if (!payload?.pages?.length) return null;
      uploadedPages = payload.pages;
      uploadedPdfData = payload.pdfData || null;
      uploadedPdfName = payload.fileName || '';
      fieldCandidates = payload.candidates || [];
      setUploadedUi(true);
      if (uploadedPdfData) {
        updateDetectorStatus(
          `PDF asli ${uploadedPdfName || 'unggahan'} tersedia untuk pemindaian ulang.`,
          'ready',
        );
      }
      if (preferredDocument === UPLOADED_VALUE) element('overlayDocSelect').value = UPLOADED_VALUE;
      onRender();
      onValidate();
      onCandidatesChange(fieldCandidates);
      return uploadedPages;
    } catch (error) {
      console.warn('Gagal memuat PDF unggahan:', error);
      showToast('Penyimpanan lokal tidak tersedia. Fitur PDF overlay mungkin terbatas.', 'warning');
      return null;
    }
  }

  async function handlePdfUpload(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!pdfLibrary)
        throw new Error('PDF.js gagal dimuat. Periksa koneksi lalu muat ulang aplikasi.');
      validatePdfFile(file);
    } catch (error) {
      showToast(error.message, 'error', 6000);
      input.value = '';
      return;
    }

    setPdfControlsBusy(true);
    updateStatus('Membaca berkas PDF...');

    try {
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfLibrary.getDocument({ data: pdfBytes.slice() }).promise;
      const pages = await renderPdfPages(pdf, {
        documentRef,
        nextFrame: () => new Promise((resolve) => windowRef.requestAnimationFrame(resolve)),
        onProgress: ({ pageNumber, totalPages, percent }) => {
          updateStatus(
            `Merender Halaman ${pageNumber} dari ${totalPages}...`,
            Math.round(percent * 0.7),
          );
        },
      });
      let candidates = [];
      let scanResult = null;
      try {
        scanResult = await scanLoadedPdf(pdf, pdfBytes, 'auto', {
          progressStart: 70,
          progressSpan: 25,
        });
        candidates = scanResult.candidates;
      } catch (scanError) {
        console.warn('Pemindaian field PDF gagal:', scanError);
        showToast('PDF berhasil dimuat, tetapi field tidak dapat dipindai.', 'warning', 6000);
      }
      updateStatus('Menyimpan halaman panduan ke database lokal...');
      const pdfData = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      );
      await storage.savePages(pages, candidates, { pdfData, fileName: file.name });
      uploadedPages = pages;
      uploadedPdfData = pdfData;
      uploadedPdfName = file.name;
      fieldCandidates = candidates;
      setUploadedUi(true);
      element('overlayDocSelect').value = UPLOADED_VALUE;
      onCandidatesChange(fieldCandidates);
      updateStatus(
        candidates.length
          ? `Proses selesai: ${candidates.length} kandidat ditemukan.`
          : 'Proses selesai: tidak ada kandidat field digital.',
      );
      if (!candidates.length) {
        showToast(
          scanResult?.localServiceAvailable === false
            ? 'Tidak ada field dari PDF.js. Jalankan service lokal untuk mencoba PyMuPDF dan OCR.'
            : 'Tidak ada AcroForm atau field teks/garis yang terdeteksi.',
          'info',
          6000,
        );
      } else if (scanResult?.warnings?.length && scanResult.localServiceAvailable) {
        showToast(scanResult.warnings[0], 'warning', 6000);
      }
      updateDetectorStatus(
        `PDF asli ${uploadedPdfName} tersimpan. Pilih metode untuk memindai ulang.`,
        'ready',
      );
      windowRef.clearTimeout(statusTimer);
      statusTimer = windowRef.setTimeout(() => {
        const status = element('pdfUploadStatus');
        if (status) status.style.display = 'none';
        statusTimer = null;
      }, 3000);
      onRender();
      persistAndValidate();
    } catch (error) {
      updateStatus('Gagal memproses file PDF.');
      console.error(error);
      showToast(
        `Gagal memproses PDF: ${error?.message || 'penyimpanan lokal gagal.'}`,
        'error',
        6000,
      );
    } finally {
      setPdfControlsBusy(false);
      input.value = '';
    }
  }

  async function deleteUploadedPdf() {
    if (
      !(await confirmDelete(
        'Apakah Anda yakin ingin menghapus PDF unggahan ini secara permanen dari database lokal?',
      ))
    )
      return;
    try {
      await storage.deletePages();
      uploadedPages = null;
      uploadedPdfData = null;
      uploadedPdfName = '';
      fieldCandidates = [];
      const select = element('overlayDocSelect');
      if (select?.value === UPLOADED_VALUE) select.value = 'none';
      setUploadedUi(false);
      onCandidatesChange(fieldCandidates);
      onRender();
      persistAndValidate();
      showToast('PDF berhasil dihapus.', 'success');
    } catch (error) {
      console.error('Failed to delete PDF', error);
      showToast('Gagal menghapus file PDF.', 'error');
    }
  }

  async function removeCandidates(candidateIds) {
    const ids = new Set(candidateIds || []);
    const nextCandidates = fieldCandidates.filter((candidate) => !ids.has(candidate.id));
    if (nextCandidates.length === fieldCandidates.length) return fieldCandidates;
    await storage.saveCandidates(nextCandidates);
    fieldCandidates = nextCandidates;
    onCandidatesChange(fieldCandidates);
    return fieldCandidates;
  }

  function init() {
    lifecycle?.abort();
    lifecycle = new AbortController();
    const { signal } = lifecycle;
    if (pdfLibrary) {
      if (pdfWorkerSrc) pdfLibrary.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    } else {
      const uploadButton = element('btnUploadPdf');
      if (uploadButton) uploadButton.disabled = true;
    }

    element('overlayDocSelect')?.addEventListener('change', handleDocumentChange, { signal });
    element('overlayToggle')?.addEventListener('change', handleVisibilityChange, { signal });
    element('overlayOpacity')?.addEventListener(
      'input',
      () => {
        updateOpacityBadge();
        handleOpacityChange();
      },
      { signal },
    );
    element('printOverlayCheck')?.addEventListener('change', handlePrintVisibilityChange, {
      signal,
    });
    element('btnUploadPdf')?.addEventListener('click', () => element('pdfUploadInput')?.click(), {
      signal,
    });
    element('pdfUploadInput')?.addEventListener('change', handlePdfUpload, { signal });
    element('btnDeletePdf')?.addEventListener('click', deleteUploadedPdf, { signal });
    element('btnScanPdfFields')?.addEventListener('click', handleManualFieldScan, { signal });
    element('pdfFieldScanMode')?.addEventListener('change', refreshDetectorStatus, { signal });
    afterRender();
  }

  function destroy() {
    handleOpacityChange.cancel();
    windowRef.clearTimeout(statusTimer);
    statusTimer = null;
    lifecycle?.abort();
    lifecycle = null;
  }

  return {
    afterRender,
    applySettings,
    deleteUploadedPdf,
    destroy,
    getActivePageCount,
    getSettings,
    handlePdfUpload,
    handleManualFieldScan,
    hydrate,
    init,
    removeCandidates,
  };
}
