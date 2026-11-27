'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  Crosshair,
  Type,
  ImagePlus,
  Undo2,
  Redo2,
  Printer,
  FileDown,
  Moon,
  Sun,
  CircleHelp,
  Maximize,
  Plus,
  X,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { EditorContext, useCommand, useEditor, useEditorState } from './context';
import { createEditorStore, type EditorStore } from './store/editor-store';
import { attachAutosave } from '@/application/editor-session';
import {
  IndexedWorkspaceRepository,
  loadOrMigrate,
  backupWorkspace,
  blobDataUrl,
} from '@/infrastructure/storage/workspace';
import { SessionLease } from '@/infrastructure/storage/session-lease';
import { demo, decodeLegacy, locate, uid } from '@/domain/document/model';
import { LIMITS, imageSource } from '@/domain/document/schema';
import { snapshotOutput, waitForAssets } from '@/application/prepare-output';
import { download, standaloneHtml } from '@/infrastructure/export/html';
import CanvasWorkspace from './components/CanvasWorkspace';
import PropertyPanel, { SelectionActions } from './components/PropertyPanel';
import PdfPanel from '../pdf/PdfPanel';
import SettingsPanel from '../settings/SettingsPanel';
import PrintSurface from '../print/PrintSurface';
import Dialog from '@/components/ui/Dialog';
import { useKeyboard } from './hooks/useKeyboard';
import { useOffline } from './hooks/useOffline';

const JsonPanel = dynamic(() => import('./components/JsonPanel'), {
  ssr: false,
  loading: () => <p className="muted">Memuat editor JSON…</p>,
});
type Runtime = { store: EditorStore; flush: () => Promise<void>; lease: SessionLease };

export default function EditorClient() {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const restoreInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let disposed = false;
    let saver: ReturnType<typeof attachAutosave> | undefined;
    let store: EditorStore | undefined;
    const repository = new IndexedWorkspaceRepository();
    const lease = new SessionLease(async () => {
      if (!store || store.getState().error)
        throw new Error('Simpan draft JSON sebelum melepas workspace.');
      await saver?.flush();
      store.setState({ readonly: true, message: 'Workspace telah dilepas untuk tab lain.' });
    });
    void (async () => {
      const owner = await lease.acquire();
      if (disposed) {
        lease.close();
        return;
      }
      const workspace = owner ? await loadOrMigrate(repository) : await repository.load();
      if (!workspace)
        throw new Error('Tab lain sedang menyiapkan workspace. Tunggu lalu coba lagi.');
      if (disposed) {
        lease.close();
        repository.close();
        return;
      }
      store = createEditorStore(workspace);
      store.setState({ readonly: !owner });
      saver = attachAutosave(store, repository);
      setRuntime({ store, flush: saver.flush, lease });
    })().catch((error) => {
      lease.close();
      repository.close();
      if (!disposed)
        setError(error instanceof Error ? error.message : 'Workspace tidak dapat dibuka.');
    });
    return () => {
      disposed = true;
      saver?.destroy();
      lease.close();
      repository.close();
    };
  }, [retry]);
  if (error)
    return (
      <main className="loading-screen">
        <div className="recovery">
          <div className="brand-mark">
            <Crosshair size={24} />
          </div>
          <h1>Workspace memerlukan pemulihan</h1>
          <p role="alert">{error}</p>
          <p className="muted">
            Autosave dihentikan agar data lama tidak tertimpa. Periksa storage/izin browser atau
            pulihkan melalui aplikasi legacy.
          </p>
          <div className="row">
            <button
              onClick={() => {
                setError('');
                setRetry(retry + 1);
              }}
            >
              Coba lagi
            </button>
            <button
              onClick={() => {
                try {
                  download(
                    JSON.stringify(
                      {
                        settings: localStorage.getItem('overlay_print_pro_settings'),
                        theme: localStorage.getItem('theme_preference'),
                      },
                      null,
                      2,
                    ),
                    'kartesian-recovery-legacy.json',
                  );
                } catch (error) {
                  setError(String(error));
                }
              }}
            >
              Unduh settings mentah
            </button>
            <button onClick={() => restoreInput.current?.click()}>Pulihkan backup lengkap</button>
            <a href="/legacy/">Buka editor legacy</a>
          </div>
          <input
            hidden
            ref={restoreInput}
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file)
                void (async () => {
                  const repository = new IndexedWorkspaceRepository();
                  const lease = new SessionLease(async () => {});
                  try {
                    if (!(await lease.acquire()))
                      throw new Error('Tutup tab editor lain sebelum memulihkan.');
                    if (file.size > LIMITS.backupBytes) throw new Error('Backup melebihi 150 MB.');
                    const { restoreWorkspace } = await import('@/infrastructure/storage/workspace');
                    const restored = await restoreWorkspace(await file.text());
                    await repository.load().catch(() => {});
                    await repository.save(restored);
                    setError('');
                    setRetry((value) => value + 1);
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    lease.close();
                    repository.close();
                  }
                })();
            }}
          />
          <p className="settings-note">
            Settings mentah bukan backup lengkap PDF; gunakan editor legacy untuk menyelamatkan PDF
            dan asetnya.
          </p>
        </div>
      </main>
    );
  if (!runtime)
    return (
      <main className="loading-screen">
        <div className="brand-mark">
          <Crosshair size={24} />
        </div>
        <h1>Kartesian</h1>
        <p className="muted" role="status">
          Membuka workspace lokal…
        </p>
      </main>
    );
  return (
    <EditorContext.Provider value={runtime}>
      <Editor lease={runtime.lease} />
    </EditorContext.Provider>
  );
}

