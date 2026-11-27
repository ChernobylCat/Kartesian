'use client';
import { useEffect, useRef, useState } from 'react';
import { FileUp, ScanLine, ListChecks, X, Trash2 } from 'lucide-react';
import { useEditor, useEditorState } from '../editor/context';
import Dialog from '@/components/ui/Dialog';
import { emptyPdf, type Candidate } from '@/application/ports';
import { decodeLegacy, encodeLegacy } from '@/domain/document/model';
import { LIMITS } from '@/domain/document/schema';
import {
  applyCandidates,
  detectorHealth,
  normalizePlaceholderKey,
  scan,
  type ScanMode,
} from '@/infrastructure/pdf/detector';
import { openPdf, renderPdf } from '@/infrastructure/pdf/pdf-runtime';
import { fitPdfCandidates } from '@/infrastructure/pdf/background';

function Review({ onClose }: { onClose: () => void }) {
  const { store } = useEditor();
  const candidates = useEditorState((state) => state.workspace.pdf.candidates);
  const pages = useEditorState((state) => state.workspace.pdf.pages);
  const [rows, setRows] = useState<(Candidate & { checked: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void fitPdfCandidates(candidates, pages)
      .then((fitted) => {
        if (active) {
          setRows(
            fitted.map((candidate) => ({ ...candidate, checked: candidate.confidence >= 0.75 })),
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Background PDF gagal dibaca. Unggah ulang PDF sebelum menerapkan field.');
          setRows([]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [candidates, pages]);
  function apply() {
    try {
      const state = store.getState();
      const selected = rows
        .filter((row) => row.checked)
        .map(({ checked: _checked, ...candidate }) => ({
          ...candidate,
          key: normalizePlaceholderKey(candidate.key),
          placeholder: `{{${normalizePlaceholderKey(candidate.key)}}}`,
        }));
      const result = decodeLegacy(
        applyCandidates(encodeLegacy(state.workspace.document, state.workspace.assets), selected),
        state.workspace.document,
        state.workspace.assets,
      );
      state.replace(result.document, result.assets);
      state.pdf({
        ...state.workspace.pdf,
        candidates: candidates.filter(
          (candidate) => !selected.some((entry) => entry.id === candidate.id),
        ),
      });
      onClose();
    } catch (error) {
      store.setState({
        message: error instanceof Error ? error.message : 'Kandidat gagal diterapkan.',
      });
    }
  }
  return (
    <Dialog title="Tinjau kandidat field" wide onClose={onClose}>
      <p className="muted">
        Kandidat dengan keyakinan rendah mulai tidak terpilih. Placeholder diterapkan ke halaman
        yang sama pada setiap dokumen.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button
          disabled={loading || !!error}
          onClick={() => setRows(rows.map((row) => ({ ...row, checked: true })))}
        >
          Pilih semua
        </button>
        <button onClick={() => setRows(rows.map((row) => ({ ...row, checked: false })))}>
          Kosongkan pilihan
        </button>
      </div>
      <div className="candidate-list">
        {rows.map((row, index) => (
          <div key={row.id} className="candidate">
            <input
              type="checkbox"
              checked={row.checked}
              aria-label={`Pilih ${row.label}`}
              onChange={(event) =>
                setRows(
                  rows.map((entry, i) =>
                    i === index ? { ...entry, checked: event.target.checked } : entry,
                  ),
                )
              }
            />
            <input
              type="text"
              aria-label="Label field"
              value={row.label}
              maxLength={120}
              onChange={(event) =>
                setRows(
                  rows.map((entry, i) =>
                    i === index ? { ...entry, label: event.target.value } : entry,
                  ),
                )
              }
            />
            <input
              type="text"
              aria-label="Key placeholder"
              value={row.key}
              onChange={(event) =>
                setRows(
                  rows.map((entry, i) =>
                    i === index ? { ...entry, key: event.target.value } : entry,
                  ),
                )
              }
            />
            <span className="candidate-confidence">{Math.round(row.confidence * 100)}%</span>
            <small>
              Hal. {row.pageNumber} · {row.source} · {row.x.toFixed(1)}, {row.y.toFixed(1)} mm
            </small>
          </div>
        ))}
      </div>
      {loading && <p role="status">Menyesuaikan koordinat dengan background…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && (
        <p className="muted">
          Tidak ada kandidat. Anda tetap dapat menambahkan teks secara manual.
        </p>
      )}
      <div className="row spread" style={{ marginTop: 18 }}>
        <button
          className="danger"
          onClick={() => {
            if (confirm('Hapus semua kandidat?')) {
              const state = store.getState();
              state.pdf({ ...state.workspace.pdf, candidates: [] });
              onClose();
            }
          }}
        >
          Hapus kandidat
        </button>
        <button
          className="primary"
          disabled={loading || !!error || !rows.some((row) => row.checked)}
          onClick={apply}
        >
          Terapkan {rows.filter((row) => row.checked).length} field
        </button>
      </div>
    </Dialog>
  );
}
export default function PdfPanel() {
  const { store } = useEditor();
  const settings = useEditorState((state) => state.workspace.settings);
  const pdf = useEditorState((state) => state.workspace.pdf);
  const readonly = useEditorState((state) => state.readonly);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<ScanMode>('auto');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [health, setHealth] = useState('PDF.js aktif · service lokal opsional');
  useEffect(() => {
    const controller = new AbortController();
    void detectorHealth(controller.signal).then(setHealth);
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, []);
  async function run(file?: File) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    const signal = controller.signal;
    setBusy(true);
    let instance: Awaited<ReturnType<typeof openPdf>> | undefined;
    try {
      if (
        file &&
        (file.size === 0 ||
          file.size > LIMITS.pdfBytes ||
          (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')))
      )
        throw new Error('PDF harus valid dan berukuran maksimal 25 MB.');
      const bytes = file
        ? new Uint8Array(await file.arrayBuffer())
        : store.getState().workspace.pdf.bytes;
      if (!bytes) throw new Error('Byte PDF tidak tersedia. Unggah ulang PDF.');
      signal.throwIfAborted();
      setProgress('Membuka PDF…');
      instance = await openPdf(bytes);
      signal.throwIfAborted();
      let next = store.getState().workspace.pdf;
      if (file) {
        const pages = await renderPdf(instance.pdf, signal, setProgress);
        signal.throwIfAborted();
        next = { pages, candidates: [], bytes, fileName: file.name };
        store.getState().pdf(next);
        store.getState().settings({ overlay: 'uploaded_pdf' });
      }
      const result = await scan(instance.pdf, bytes, mode, instance.ops, signal, setProgress);
      signal.throwIfAborted();
      store.getState().pdf({ ...next, candidates: result.candidates as Candidate[] });
      setProgress(`${result.candidates.length} kandidat ditemukan. ${result.warnings.join(' ')}`);
      setReview(true);
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : 'PDF gagal diproses.';
        store.setState({ message });
        setProgress(message);
      }
    } finally {
      await instance?.pdf.loadingTask.destroy().catch(() => {});
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section className="sidebar-section">
      <details open>
        <summary>Panduan PDF & deteksi field</summary>
        <div className="stack">
          <label className="field">
            Background
            <select
              value={settings.overlay}
              disabled={readonly}
              onChange={(event) =>
                store
                  .getState()
                  .settings({ overlay: event.target.value as typeof settings.overlay })
              }
            >
              <option value="none">Tanpa panduan</option>
              <option value="doc_1">Dokumen showcase · 1 halaman</option>
              <option value="uploaded_pdf">
                PDF yang diunggah{pdf.fileName ? ` · ${pdf.fileName}` : ''}
              </option>
            </select>
          </label>
          <p className="settings-note">
            Panduan dipasang proporsional di tengah kertas F4 tanpa dipotong. Layout yang dibuat
            dengan panduan versi lama perlu dicek ulang kesesuaiannya.
          </p>
          <input
            hidden
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void run(file);
            }}
          />
          <button disabled={readonly} onClick={() => input.current?.click()}>
            <FileUp size={14} /> Unggah PDF
          </button>
          {(pdf.bytes || pdf.pages.length > 0) && (
            <button
              className="danger"
              disabled={readonly}
              onClick={() => {
                if (confirm('Hapus PDF unggahan beserta kandidatnya dari workspace aktif?')) {
                  operation.current?.abort();
                  store.getState().pdf(emptyPdf());
                  store.getState().settings({ overlay: 'none' });
                  setProgress('PDF unggahan dihapus.');
                  setReview(false);
                }
              }}
            >
              <Trash2 size={14} />
              Hapus PDF
            </button>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.overlayVisible}
              onChange={(event) =>
                store.getState().settings({ overlayVisible: event.target.checked })
              }
            />
            Tampilkan panduan
          </label>
          <label className="field">
            Opacity · {settings.overlayOpacity}%
            <input
              aria-label="Opacity panduan"
              type="range"
              min={5}
              max={100}
              value={settings.overlayOpacity}
              onChange={(event) =>
                store.getState().settings({ overlayOpacity: Number(event.target.value) })
              }
            />
          </label>
          <label className="field">
            Mesin pemindaian
            <select
              aria-label="Mode scan"
              value={mode}
              onChange={(event) => setMode(event.target.value as ScanMode)}
            >
              <option value="auto">Otomatis</option>
              <option value="pdfjs">PDF.js saja · browser</option>
              <option value="pymupdf">PyMuPDF · service lokal</option>
              <option value="paddleocr">PaddleOCR · service lokal</option>
            </select>
          </label>
          <div className="row">
            <button disabled={busy || readonly || !pdf.bytes} onClick={() => void run()}>
              <ScanLine size={14} />
              Pindai ulang
            </button>
            <button disabled={readonly || !pdf.candidates.length} onClick={() => setReview(true)}>
              <ListChecks size={14} />
              Tinjau ({pdf.candidates.length})
            </button>
            {busy && (
              <button
                onClick={() => {
                  operation.current?.abort();
                  setProgress('Pemindaian dibatalkan.');
                }}
                aria-label="Batalkan scan"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="settings-note">{health}</p>
          {progress && (
            <p role="status" className="scan-progress">
              {progress}
            </p>
          )}
        </div>
      </details>
      {review && <Review onClose={() => setReview(false)} />}
    </section>
  );
}
