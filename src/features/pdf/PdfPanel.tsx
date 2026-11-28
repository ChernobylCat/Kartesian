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
import { paperOf } from '@/domain/document/paper';
import { fitPdfCandidates } from '@/infrastructure/pdf/background';
import { formatFixed } from '@/i18n/core';
import { useT } from '@/i18n/react';
import type { DetectorHealth } from '@/infrastructure/pdf/detector';

function Review({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { store } = useEditor();
  const candidates = useEditorState((state) => state.workspace.pdf.candidates);
  const pages = useEditorState((state) => state.workspace.pdf.pages);
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const [rows, setRows] = useState<(Candidate & { checked: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void fitPdfCandidates(candidates, pages, paper)
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
          setError(t('review.backgroundFailed'));
          setRows([]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [candidates, pages, paper, t]);
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
        applyCandidates(
          encodeLegacy(state.workspace.document, state.workspace.assets),
          selected,
          paperOf(state.workspace.document),
        ),
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
        message: error instanceof Error ? error.message : t('review.applyFailed'),
      });
    }
  }
  return (
    <Dialog title={t('review.title')} wide onClose={onClose}>
      <p className="muted">{t('review.intro')}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button
          disabled={loading || !!error}
          onClick={() => setRows(rows.map((row) => ({ ...row, checked: true })))}
        >
          {t('review.selectAll')}
        </button>
        <button onClick={() => setRows(rows.map((row) => ({ ...row, checked: false })))}>
          {t('review.clearSelection')}
        </button>
      </div>
      <div className="candidate-list">
        {rows.map((row, index) => (
          <div key={row.id} className="candidate">
            <input
              type="checkbox"
              checked={row.checked}
              aria-label={t('review.selectRow', { label: row.label })}
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
              aria-label={t('review.fieldLabel')}
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
              aria-label={t('review.placeholderKey')}
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
              {t('review.location', {
                page: row.pageNumber,
                source: row.source,
                x: formatFixed(row.x),
                y: formatFixed(row.y),
              })}
            </small>
          </div>
        ))}
      </div>
      {loading && <p role="status">{t('review.fitting')}</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !rows.length && <p className="muted">{t('review.empty')}</p>}
      <div className="row spread" style={{ marginTop: 18 }}>
        <button
          className="danger"
          onClick={() => {
            if (confirm(t('review.confirmClear'))) {
              const state = store.getState();
              state.pdf({ ...state.workspace.pdf, candidates: [] });
              onClose();
            }
          }}
        >
          {t('review.clear')}
        </button>
        <button
          className="primary"
          disabled={loading || !!error || !rows.some((row) => row.checked)}
          onClick={apply}
        >
          {t('review.apply', { count: rows.filter((row) => row.checked).length })}
        </button>
      </div>
    </Dialog>
  );
}
export default function PdfPanel() {
  const t = useT();
  const { store } = useEditor();
  const settings = useEditorState((state) => state.workspace.settings);
  const pdf = useEditorState((state) => state.workspace.pdf);
  const readonly = useEditorState((state) => state.readonly || state.frozen);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<ScanMode>('auto');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [health, setHealth] = useState<DetectorHealth | 'checking'>('checking');
  useEffect(() => {
    const controller = new AbortController();
    void detectorHealth(controller.signal).then(setHealth);
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, []);
  async function run(file?: File) {
    if (store.getState().readonly || store.getState().frozen) return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    const signal = controller.signal;
    let expected = store.getState().workspace.pdf;
    const unsubscribe = store.subscribe((state) => {
      if (state.workspace.pdf !== expected || state.readonly || state.frozen) controller.abort();
    });
    setBusy(true);
    setReview(false);
    let instance: Awaited<ReturnType<typeof openPdf>> | undefined;
    try {
      if (
        file &&
        (file.size === 0 ||
          file.size > LIMITS.pdfBytes ||
          (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')))
      )
        throw new Error(t('pdf.invalidFile'));
      const bytes = file
        ? new Uint8Array(await file.arrayBuffer())
        : store.getState().workspace.pdf.bytes;
      if (!bytes) throw new Error(t('pdf.bytesMissing'));
      signal.throwIfAborted();
      setProgress(t('pdf.opening'));
      instance = await openPdf(bytes, signal);
      signal.throwIfAborted();
      if (file) {
        const pages = await renderPdf(instance.pdf, signal, setProgress);
        signal.throwIfAborted();
        expected = { pages, candidates: [], bytes, fileName: file.name };
        store.getState().pdf(expected);
        store.getState().settings({ overlay: 'uploaded_pdf' });
      }
      const result = await scan(instance.pdf, bytes, mode, instance.ops, signal, setProgress);
      signal.throwIfAborted();
      expected = { ...expected, candidates: result.candidates };
      store.getState().pdf(expected);
      setProgress(
        [t('pdf.found', { count: result.candidates.length }), ...result.warnings].join(' '),
      );
      setReview(true);
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : t('pdf.failed');
        store.setState({ message });
        setProgress(message);
      }
    } finally {
      unsubscribe();
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
        <summary>{t('pdf.section')}</summary>
        <div className="stack">
          <label className="field">
            {t('pdf.background')}
            <select
              value={settings.overlay}
              disabled={readonly}
              onChange={(event) =>
                store
                  .getState()
                  .settings({ overlay: event.target.value as typeof settings.overlay })
              }
            >
              <option value="none">{t('pdf.overlayNone')}</option>
              <option value="doc_1">{t('pdf.overlayShowcase')}</option>
              <option value="uploaded_pdf">
                {t('pdf.overlayUploaded')}
                {pdf.fileName ? ` · ${pdf.fileName}` : ''}
              </option>
            </select>
          </label>
          <p className="settings-note">{t('pdf.overlayNote')}</p>
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
          <button data-tour="pdf" disabled={readonly} onClick={() => input.current?.click()}>
            <FileUp size={14} /> {t('pdf.upload')}
          </button>
          {(pdf.bytes || pdf.pages.length > 0) && (
            <button
              className="danger"
              disabled={readonly}
              onClick={() => {
                if (confirm(t('pdf.confirmRemove'))) {
                  operation.current?.abort();
                  store.getState().pdf(emptyPdf());
                  store.getState().settings({ overlay: 'none' });
                  setProgress(t('pdf.removed'));
                  setReview(false);
                }
              }}
            >
              <Trash2 size={14} />
              {t('pdf.remove')}
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
            {t('pdf.showGuide')}
          </label>
          <label className="field">
            {t('pdf.opacity', { value: settings.overlayOpacity })}
            <input
              aria-label={t('pdf.opacityLabel')}
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
            {t('pdf.engine')}
            <select
              aria-label={t('pdf.scanMode')}
              value={mode}
              onChange={(event) => setMode(event.target.value as ScanMode)}
            >
              <option value="auto">{t('pdf.engineAuto')}</option>
              <option value="pdfjs">{t('pdf.enginePdfjs')}</option>
              <option value="pymupdf">{t('pdf.enginePymupdf')}</option>
              <option value="paddleocr">{t('pdf.enginePaddle')}</option>
            </select>
          </label>
          <div className="row">
            <button disabled={busy || readonly || !pdf.bytes} onClick={() => void run()}>
              <ScanLine size={14} />
              {t('pdf.rescan')}
            </button>
            <button
              disabled={busy || readonly || !pdf.candidates.length}
              onClick={() => setReview(true)}
            >
              <ListChecks size={14} />
              {t('pdf.review', { count: pdf.candidates.length })}
            </button>
            {busy && (
              <button
                onClick={() => {
                  operation.current?.abort();
                  setProgress(t('pdf.scanCancelled'));
                }}
                aria-label={t('pdf.cancelScan')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="settings-note">{t(`detector.health.${health}`)}</p>
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
