import { APP_CONFIG } from '../config.mjs';
import { debounce } from '../core/utils.mjs';
import { PdfOverlayStorage } from '../storage/pdf-storage.mjs';

const UPLOADED_VALUE = 'uploaded_pdf';

export function normalizeOverlayOpacity(value, {
    min = 5,
    max = 100,
    snapPoints = [25, 50, 75],
    threshold = 3
} = {}) {
    let normalized = Math.min(max, Math.max(min, Number.parseInt(value, 10) || 50));
    const snapPoint = snapPoints.find(point => Math.abs(normalized - point) <= threshold);
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
            `./assets/${documentValue}/(1) Perjanjian Pembiayaan Multiguna  Investasi Angsuran-${pageNumber}.png`
        );
    }
    return null;
}

export async function renderPdfPages(pdf, {
    documentRef = document,
    nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve)),
    onProgress = () => {}
} = {}) {
    if (pdf.numPages > APP_CONFIG.MAX_PDF_PAGES) {
        throw new RangeError(
            `PDF memiliki ${pdf.numPages} halaman; batas maksimum adalah ${APP_CONFIG.MAX_PDF_PAGES}.`
        );
    }

    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        onProgress({ pageNumber, totalPages: pdf.numPages, percent: Math.round(pageNumber / pdf.numPages * 100) });
        await nextFrame();
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: APP_CONFIG.PDF_RENDER_SCALE });
        if (viewport.width * viewport.height > APP_CONFIG.MAX_PDF_CANVAS_PIXELS) {
            throw new RangeError(`Dimensi halaman ${pageNumber} terlalu besar untuk diproses dengan aman.`);
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
    onValidate = () => {}
} = {}) {
    let uploadedPages = null;
    let lifecycle = null;
    let statusTimer = null;

    const element = id => documentRef.getElementById(id);

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
        documentRef.querySelectorAll('.page-overlay-guide').forEach(overlay => {
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
        persistAndValidate();
    }

    const handleOpacityChange = debounce(() => {
        applyOverlayToPages();
        persistAndValidate();
    }, 100);

    function applyPrintVisibility() {
        element('printContainer')?.classList.toggle(
            'print-overlay-visible',
            element('printOverlayCheck')?.checked ?? false
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
            printOverlayCheck: element('printOverlayCheck')?.checked ?? false
        };
    }

    function applySettings(settings = {}) {
        const select = element('overlayDocSelect');
        if (settings.overlayDoc !== undefined && select) {
            select.value = settings.overlayDoc === UPLOADED_VALUE && !uploadedPages ? 'none' : settings.overlayDoc;
        }
        if (settings.overlayToggle !== undefined) element('overlayToggle').checked = settings.overlayToggle;
        if (settings.overlayOpacity !== undefined) element('overlayOpacity').value = settings.overlayOpacity;
        if (settings.printOverlayCheck !== undefined) element('printOverlayCheck').checked = settings.printOverlayCheck;
        afterRender();
    }

    async function hydrate(preferredDocument = 'none') {
        try {
            const pages = await storage.getPages();
            if (!pages?.length) return null;
            uploadedPages = pages;
            setUploadedUi(true);
            if (preferredDocument === UPLOADED_VALUE) element('overlayDocSelect').value = UPLOADED_VALUE;
            onRender();
            onValidate();
            return pages;
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
            if (!pdfLibrary) throw new Error('PDF.js gagal dimuat. Periksa koneksi lalu muat ulang aplikasi.');
            validatePdfFile(file);
        } catch (error) {
            showToast(error.message, 'error', 6000);
            input.value = '';
            return;
        }

        const uploadButton = element('btnUploadPdf');
        const deleteButton = element('btnDeletePdf');
        if (uploadButton) uploadButton.disabled = true;
        if (deleteButton) deleteButton.disabled = true;
        updateStatus('Membaca berkas PDF...');

        try {
            const pdf = await pdfLibrary.getDocument({ data: await file.arrayBuffer() }).promise;
            const pages = await renderPdfPages(pdf, {
                documentRef,
                nextFrame: () => new Promise(resolve => windowRef.requestAnimationFrame(resolve)),
                onProgress: ({ pageNumber, totalPages, percent }) => {
                    updateStatus(`Memproses Halaman ${pageNumber} dari ${totalPages}...`, percent);
                }
            });
            updateStatus('Menyimpan halaman panduan ke database lokal...');
            await storage.savePages(pages);
            uploadedPages = pages;
            setUploadedUi(true);
            element('overlayDocSelect').value = UPLOADED_VALUE;
            updateStatus('Proses selesai!');
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
            showToast(`Gagal memproses PDF: ${error.message}`, 'error', 6000);
        } finally {
            if (uploadButton) uploadButton.disabled = false;
            if (deleteButton) deleteButton.disabled = false;
            input.value = '';
        }
    }

    async function deleteUploadedPdf() {
        if (!await confirmDelete('Apakah Anda yakin ingin menghapus PDF unggahan ini secara permanen dari database lokal?')) return;
        try {
            await storage.deletePages();
            uploadedPages = null;
            const select = element('overlayDocSelect');
            if (select?.value === UPLOADED_VALUE) select.value = 'none';
            setUploadedUi(false);
            onRender();
            persistAndValidate();
            showToast('PDF berhasil dihapus.', 'success');
        } catch (error) {
            console.error('Failed to delete PDF', error);
            showToast('Gagal menghapus file PDF.', 'error');
        }
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
        element('overlayOpacity')?.addEventListener('input', () => {
            updateOpacityBadge();
            handleOpacityChange();
        }, { signal });
        element('printOverlayCheck')?.addEventListener('change', handlePrintVisibilityChange, { signal });
        element('btnUploadPdf')?.addEventListener('click', () => element('pdfUploadInput')?.click(), { signal });
        element('pdfUploadInput')?.addEventListener('change', handlePdfUpload, { signal });
        element('btnDeletePdf')?.addEventListener('click', deleteUploadedPdf, { signal });
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
        hydrate,
        init
    };
}
