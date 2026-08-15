import { createDialogLifecycle } from './dialog.mjs';

const THEME_KEY = 'theme_preference';

export function getStoredTheme(storage) {
    try {
        return storage?.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

export function getThemeButtonModel(darkMode) {
    return darkMode
        ? { icon: 'sun', label: 'Mode Terang' }
        : { icon: 'moon', label: 'Mode Gelap' };
}

function createIcon(documentRef, name, size = null) {
    const icon = documentRef.createElement('i');
    icon.dataset.lucide = name;
    if (size) {
        icon.style.width = size;
        icon.style.height = size;
    }
    return icon;
}

function setButtonContent(documentRef, button, { icon, label }) {
    if (!button) return;
    button.replaceChildren(createIcon(documentRef, icon), documentRef.createTextNode(` ${label}`));
}

export function createAppShellController({
    documentRef = document,
    windowRef = window,
    storage = windowRef.localStorage,
    getEditor = () => null
} = {}) {
    let lifecycle = null;
    let helpOverlay = null;
    let helpDialogLifecycle = null;
    let editorHome = null;
    let editorNextSibling = null;
    let editorFocusTimer = null;

    function refreshIcons() {
        windowRef.lucide?.createIcons();
    }

    function syncTheme() {
        const darkMode = documentRef.body.classList.contains('dark');
        setButtonContent(documentRef, documentRef.getElementById('btnToggleTheme'), getThemeButtonModel(darkMode));
        getEditor()?.setTheme(darkMode ? 'ace/theme/tomorrow_night' : 'ace/theme/chrome');
        refreshIcons();
    }

    function toggleTheme() {
        const darkMode = documentRef.body.classList.toggle('dark');
        try {
            storage?.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
        } catch { }
        syncTheme();
    }

    function closeHelp() {
        helpOverlay?.remove();
        helpOverlay = null;
        helpDialogLifecycle?.destroy();
        helpDialogLifecycle = null;
    }

    function createHelpSection(title, items) {
        const section = documentRef.createElement('section');
        const heading = documentRef.createElement('h4');
        heading.style.cssText = 'margin:0 0 8px;color:var(--text-heading);';
        heading.textContent = title;
        const list = documentRef.createElement('ul');
        list.style.cssText = 'margin:0 0 16px;padding-left:20px;';
        items.forEach(itemHtml => {
            const item = documentRef.createElement('li');
            item.innerHTML = itemHtml;
            list.appendChild(item);
        });
        section.append(heading, list);
        return section;
    }

    function showHelp() {
        windowRef.clearTimeout(editorFocusTimer);
        editorFocusTimer = null;
        closeHelp();
        const overlay = documentRef.createElement('div');
        overlay.className = 'modal-overlay';
        const card = documentRef.createElement('div');
        card.className = 'modal-card help-modal';
        card.setAttribute('aria-labelledby', 'helpDialogTitle');
        card.style.cssText = 'background:var(--panel-bg);color:var(--text-main);border:1px solid var(--panel-border);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);';

        const title = documentRef.createElement('h3');
        title.id = 'helpDialogTitle';
        title.style.cssText = 'display:flex;align-items:center;gap:8px;border-bottom:1.5px solid var(--card-border);padding-bottom:10px;margin:0 0 15px;color:var(--text-heading);';
        title.append(createIcon(documentRef, 'help-circle'), documentRef.createTextNode(' Panduan Fitur & Pintasan Keyboard'));

        const body = documentRef.createElement('div');
        body.className = 'modal-body-scroll';
        body.style.cssText = 'font-size:13px;line-height:1.6;color:var(--text-main);';
        body.append(
            createHelpSection('🛠️ Fitur & Cara Penggunaan', [
                '<b>Klik-Ganda Lembar Kerja</b>: Menambahkan elemen teks baru secara instan di posisi klik.',
                '<b>Geser & Lepas</b>: Menyeret elemen teks/gambar ke koordinat mana saja di kertas.',
                '<b>Ubah Ukuran</b>: Seret salah satu dari delapan handle hijau untuk mengubah kotak teks atau gambar.',
                '<b>Resize Proporsional</b>: Tahan Shift saat menyeret untuk menjaga rasio; tahan Alt untuk resize dari pusat.',
                '<b>Penyuntingan Teks Langsung</b>: Klik-ganda teks, lalu Enter atau klik di luar untuk menyimpan.',
                '<b>Bilah Format Melayang</b>: Klik elemen teks untuk mengubah font, gaya, dan warna.',
                '<b>Properti Melayang</b>: Buka ikon slider pada bilah format untuk mengatur X/Y, ukuran kotak, font, rotasi, layer, dan lock.',
                '<b>Multi-select</b>: Gunakan Shift/Ctrl/Cmd+klik untuk memilih beberapa elemen dan memakai alignment.',
                '<b>Marquee Selection</b>: Drag area kosong kiri-ke-kanan untuk memilih elemen di dalam kotak; kanan-ke-kiri untuk elemen yang tersentuh. Shift menambah dan Ctrl/Cmd men-toggle seleksi.',
                '<b>Panel Properti</b>: Atur posisi, ukuran, font, rotasi, layer, dan lock secara presisi.',
                '<b>Menu Konteks</b>: Klik kanan elemen untuk aksi duplikasi, layer, lock, dan hapus.'
            ]),
            createHelpSection('⌨️ Pintasan Keyboard', [
                '<kbd>Ctrl/Cmd</kbd> + <kbd>Z</kbd>: <b>Undo</b>.',
                '<kbd>Ctrl</kbd> + <kbd>Y</kbd> atau <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>: <b>Redo</b>.',
                '<kbd>Tombol Panah</kbd>: Geser elemen terpilih sejauh 0,1 mm.',
                '<kbd>Shift</kbd> + <kbd>Tombol Panah</kbd>: Geser elemen sejauh 1 mm.',
                '<kbd>Ctrl/Cmd</kbd> + <kbd>A</kbd>: Pilih seluruh elemen pada halaman aktif.',
                '<kbd>Ctrl/Cmd</kbd> + <kbd>D</kbd>: Duplikasi elemen terpilih.',
                '<kbd>Alt</kbd> + <kbd>L</kbd>: Kunci atau buka posisi elemen.',
                '<kbd>Delete</kbd>: Hapus elemen terpilih.',
                '<kbd>Escape</kbd>: Keluar dari fullscreen atau menutup panduan.'
            ]),
            createHelpSection('⚙️ Penyelaras & Kalibrasi', [
                '<b>Snapping Guidelines</b>: Menyelaraskan elemen dengan elemen lain secara magnetik.',
                '<b>Penyimpanan Lokal</b>: Dokumen dan konfigurasi disimpan otomatis di browser.'
            ])
        );

        const actions = documentRef.createElement('div');
        actions.className = 'modal-actions';
        actions.style.cssText = 'border-top:1.5px solid var(--card-border);padding-top:15px;';
        const closeButton = documentRef.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'btn btn-primary';
        closeButton.style.width = '100%';
        closeButton.textContent = 'Tutup';
        closeButton.addEventListener('click', closeHelp);
        actions.appendChild(closeButton);
        card.append(title, body, actions);
        overlay.appendChild(card);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeHelp();
        });
        documentRef.body.appendChild(overlay);
        helpOverlay = overlay;
        helpDialogLifecycle = createDialogLifecycle({
            documentRef,
            dialog: card,
            initialFocus: closeButton,
            returnFocus: documentRef.getElementById('btnShowHelp'),
            onEscape: closeHelp
        });
        refreshIcons();
    }

    function setFullscreen(enabled) {
        const container = documentRef.getElementById('editorContainer');
        if (!container) return false;
        const currentlyFullscreen = container.classList.contains('fullscreen');
        if (enabled === currentlyFullscreen) return currentlyFullscreen;

        if (enabled) {
            editorHome = container.parentNode;
            editorNextSibling = container.nextSibling;
            documentRef.body.appendChild(container);
            container.classList.add('fullscreen');
            documentRef.body.style.overflow = 'hidden';
        } else {
            container.classList.remove('fullscreen');
            if (editorHome) editorHome.insertBefore(container, editorNextSibling);
            documentRef.body.style.overflow = '';
        }

        setButtonContent(documentRef, documentRef.getElementById('btnFullscreen'), enabled
            ? { icon: 'minimize-2', label: 'Perkecil' }
            : { icon: 'maximize-2', label: 'Fullscreen' });
        refreshIcons();
        windowRef.clearTimeout(editorFocusTimer);
        editorFocusTimer = windowRef.setTimeout(() => {
            editorFocusTimer = null;
            if (helpOverlay) return;
            getEditor()?.resize();
            getEditor()?.focus();
        }, 100);
        return enabled;
    }

    function toggleFullscreen() {
        const container = documentRef.getElementById('editorContainer');
        return setFullscreen(!container?.classList.contains('fullscreen'));
    }

    function handleEscape(event) {
        if (event.key !== 'Escape' && event.keyCode !== 27) return;
        if (helpOverlay) closeHelp();
        else setFullscreen(false);
    }

    function init() {
        lifecycle?.abort();
        lifecycle = new AbortController();
        const { signal } = lifecycle;
        documentRef.getElementById('btnToggleTheme')?.addEventListener('click', toggleTheme, { signal });
        documentRef.getElementById('btnFullscreen')?.addEventListener('click', toggleFullscreen, { signal });
        documentRef.getElementById('btnShowHelp')?.addEventListener('click', showHelp, { signal });
        windowRef.addEventListener('keydown', handleEscape, { signal });
        syncTheme();
    }

    function destroy() {
        lifecycle?.abort();
        lifecycle = null;
        closeHelp();
        setFullscreen(false);
        windowRef.clearTimeout(editorFocusTimer);
        editorFocusTimer = null;
    }

    return {
        closeHelp,
        destroy,
        init,
        setFullscreen,
        showHelp,
        syncTheme,
        toggleFullscreen,
        toggleTheme
    };
}