function Editor({ lease }: { lease: SessionLease }) {
  const { store, flush } = useEditor();
  const command = useCommand();
  const settings = useEditorState((state) => state.workspace.settings);
  const docEntries = useEditorState((state) => state.workspace.document.debtors);
  const error = useEditorState((state) => state.error);
  const selected = useEditorState((state) => state.selected);
  const readonly = useEditorState((state) => state.readonly);
  const undoCount = useEditorState((state) => state.undoStack.length);
  const redoCount = useEditorState((state) => state.redoStack.length);
  const saveStatus = useEditorState((state) => state.saveStatus);
  const message = useEditorState((state) => state.message);
  const [zoom, setZoom] = useState(0.75);
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [outputBusy, setOutputBusy] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ debtorId: string; pageId?: string; pageNumber?: number }>({
    debtorId: docEntries[0]!.id,
  });
  const printRoot = useRef<HTMLDivElement>(null);
  const offline = useOffline();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark);
    try {
      localStorage.setItem('theme_preference', settings.dark ? 'dark' : 'light');
    } catch {}
  }, [settings.dark]);
  useEffect(() => {
    try {
      if (localStorage.getItem('kartesian_onboarding_complete_v1') !== 'true') setTour(0);
    } catch {}
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => store.setState({ message: '' }), 7000);
    return () => clearTimeout(timer);
  }, [message, store]);
  useEffect(() => {
    const close = () => setContext(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const state = store.getState();
      if (state.error || (!state.readonly && state.saveStatus !== 'saved')) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const hide = () => {
      void flush().catch(() => {});
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', hide);
    };
  }, [store, flush]);
  const print = useCallback(async () => {
    const state = store.getState();
    if (state.error) {
      store.setState({ message: 'Perbaiki JSON sebelum mencetak.' });
      return;
    }
    setOutputBusy(true);
    try {
      await flush().catch(() => {});
      if (printRoot.current) await waitForAssets(printRoot.current);
      window.print();
    } catch (error) {
      store.setState({ message: `Cetak dibatalkan: ${String(error)}` });
    } finally {
      setOutputBusy(false);
    }
  }, [store, flush]);
  const showHelp = useCallback(() => setHelp(true), []);
  useKeyboard(() => {
    void print();
  }, showHelp);
  function target() {
    const state = store.getState();
    const selected = state.selected[0]
      ? locate(state.workspace.document, state.selected[0])
      : undefined;
    if (selected) return { debtorId: selected.debtor.id, pageId: selected.page.id };
    const docEntry =
      state.workspace.document.debtors.find(
        (entry) =>
          entry.pages.some((page) => page.id === state.activePage) ||
          state.activePage?.startsWith(`${entry.id}-`),
      ) ?? state.workspace.document.debtors[0]!;
    const pageNumber = state.activePage?.startsWith(`${docEntry.id}-`)
      ? Number(state.activePage.slice(docEntry.id.length + 1)) + 1
      : undefined;
    return {
      debtorId: docEntry.id,
      pageId: pageNumber
        ? (state.activePage ?? undefined)
        : (docEntry.pages.find((page) => page.id === state.activePage)?.id ??
          docEntry.pages[0]?.id),
      pageNumber,
    };
  }
  const addImage = useCallback(
    (targetDocId?: string, pageId?: string, pageNumber?: number) => {
      const state = store.getState();
      const selected = state.selected[0]
        ? locate(state.workspace.document, state.selected[0])
        : undefined;
      uploadTarget.current = targetDocId
        ? { debtorId: targetDocId, pageId, pageNumber }
        : selected
          ? { debtorId: selected.debtor.id, pageId: selected.page.id }
          : {
              debtorId: state.workspace.document.debtors[0]!.id,
              pageId: state.workspace.document.debtors[0]?.pages[0]?.id,
            };
      imageInput.current?.click();
    },
    [store],
  );
  const openContext = useCallback(
    (event: MouseEvent, id?: string) => {
      event.preventDefault();
      if (id && !store.getState().selected.includes(id)) store.getState().select([id]);
      setContext({
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 220),
      });
    },
    [store],
  );
  async function image(file: File) {
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
        !file.size ||
        file.size > LIMITS.imageBytes
      )
        throw new Error('Gunakan gambar PNG/JPEG/WebP/GIF maksimal 2 MB.');
      const source = await blobDataUrl(file);
      if (!imageSource.test(source)) throw new Error('Sumber gambar tidak aman.');
      const image = new Image();
      image.src = source;
      await image.decode();
      const id = uid();
      const current = store.getState();
      const width = 30,
        height = Math.min(100, (width * image.naturalHeight) / image.naturalWidth);
      const assets = { ...current.workspace.assets, [id]: { id, dataUrl: source } };
      store.setState({ workspace: { ...current.workspace, assets } });
      command({
        type: 'add',
        ...uploadTarget.current,
        item: { type: 'image', text: '', assetId: id, x: 20, y: 20, width, height },
      });
    } catch (error) {
      store.setState({ message: error instanceof Error ? error.message : 'Upload gambar gagal.' });
    }
  }
  async function exportHtml() {
    setOutputBusy(true);
    try {
      if (store.getState().error) throw new Error('Perbaiki JSON terlebih dahulu.');
      await flush().catch(() => {});
      const snapshot = snapshotOutput(store.getState().workspace);
      download(await standaloneHtml(snapshot), 'kartesian-dokumen.html', 'text/html');
    } catch (error) {
      store.setState({ message: String(error) });
    } finally {
      setOutputBusy(false);
    }
  }
  function replaceDemo(reset = false) {
    if (
      !confirm(
        reset ? 'Kosongkan data dokumen aktif?' : 'Muat data contoh dan ganti dokumen aktif?',
      )
    )
      return;
    try {
      const decoded = decodeLegacy(reset ? [{ title: 'Dokumen Baru', pages: [] }] : demo);
      store.getState().replace(decoded.document, decoded.assets);
    } catch (error) {
      store.setState({ message: String(error) });
    }
  }
  const totalPages = docEntries.reduce((sum, docEntry) => sum + docEntry.pages.length, 0);
  const totalItems = docEntries.reduce(
    (sum, docEntry) => sum + docEntry.pages.reduce((total, page) => total + page.items.length, 0),
    0,
  );
  const status = {
    saved: 'Tersimpan di perangkat',
    pending: 'Perubahan belum tersimpan',
    saving: 'Menyimpan…',
    error: 'Gagal menyimpan',
  }[saveStatus];
  const tourSteps = [
    <>
      <b>Selamat datang di Kartesian.</b>
      <p>
        Susun teks dan gambar dengan koordinat milimeter pada kertas F4. Dokumen disimpan pada
        perangkat Anda.
      </p>
    </>,
    <>
      <b>Canvas & properti</b>
      <p>
        Klik untuk memilih, geser untuk memindahkan, dan tarik handle untuk mengubah ukuran. Gunakan
        Shift/Ctrl untuk multi-selection.
      </p>
    </>,
    <>
      <b>Panduan PDF</b>
      <p>
        Unggah PDF, pindai field, lalu tinjau kandidat sebelum menerapkannya. PDF.js berfungsi tanpa
        service Python.
      </p>
    </>,
    <>
      <b>Cetak dengan presisi</b>
      <p>
        Pilih F4, skala 100%, margin nol, tanpa header/footer. Backup workspace menyertakan PDF dan
        gambar.
      </p>
    </>,
  ];
  function finishTour() {
    try {
      localStorage.setItem('kartesian_onboarding_complete_v1', 'true');
    } catch {}
    setTour(null);
  }
  return (
    <>
      <div className="editor-app">
        <a className="skip-link" href="#printContainer">
          Lewati ke canvas
        </a>
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">
              <Crosshair size={22} />
            </span>
            <div>
              <h1>Kartesian</h1>
              <small>EDITOR KOORDINAT DOKUMEN</small>
            </div>
            <span className="header-divider header-optional" />
            <span className="pill header-optional">LOCAL WORKSPACE</span>
          </div>
          <div className="row">
            <span
              className={`save-label ${saveStatus === 'error' ? 'danger-text' : ''}`}
              role="status"
            >
              {offline.offline && <WifiOff size={12} />} {status}
            </span>
            {saveStatus === 'error' && (
              <button onClick={() => void flush().catch(() => {})}>Coba simpan</button>
            )}
            <button
              className="icon-button"
              aria-label="Undo"
              disabled={!undoCount || readonly}
              onClick={() => store.getState().undo()}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              disabled={!redoCount || readonly}
              onClick={() => store.getState().redo()}
            >
              <Redo2 size={16} />
            </button>
            <span className="header-divider" />
            <button
              className="header-optional"
              disabled={!!error || outputBusy}
              onClick={() => void exportHtml()}
            >
              <FileDown size={15} />
              Ekspor HTML
            </button>
            <button
              id="btnPrint"
              className="primary"
              disabled={!!error || outputBusy}
              onClick={() => void print()}
            >
              <Printer size={15} />
              {outputBusy ? 'Menyiapkan…' : 'Cetak'}
            </button>
            <button
              className="icon-button"
              aria-label="Ganti tema"
              onClick={() => store.getState().settings({ dark: !settings.dark })}
            >
              {settings.dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-button" aria-label="Bantuan" onClick={showHelp}>
              <CircleHelp size={17} />
            </button>
          </div>
        </header>
        {readonly && (
          <div className="banner">
            Workspace hanya-baca karena sedang digunakan tab lain.{' '}
            <button
              onClick={() => {
                void lease
                  .requestRelease()
                  .then(() => location.reload())
                  .catch((error) => store.setState({ message: String(error) }));
              }}
            >
              Ambil alih
            </button>{' '}
            <button
              onClick={() => {
                void backupWorkspace(store.getState().workspace).then((value) =>
                  download(value, 'kartesian-workspace.json'),
                );
              }}
            >
              Unduh backup
            </button>
          </div>
        )}
        {offline.updateAvailable && (
          <div className="banner">
            Versi baru siap. Semua tab akan menyimpan data sebelum diperbarui.{' '}
            <button onClick={offline.activate}>
              <RefreshCw size={14} />
              Perbarui aplikasi
            </button>
          </div>
        )}
        {error && (
          <div className="banner" role="alert">
            JSON belum valid. Preview mempertahankan dokumen valid terakhir; cetak dan ekspor
            dinonaktifkan.
          </div>
        )}
        <div className="editor-layout">
          <aside className="sidebar" aria-label="Panel editor">
            <section className="sidebar-section">
              <div className="section-label">Workspace aktif</div>
              <div className="document-name">{docEntries[0]?.title}</div>
              <div className="document-meta">
                <span>{docEntries.length} dokumen</span>
                <span>·</span>
                <span>{totalPages} halaman</span>
                <span>·</span>
                <span>{totalItems} elemen</span>
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  id="btnAddText"
                  disabled={readonly || !!error}
                  onClick={() =>
                    command({
                      type: 'add',
                      ...target(),
                      item: { text: 'Teks Baru', x: 20, y: 20, font_size: 10 },
                    })
                  }
                >
                  <Type size={14} />
                  Teks
                </button>
                <button disabled={readonly || !!error} onClick={() => addImage()}>
                  <ImagePlus size={14} />
                  Gambar
                </button>
                <button
                  disabled={readonly || !!error}
                  aria-label="Tambah halaman"
                  onClick={() => command({ type: 'addPage', debtorId: target().debtorId })}
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  disabled={readonly}
                  onClick={() => {
                    const name = prompt('Nama dokumen baru:');
                    if (name?.trim()) command({ type: 'addDocument', name: name.trim() });
                  }}
                >
                  + Dokumen
                </button>
                <button disabled={readonly} onClick={() => replaceDemo()}>
                  Contoh
                </button>
                <button className="danger" disabled={readonly} onClick={() => replaceDemo(true)}>
                  Reset
                </button>
              </div>
            </section>
            <PropertyPanel />
            <PdfPanel />
            <SettingsPanel />
            <section className="sidebar-section json-section">
              <details open={jsonOpen} onToggle={(event) => setJsonOpen(event.currentTarget.open)}>
                <summary>Data JSON</summary>
                {jsonOpen && <JsonPanel />}
              </details>
            </section>
            <div className="sidebar-section">
              <small>
                Privat di perangkat Anda.
                <br />
                PDF hanya dikirim ke service localhost jika mode scan memerlukannya.
              </small>
            </div>
          </aside>
          <main className="workspace">
            <div className="workspace-bar">
              <div>
                <h2>Canvas dokumen</h2>
                <small>F4 · 210 × 330 mm · Klik skala untuk garis bantu</small>
              </div>
              <div className="row">
                <label className="sr-only" htmlFor="canvasZoom">
                  Zoom canvas
                </label>
                <select
                  id="canvasZoom"
                  className="zoom-select"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                >
                  {[0.4, 0.5, 0.65, 0.75, 1, 1.25, 1.5].map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label="Fullscreen"
                  onClick={() => {
                    void (
                      document.fullscreenElement
                        ? document.exitFullscreen()
                        : document.documentElement.requestFullscreen()
                    ).catch((error) => store.setState({ message: String(error) }));
                  }}
                >
                  <Maximize size={15} />
                </button>
              </div>
            </div>
            <CanvasWorkspace zoom={zoom} addImage={addImage} context={openContext} />
          </main>
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void image(file);
          }}
        />
        {!!selected.length && !readonly && !error && <SelectionActions floating />}
        {context && !!selected.length && (
          <div
            role="menu"
            className="context-menu"
            style={{ left: context.x, top: context.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              role="menuitem"
              onClick={() => {
                command({ type: 'duplicate', ids: selected });
                setContext(null);
              }}
            >
              Duplikasi
            </button>
            <button
              role="menuitem"
              onClick={() => {
                const state = store.getState();
                command({
                  type: 'patch',
                  ids: selected,
                  patch: {
                    locked: !selected.every(
                      (id) => locate(state.workspace.document, id)?.item.locked,
                    ),
                  },
                });
                setContext(null);
              }}
            >
              Kunci / buka kunci
            </button>
            <button
              role="menuitem"
              onClick={() => {
                command({ type: 'patch', ids: selected, patch: { z_index: 1000 } });
                setContext(null);
              }}
            >
              Bawa ke depan
            </button>
            <button
              role="menuitem"
              onClick={() => {
                command({ type: 'patch', ids: selected, patch: { z_index: -1000 } });
                setContext(null);
              }}
            >
              Kirim ke belakang
            </button>
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                if (confirm('Hapus elemen terpilih?')) command({ type: 'delete', ids: selected });
                setContext(null);
              }}
            >
              Hapus
            </button>
          </div>
        )}
        {help && (
          <Dialog title="Bantuan & shortcut" onClose={() => setHelp(false)}>
            <p>
              Klik dua kali teks untuk mengedit. Klik dua kali area kosong untuk menambahkan teks
              pada koordinat tersebut.
            </p>
            <table className="help-table">
              <tbody>
                {[
                  ['Ctrl/Cmd + Z', 'Undo'],
                  ['Ctrl + Y / Cmd + Shift + Z', 'Redo'],
                  ['Ctrl/Cmd + A', 'Pilih semua di halaman aktif'],
                  ['Ctrl/Cmd + D', 'Duplikasi'],
                  ['Arrow / Shift + Arrow', 'Geser 0,1 mm / 1 mm'],
                  ['Shift / Alt + resize', 'Rasio tetap / dari tengah'],
                  ['Alt + L', 'Kunci posisi'],
                  ['Alt + A / H / D', 'Rata kiri / tengah / kanan'],
                  ['Alt + W / V / S', 'Rata atas / tengah / bawah'],
                  ['Alt + Shift + H / V', 'Distribusi horizontal / vertikal'],
                  ['Delete / Escape', 'Hapus / kosongkan selection'],
                  ['Ctrl/Cmd + P', 'Cetak'],
                ].map(([key, label]) => (
                  <tr key={key}>
                    <td>
                      <kbd>{key}</kbd>
                    </td>
                    <td>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              style={{ marginTop: 15 }}
              onClick={() => {
                setHelp(false);
                setTour(0);
              }}
            >
              Mulai panduan
            </button>
          </Dialog>
        )}
        {tour !== null && (
          <Dialog title={`Panduan Kartesian · ${tour + 1}/4`} onClose={finishTour}>
            <div className="tour-step">{tourSteps[tour]}</div>
            <div className="dialog-actions row spread">
              <button onClick={finishTour}>Lewati</button>
              <button
                className="primary"
                onClick={() => (tour === 3 ? finishTour() : setTour(tour + 1))}
              >
                {tour === 3 ? 'Mulai menyusun' : 'Berikutnya'}
              </button>
            </div>
          </Dialog>
        )}
      </div>
      <PrintSurface ref={printRoot} />
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="Tutup notifikasi" onClick={() => store.setState({ message: '' })}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
