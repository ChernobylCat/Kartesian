import { driver } from '../../assets/vendor/driver.mjs';

const STORAGE_KEY = 'kartesian_onboarding_complete_v1';

export function createOnboardingController({
    documentRef = document,
    windowRef = window,
    driverFactory = driver
} = {}) {
    let temporarilyRevealedPanel = false;
    let lifecycle = null;
    let autoStartTimer = null;

    function propertyPanelTarget() {
        const panel = documentRef.getElementById('propertyPanel');
        if (panel?.hidden) {
            panel.hidden = false;
            temporarilyRevealedPanel = true;
        }
        return panel;
    }

    function canvasPageTarget() {
        return documentRef.querySelector('.data-item.selected-item')?.closest('.print-page') ||
            documentRef.querySelector('#printContainer .print-page');
    }

    function complete() {
        if (temporarilyRevealedPanel && !documentRef.querySelector('.data-item.selected-item')) {
            documentRef.getElementById('propertyPanel').hidden = true;
        }
        temporarilyRevealedPanel = false;
        try { windowRef.localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    }

    const reduceMotion = windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const tour = driverFactory({
        animate: !reduceMotion,
        duration: reduceMotion ? 0 : 300,
        smoothScroll: !reduceMotion,
        allowKeyboardControl: true,
        allowClose: true,
        allowScroll: false,
        overlayOpacity: 0.65,
        stagePadding: 8,
        stageRadius: 8,
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: 'Lanjut',
        prevBtnText: 'Kembali',
        doneBtnText: 'Selesai',
        popoverClass: 'kartesian-tour',
        skipMissingElement: true,
        onPopoverRender(popover) {
            popover.closeButton.setAttribute('aria-label', 'Lewati tur');
            popover.closeButton.title = 'Lewati tur';
        },
        onDestroyed: complete,
        steps: [
            { element: '#jsonInputEditor', popover: { title: 'Data dokumen', description: 'Edit data terstruktur di sini. Perubahan valid langsung dirender ke pratinjau.' } },
            { element: '#btnAddText', popover: { title: 'Tambah elemen', description: 'Tambahkan teks atau gambar, lalu posisikan langsung pada halaman.' } },
            { element: '#btnUploadPdf', popover: { title: 'Pindai field PDF', description: 'Unggah PDF lalu gunakan Pindai Ulang Field untuk memilih mode Otomatis, PDF.js, PyMuPDF, atau PaddleOCR. Tinjau kandidat sebelum menerapkannya.' } },
            { element: canvasPageTarget, popover: { title: 'Kanvas presisi', description: 'Klik elemen untuk membuka properti. Shift/Ctrl+klik memilih beberapa elemen.' } },
            { element: propertyPanelTarget, popover: { title: 'Properti & alignment', description: 'Atur koordinat, ukuran, gaya, rotasi, layer, lock, dan perataan secara presisi.' } },
            { element: '.action-bar', popover: { title: 'Simpan hasil', description: 'Render ulang, cetak, atau ekspor HTML mandiri saat dokumen siap.' } }
        ]
    });

    function finish() {
        if (tour.isActive()) tour.destroy();
        else complete();
    }

    function start() {
        if (autoStartTimer !== null) windowRef.clearTimeout(autoStartTimer);
        autoStartTimer = null;
        if (tour.isActive()) tour.destroy();
        tour.drive(0);
    }

    function init() {
        lifecycle?.abort();
        lifecycle = new AbortController();
        documentRef.getElementById('btnStartOnboarding').addEventListener('click', start, { signal: lifecycle.signal });
        let completed = false;
        try { completed = windowRef.localStorage.getItem(STORAGE_KEY) === 'true'; } catch {}
        if (!completed) autoStartTimer = windowRef.setTimeout(start, 500);
    }

    function destroy() {
        lifecycle?.abort();
        lifecycle = null;
        if (autoStartTimer !== null) windowRef.clearTimeout(autoStartTimer);
        autoStartTimer = null;
        if (tour.isActive()) tour.destroy();
    }

    return { destroy, finish, init, start };
}
