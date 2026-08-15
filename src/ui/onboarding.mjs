const STORAGE_KEY = 'kartesian_onboarding_complete_v1';

export function createOnboardingController({ documentRef = document, windowRef = window }) {
    const steps = [
        { selector: '#jsonInputEditor', title: 'Data dokumen', text: 'Edit data terstruktur di sini. Perubahan valid langsung dirender ke pratinjau.' },
        { selector: '#btnAddText', title: 'Tambah elemen', text: 'Tambahkan teks atau gambar, lalu posisikan langsung pada halaman.' },
        { selector: '#printContainer', title: 'Kanvas presisi', text: 'Klik elemen untuk membuka properti. Shift/Ctrl+klik memilih beberapa elemen.' },
        { selector: '#propertyPanel', title: 'Properti & alignment', text: 'Atur koordinat, ukuran, gaya, rotasi, layer, lock, dan perataan secara presisi.' },
        { selector: '.action-bar', title: 'Simpan hasil', text: 'Render ulang, cetak, atau ekspor HTML mandiri saat dokumen siap.' }
    ];
    let index = 0;
    let active = false;
    let temporarilyRevealedPanel = false;
    const overlay = documentRef.getElementById('onboardingOverlay');
    const card = documentRef.getElementById('onboardingCard');

    function position() {
        const step = steps[index];
        const target = documentRef.querySelector(step.selector);
        documentRef.querySelectorAll('.onboarding-highlight').forEach(node => node.classList.remove('onboarding-highlight'));
        if (!target) return;
        if (target.hidden) {
            target.hidden = false;
            if (target.id === 'propertyPanel') temporarilyRevealedPanel = true;
        }
        target.classList.add('onboarding-highlight');
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        documentRef.getElementById('onboardingTitle').textContent = step.title;
        documentRef.getElementById('onboardingText').textContent = step.text;
        documentRef.getElementById('onboardingProgress').textContent = `${index + 1} / ${steps.length}`;
        documentRef.getElementById('btnOnboardingPrev').disabled = index === 0;
        documentRef.getElementById('btnOnboardingNext').textContent = index === steps.length - 1 ? 'Selesai' : 'Lanjut';
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const left = Math.max(12, Math.min(windowRef.innerWidth - card.offsetWidth - 12, rect.left));
            const below = rect.bottom + 14;
            const top = below + card.offsetHeight < windowRef.innerHeight ? below : Math.max(12, rect.top - card.offsetHeight - 14);
            card.style.left = `${left}px`; card.style.top = `${top}px`;
        });
    }
    function finish() {
        active = false; overlay.hidden = true; card.hidden = true;
        if (temporarilyRevealedPanel && !documentRef.querySelector('.data-item.selected-item')) {
            documentRef.getElementById('propertyPanel').hidden = true;
        }
        temporarilyRevealedPanel = false;
        documentRef.querySelectorAll('.onboarding-highlight').forEach(node => node.classList.remove('onboarding-highlight'));
        try { windowRef.localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    }
    function start() { index = 0; active = true; overlay.hidden = false; card.hidden = false; position(); }
    function init() {
        documentRef.getElementById('btnStartOnboarding').addEventListener('click', start);
        documentRef.getElementById('btnOnboardingSkip').addEventListener('click', finish);
        documentRef.getElementById('btnOnboardingPrev').addEventListener('click', () => { if (index > 0) { index--; position(); } });
        documentRef.getElementById('btnOnboardingNext').addEventListener('click', () => { if (index >= steps.length - 1) finish(); else { index++; position(); } });
        windowRef.addEventListener('resize', () => { if (active) position(); });
        let completed = false;
        try { completed = windowRef.localStorage.getItem(STORAGE_KEY) === 'true'; } catch {}
        if (!completed) windowRef.setTimeout(start, 500);
    }
    return { finish, init, start };
}
