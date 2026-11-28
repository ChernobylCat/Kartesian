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
  FileCode,
  Moon,
  Sun,
  CircleHelp,
  Maximize,
  Plus,
  X,
  WifiOff,
  RefreshCw,
  FileSpreadsheet,
  ListFilter,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { EditorContext, useCommand, useEditor, useEditorState } from './context';
import { createEditorStore, type EditorStore } from './store/editor-store';
import { attachAutosave } from '@/application/editor-session';
import { freezeAndFlush } from '@/application/workspace-transfer';
import {
  IndexedWorkspaceRepository,
  loadOrMigrate,
  backupWorkspace,
  blobDataUrl,
} from '@/infrastructure/storage/workspace';
import { SessionLease } from '@/infrastructure/storage/session-lease';
import { demo, decodeLegacy, locate, uid } from '@/domain/document/model';
import type { AddTarget } from '@/domain/document/commands';
import { errorMessage } from '@/application/error-message';
import { LEGACY_SETTINGS_KEY, LEGACY_THEME_KEY } from '@/infrastructure/serialization/settings';
import { LIMITS, imageSource } from '@/domain/document/schema';
import { snapshotOutput, waitForAssets } from '@/application/prepare-output';
import { download, scopedPageCount, standaloneHtml } from '@/infrastructure/export/html';
import { isFullScope } from '@/domain/document/output-scope';
import OutputScopeDialog from '../print/OutputScopeDialog';
import CanvasWorkspace from './components/CanvasWorkspace';
import PaperPicker from './components/PaperPicker';
import AddElementMenu from './components/AddElementMenu';
import LayersPanel from './components/LayersPanel';
import MergeDialog from '../merge/MergeDialog';
import WorkspacesDialog from '../workspaces/WorkspacesDialog';
import { useCurrentWorkspace } from '../workspaces/useCurrentWorkspace';
import { paperLabel, paperOf } from '@/domain/document/paper';
import PropertyPanel, { SelectionActions } from './components/PropertyPanel';
import PdfPanel from '../pdf/PdfPanel';
import SettingsPanel from '../settings/SettingsPanel';
import PrintSurface from '../print/PrintSurface';
import Dialog from '@/components/ui/Dialog';
import { useKeyboard } from './hooks/useKeyboard';
import { useOffline } from './hooks/useOffline';
import { useClipboard } from './hooks/useClipboard';
import { GRID_KEY, GRID_SIZES, UNIT_KEY } from './preferences';
import { isUnit } from '@/domain/document/units';
import { useFitZoom, type ZoomMode } from './hooks/useFitZoom';
import { serializeClipboard } from '@/domain/document/clipboard';
import { finishEditing } from './finish-editing';
import { slotPageNumber } from './page-slots';
import { t as translateNow } from '@/i18n/core';
import { useDocumentLanguage, useT } from '@/i18n/react';
import LanguageSwitch from './components/LanguageSwitch';
import { readPendingTour, type TourKind } from '../onboarding/onboarding';
import type { Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '@/styles/tour.css';

const JsonPanel = dynamic(() => import('./components/JsonPanel'), {
  ssr: false,
  loading: () => <p className="muted">{translateNow('json.loading')}</p>,
});
type Runtime = { store: EditorStore; flush: () => Promise<void>; lease: SessionLease };

const newText = () => ({ text: translateNow('item.newText'), x: 20, y: 20, font_size: 10 });

/**
 * Runs a recovery action while holding the workspace lock, so no other editor tab
 * writes concurrently. `busyMessage` is shown when another tab owns the lock.
 */
async function withExclusiveRepository<T>(
  busyMessage: string,
  action: (repository: IndexedWorkspaceRepository) => Promise<T>,
) {
  const repository = new IndexedWorkspaceRepository();
  const lease = new SessionLease(async () => {});
  try {
    if (!(await lease.acquire())) throw new Error(busyMessage);
    return await action(repository);
  } finally {
    lease.close();
    repository.close();
  }
}

export default function EditorClient() {
  const t = useT();
  useDocumentLanguage();
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
      if (!store || !saver || store.getState().error)
        throw new Error(translateNow('lease.saveDraftFirst'));
      const unfreeze = await freezeAndFlush(store, saver.flush, finishEditing);
      store.setState({ readonly: true, message: translateNow('lease.released') });
      unfreeze();
    });
    void (async () => {
      const owner = await lease.acquire();
      if (disposed) {
        lease.close();
        return;
      }
      const workspace = owner ? await loadOrMigrate(repository) : await repository.load();
      if (!workspace) throw new Error(translateNow('workspace.otherTabPreparing'));
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
      if (!disposed) setError(errorMessage(error, translateNow('workspace.openFailed')));
    });
    return () => {
      disposed = true;
      saver?.destroy();
      lease.close();
      repository.close();
    };
  }, [retry]);
  /** Runs a recovery action, then reopens the editor or shows the failure. */
  function recover(
    busyMessage: string,
    action: (repository: IndexedWorkspaceRepository) => Promise<unknown>,
  ) {
    void withExclusiveRepository(busyMessage, action)
      .then(() => {
        setError('');
        setRetry((value) => value + 1);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }
  if (error)
    return (
      <main className="loading-screen">
        <div className="recovery">
          <div className="brand-mark">
            <Crosshair size={24} />
          </div>
          <h1>{t('recovery.title')}</h1>
          <p role="alert">{error}</p>
          <p className="muted">{t('recovery.body')}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              style={{
                backgroundColor: 'var(--color-primary, #2563eb)',
                color: '#ffffff',
                fontWeight: 600,
              }}
              onClick={() =>
                recover(t('recovery.closeTabsRepair'), async (repository) => {
                  const { repairWorkspace } = await import('@/infrastructure/storage/workspace');
                  await repairWorkspace(repository);
                })
              }
            >
              {t('recovery.repair')}
            </button>
            <button
              onClick={() => {
                setError('');
                setRetry((value) => value + 1);
              }}
            >
              {t('action.retry')}
            </button>
            <button
              onClick={() => {
                try {
                  download(
                    JSON.stringify(
                      {
                        settings: localStorage.getItem(LEGACY_SETTINGS_KEY),
                        theme: localStorage.getItem(LEGACY_THEME_KEY),
                      },
                      null,
                      2,
                    ),
                    'kartesian-recovery-legacy.json',
                  );
                } catch (error) {
                  setError(errorMessage(error));
                }
              }}
            >
              {t('recovery.downloadRaw')}
            </button>
            <button onClick={() => restoreInput.current?.click()}>{t('recovery.restore')}</button>
            <button
              style={{ color: '#ef4444' }}
              onClick={() => {
                if (!confirm(t('recovery.confirmReset'))) return;
                recover(t('recovery.closeTabsReset'), async (repository) => {
                  const { resetWorkspace } = await import('@/infrastructure/storage/workspace');
                  await resetWorkspace(repository);
                });
              }}
            >
              {t('recovery.reset')}
            </button>
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
                recover(t('recovery.closeTabsRestore'), async (repository) => {
                  if (file.size > LIMITS.backupBytes) throw new Error(t('error.backupTooLarge'));
                  const { restoreWorkspace } = await import('@/infrastructure/storage/workspace');
                  const restored = await restoreWorkspace(await file.text());
                  // Loading syncs the repository's storage version so the save is not
                  // rejected as a concurrent change; a broken record is expected here.
                  await repository.load().catch(() => {});
                  await repository.save(restored);
                });
            }}
          />
          <p className="settings-note">{t('recovery.note')}</p>
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
          {t('workspace.opening')}
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
  const t = useT();
  const { store, flush } = useEditor();
  const command = useCommand();
  const settings = useEditorState((state) => state.workspace.settings);
  const docEntries = useEditorState((state) => state.workspace.document.documents);
  const error = useEditorState((state) => state.error);
  const selected = useEditorState((state) => state.selected);
  const readonly = useEditorState((state) => state.readonly);
  const paper = useEditorState((state) => paperOf(state.workspace.document));
  const frozen = useEditorState((state) => state.frozen);
  const undoCount = useEditorState((state) => state.undoStack.length);
  const redoCount = useEditorState((state) => state.redoStack.length);
  const saveStatus = useEditorState((state) => state.saveStatus);
  const message = useEditorState((state) => state.message);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(0.75);
  const zoom = useFitZoom(zoomMode, paper);
  const grid = useEditorState((state) => state.grid);
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState<TourKind | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [currentWorkspace, setCurrentWorkspace] = useCurrentWorkspace();
  const outputScope = useEditorState((state) => state.outputScope);
  const [outputBusy, setOutputBusy] = useState(false);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<AddTarget>({ documentId: docEntries[0]!.id });
  const printRoot = useRef<HTMLDivElement>(null);
  const offline = useOffline();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark);
    try {
      localStorage.setItem(LEGACY_THEME_KEY, settings.dark ? 'dark' : 'light');
    } catch {}
  }, [settings.dark]);
  useEffect(() => {
    // A read-only tab is a second window on a workspace; the owner tab shows the tour.
    const pending = readPendingTour();
    if (pending && !store.getState().readonly) setTour(pending);
    try {
      const savedGrid = Number(localStorage.getItem(GRID_KEY));
      if (GRID_SIZES.includes(savedGrid)) store.setState({ grid: savedGrid });
      const savedUnit = localStorage.getItem(UNIT_KEY);
      if (isUnit(savedUnit)) store.setState({ unit: savedUnit });
    } catch {}
  }, [store]);
  // The tour code and driver.js load on demand, so the editor does not pay for them
  // until a tour starts. The chunk is precached, so this also works offline.
  useEffect(() => {
    if (!tour) return;
    let cancelled = false;
    let running: Driver | undefined;
    void import('../onboarding/run-tour')
      .then(({ startTour }) => {
        if (!cancelled) running = startTour(tour, () => setTour(null));
      })
      .catch((error: unknown) => {
        setTour(null);
        store.setState({ message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
      if (running?.isActive()) running.destroy();
    };
  }, [tour, store]);
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
      store.setState({ message: t('json.fixBeforePrint') });
      return;
    }
    if (!scopedPageCount(state.workspace, state.outputScope)) {
      store.setState({ message: t('scope.nothing') });
      return;
    }
    setOutputBusy(true);
    try {
      await flush().catch(() => {});
      if (printRoot.current) await waitForAssets(printRoot.current);
      window.print();
    } catch (error) {
      store.setState({ message: t('print.cancelled', { reason: errorMessage(error) }) });
    } finally {
      setOutputBusy(false);
    }
  }, [store, flush, t]);
  const showHelp = useCallback(() => setHelp(true), []);
  useKeyboard(() => {
    void print();
  }, showHelp);
  /** Where new content goes: the selected item's page, else the active (maybe virtual) page. */
  const target = useCallback((): AddTarget => {
    const state = store.getState();
    const selected = state.selected[0]
      ? locate(state.workspace.document, state.selected[0])
      : undefined;
    if (selected) return { documentId: selected.document.id, pageId: selected.page.id };
    const { activePage } = state;
    const docs = state.workspace.document.documents;
    const docEntry =
      docs.find(
        (entry) =>
          entry.pages.some((page) => page.id === activePage) ||
          slotPageNumber(activePage, entry.id) !== undefined,
      ) ?? docs[0]!;
    const pageNumber = slotPageNumber(activePage, docEntry.id);
    if (pageNumber) return { documentId: docEntry.id, pageNumber };
    return {
      documentId: docEntry.id,
      pageId: docEntry.pages.find((page) => page.id === activePage)?.id ?? docEntry.pages[0]?.id,
    };
  }, [store]);
  useClipboard(target);
  const addImage = useCallback(
    (documentId?: string, pageId?: string, pageNumber?: number) => {
      uploadTarget.current = documentId ? { documentId, pageId, pageNumber } : target();
      imageInput.current?.click();
    },
    [target],
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
        throw new Error(t('image.invalidFile'));
      const source = await blobDataUrl(file);
      if (!imageSource.test(source)) throw new Error(t('image.unsafeSource'));
      const image = new Image();
      image.src = source;
      await image.decode();
      const id = uid();
      const width = 30,
        height = Math.min(100, (width * image.naturalHeight) / image.naturalWidth);
      const current = store.getState();
      const docs = current.workspace.document.documents;
      if (!docs.some((entry) => entry.id === uploadTarget.current.documentId))
        throw new Error(t('image.targetChanged'));
      current.command(
        {
          type: 'add',
          ...uploadTarget.current,
          item: { type: 'image', text: '', assetId: id, x: 20, y: 20, width, height },
        },
        undefined,
        { [id]: { id, dataUrl: source } },
      );
    } catch (error) {
      store.setState({ message: errorMessage(error, t('image.uploadFailed')) });
    }
  }
  async function exportPdfFile() {
    setOutputBusy(true);
    try {
      if (store.getState().error) throw new Error(t('json.fixFirst'));
      await flush().catch(() => {});
      const { workspace, outputScope } = store.getState();
      if (!scopedPageCount(workspace, outputScope)) throw new Error(t('scope.nothing'));
      // pdf-lib is loaded only when a PDF is requested.
      const { exportPdf } = await import('@/infrastructure/export/pdf');
      const bytes = await exportPdf(snapshotOutput(workspace), outputScope);
      download(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
        'kartesian-dokumen.pdf',
      );
    } catch (error) {
      store.setState({ message: errorMessage(error, t('export.pdfFailed')) });
    } finally {
      setOutputBusy(false);
    }
  }
  async function exportHtml() {
    setOutputBusy(true);
    try {
      if (store.getState().error) throw new Error(t('json.fixFirst'));
      await flush().catch(() => {});
      const { workspace, outputScope } = store.getState();
      if (!scopedPageCount(workspace, outputScope)) throw new Error(t('scope.nothing'));
      download(
        await standaloneHtml(snapshotOutput(workspace), outputScope),
        'kartesian-dokumen.html',
        'text/html',
      );
    } catch (error) {
      store.setState({ message: errorMessage(error, t('export.failed')) });
    } finally {
      setOutputBusy(false);
    }
  }
  function replaceDemo(reset = false) {
    if (!confirm(reset ? t('confirm.reset') : t('confirm.loadExample'))) return;
    try {
      // NOTE: `demo` is currently the same empty document as a reset.
      const decoded = decodeLegacy(reset ? [{ title: t('document.new'), pages: [] }] : demo());
      store.getState().replace(decoded.document, decoded.assets);
    } catch (error) {
      store.setState({ message: errorMessage(error) });
    }
  }
  const totalPages = docEntries.reduce((sum, docEntry) => sum + docEntry.pages.length, 0);
  const totalItems = docEntries.reduce(
    (sum, docEntry) => sum + docEntry.pages.reduce((total, page) => total + page.items.length, 0),
    0,
  );
  const status = {
    saved: t('save.saved'),
    pending: t('save.pending'),
    saving: t('save.saving'),
    error: t('save.error'),
  }[saveStatus];
  function openTour(kind: TourKind) {
    setHelp(false);
    setTour(kind);
  }
  return (
    <>
      <div className="editor-app" inert={frozen}>
        <a className="skip-link" href="#printContainer">
          {t('nav.skipToCanvas')}
        </a>
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">
              <Crosshair size={22} />
            </span>
            <div>
              <h1>Kartesian</h1>
              <small>{t('brand.tagline')}</small>
            </div>
            <span className="header-divider header-optional" />
            <span className="pill header-optional">LOCAL WORKSPACE</span>
          </div>
          <div className="row">
            <span
              className={`save-label ${saveStatus === 'error' ? 'danger-text' : ''}`}
              role="status"
              title={status}
            >
              {offline.offline && <WifiOff size={12} />} {status}
            </span>
            {saveStatus === 'error' && (
              // From 721 px up only the icon shows; aria-label and title keep the name.
              <button
                className="save-retry"
                aria-label={t('save.retry')}
                title={t('save.retry')}
                onClick={() => void flush().catch(() => {})}
              >
                <RefreshCw size={15} />
                <span className="button-label">{t('save.retry')}</span>
              </button>
            )}
            <button
              className="icon-button"
              aria-label={t('action.undo')}
              disabled={!undoCount || readonly}
              onClick={() => store.getState().undo()}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={t('action.redo')}
              disabled={!redoCount || readonly}
              onClick={() => store.getState().redo()}
            >
              <Redo2 size={16} />
            </button>
            <span className="header-divider" />
            <div className="row" data-tour="output">
              {/* On narrow screens only the icons show; aria-label and title keep the names. */}
              <button
                className="header-collapsible"
                aria-label={t('export.html')}
                title={t('export.html')}
                disabled={!!error || outputBusy}
                onClick={() => void exportHtml()}
              >
                <FileCode size={15} />
                <span className="button-label">{t('export.html')}</span>
              </button>
              <button
                className="header-collapsible"
                aria-label={t('export.pdf')}
                title={t('export.pdf')}
                disabled={!!error || outputBusy}
                onClick={() => void exportPdfFile()}
              >
                <FileText size={15} />
                <span className="button-label">{t('export.pdf')}</span>
              </button>
              <button
                id="btnPrint"
                className="primary"
                disabled={!!error || outputBusy}
                onClick={() => void print()}
              >
                <Printer size={15} />
                {outputBusy
                  ? t('output.preparing')
                  : isFullScope(outputScope)
                    ? t('print.action')
                    : t('print.partial')}
              </button>
              <button
                className={`icon-button ${isFullScope(outputScope) ? '' : 'active'}`}
                aria-label={t('scope.title')}
                title={t('scope.title')}
                disabled={!!error}
                onClick={() => setScopeOpen(true)}
              >
                <ListFilter size={16} />
              </button>
            </div>
            <button
              className="icon-button"
              aria-label={t('theme.toggle')}
              onClick={() => store.getState().settings({ dark: !settings.dark })}
            >
              {settings.dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <LanguageSwitch />
            <button className="icon-button" aria-label={t('help.open')} onClick={showHelp}>
              <CircleHelp size={17} />
            </button>
          </div>
        </header>
        {readonly && (
          <div className="banner">
            {t('readonly.banner')}{' '}
            <button
              onClick={() => {
                void lease
                  .requestRelease()
                  .then(() => location.reload())
                  .catch((error: unknown) => store.setState({ message: errorMessage(error) }));
              }}
            >
              {t('readonly.takeOver')}
            </button>{' '}
            <button
              onClick={() => {
                void backupWorkspace(store.getState().workspace)
                  .then((value) => download(value, 'kartesian-workspace.json'))
                  .catch((error: unknown) =>
                    store.setState({ message: errorMessage(error, t('backup.failed')) }),
                  );
              }}
            >
              {t('backup.download')}
            </button>
          </div>
        )}
        {offline.updateAvailable && (
          <div className="banner">
            {t('update.ready')}{' '}
            <button onClick={offline.activate}>
              <RefreshCw size={14} />
              {t('update.apply')}
            </button>
          </div>
        )}
        {error && (
          <div className="banner" role="alert">
            {t('json.invalidBanner')}
          </div>
        )}
        <div className="editor-layout">
          <aside className="sidebar" aria-label={t('sidebar.label')}>
            <section className="sidebar-section">
              <div className="row spread" data-tour="workspaces">
                <div className="section-label">{t('sidebar.workspace')}</div>
                <button
                  className="icon-button"
                  aria-label={t('workspaces.title')}
                  title={t('workspaces.title')}
                  disabled={!currentWorkspace}
                  onClick={() => setWorkspacesOpen(true)}
                >
                  <FolderOpen size={15} />
                </button>
              </div>
              <div className="document-name">{currentWorkspace?.name ?? docEntries[0]?.title}</div>
              <div className="document-meta">
                <span>{t('count.documents', { count: docEntries.length })}</span>
                <span>·</span>
                <span>{t('count.pages', { count: totalPages })}</span>
                <span>·</span>
                <span>{t('count.elements', { count: totalItems })}</span>
              </div>
              <div className="row" style={{ marginTop: 16 }} data-tour="add">
                <button
                  id="btnAddText"
                  disabled={readonly || !!error}
                  onClick={() => command({ type: 'add', ...target(), item: newText() })}
                >
                  <Type size={14} />
                  {t('add.text')}
                </button>
                <button disabled={readonly || !!error} onClick={() => addImage()}>
                  <ImagePlus size={14} />
                  {t('add.image')}
                </button>
                <AddElementMenu target={target} disabled={readonly || !!error} />
                <button
                  disabled={readonly || !!error}
                  aria-label={t('add.page')}
                  onClick={() => command({ type: 'addPage', documentId: target().documentId })}
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  disabled={readonly}
                  onClick={() => {
                    const name = prompt(t('prompt.documentName'));
                    if (name?.trim()) command({ type: 'addDocument', name: name.trim() });
                  }}
                >
                  {t('add.document')}
                </button>
                <button
                  data-tour="merge"
                  disabled={readonly || !!error}
                  onClick={() => setMergeTarget(target().documentId)}
                >
                  <FileSpreadsheet size={14} />
                  {t('merge.open')}
                </button>
                <button disabled={readonly} onClick={() => replaceDemo()}>
                  {t('action.example')}
                </button>
                <button className="danger" disabled={readonly} onClick={() => replaceDemo(true)}>
                  {t('action.reset')}
                </button>
              </div>
            </section>
            <PropertyPanel />
            <LayersPanel />
            <PdfPanel />
            <SettingsPanel />
            <section className="sidebar-section json-section">
              <details open={jsonOpen} onToggle={(event) => setJsonOpen(event.currentTarget.open)}>
                <summary>{t('json.section')}</summary>
                {jsonOpen && <JsonPanel />}
              </details>
            </section>
            <div className="sidebar-section">
              <small>
                {t('privacy.local')}
                <br />
                {t('privacy.detector')}
              </small>
            </div>
          </aside>
          <main className="workspace">
            <div className="workspace-bar">
              <div>
                <h2>{t('canvas.title')}</h2>
                <small>
                  {paperLabel(paper)} · {t('canvas.rulerHint')}
                </small>
              </div>
              <div className="row">
                {/* Remounting on a size change resets the custom-size draft. */}
                <PaperPicker key={`${paper.width}x${paper.height}`} />
                <label className="sr-only" htmlFor="canvasGrid">
                  {t('canvas.grid')}
                </label>
                <select
                  id="canvasGrid"
                  className="grid-select"
                  value={grid}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    store.setState({ grid: value });
                    try {
                      localStorage.setItem(GRID_KEY, String(value));
                    } catch {}
                  }}
                >
                  {GRID_SIZES.map((value) => (
                    <option key={value} value={value}>
                      {value ? t('canvas.gridSize', { size: value }) : t('canvas.gridOff')}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="canvasZoom">
                  {t('canvas.zoom')}
                </label>
                <select
                  id="canvasZoom"
                  className="zoom-select"
                  value={String(zoomMode)}
                  onChange={(event) => {
                    const value = event.target.value;
                    setZoomMode(value.startsWith('fit') ? (value as ZoomMode) : Number(value));
                  }}
                >
                  <option value="fit-width">
                    {t('canvas.fitWidth')}
                    {zoomMode === 'fit-width' ? ` · ${Math.round(zoom * 100)}%` : ''}
                  </option>
                  <option value="fit-page">
                    {t('canvas.fitPage')}
                    {zoomMode === 'fit-page' ? ` · ${Math.round(zoom * 100)}%` : ''}
                  </option>
                  {[0.4, 0.5, 0.65, 0.75, 1, 1.25, 1.5].map((value) => (
                    <option key={value} value={value}>
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={t('canvas.fullscreen')}
                  onClick={() => {
                    void (
                      document.fullscreenElement
                        ? document.exitFullscreen()
                        : document.documentElement.requestFullscreen()
                    ).catch((error: unknown) => store.setState({ message: errorMessage(error) }));
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
                const state = store.getState();
                const items = selected.flatMap((id) => {
                  const item = locate(state.workspace.document, id)?.item;
                  return item ? [item] : [];
                });
                void navigator.clipboard
                  .writeText(serializeClipboard(items, state.workspace.assets))
                  .then(() => store.setState({ message: t('clipboard.copied') }))
                  .catch((failure: unknown) => store.setState({ message: errorMessage(failure) }));
                setContext(null);
              }}
            >
              {t('action.copy')}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                command({ type: 'duplicate', ids: selected });
                setContext(null);
              }}
            >
              {t('action.duplicate')}
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
              {t('action.toggleLock')}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                const grouped = selected.some(
                  (id) => locate(store.getState().workspace.document, id)?.item.group_id,
                );
                command({ type: grouped ? 'ungroup' : 'group', ids: selected });
                setContext(null);
              }}
            >
              {selected.some((id) => locate(store.getState().workspace.document, id)?.item.group_id)
                ? t('action.ungroup')
                : t('action.group')}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                command({ type: 'patch', ids: selected, patch: { z_index: 1000 } });
                setContext(null);
              }}
            >
              {t('action.bringToFront')}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                command({ type: 'patch', ids: selected, patch: { z_index: -1000 } });
                setContext(null);
              }}
            >
              {t('action.sendToBack')}
            </button>
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                if (confirm(t('confirm.deleteSelected')))
                  command({ type: 'delete', ids: selected });
                setContext(null);
              }}
            >
              {t('action.delete')}
            </button>
          </div>
        )}
        {scopeOpen && <OutputScopeDialog onClose={() => setScopeOpen(false)} />}
        {workspacesOpen && currentWorkspace && (
          <WorkspacesDialog
            current={currentWorkspace}
            onCurrentChange={setCurrentWorkspace}
            onClose={() => setWorkspacesOpen(false)}
          />
        )}
        {mergeTarget && (
          <MergeDialog initialDocumentId={mergeTarget} onClose={() => setMergeTarget(null)} />
        )}
        {help && (
          <Dialog title={t('help.title')} onClose={() => setHelp(false)}>
            <p>{t('help.intro')}</p>
            <table className="help-table">
              <tbody>
                {[
                  ['Ctrl/Cmd + Z', t('action.undo')],
                  ['Ctrl + Y / Cmd + Shift + Z', t('action.redo')],
                  ['Ctrl/Cmd + A', t('shortcut.selectAll')],
                  ['Ctrl/Cmd + D', t('action.duplicate')],
                  ['Ctrl/Cmd + C / X / V', t('shortcut.clipboard')],
                  ['Ctrl/Cmd + G / Shift + G', t('shortcut.group')],
                  ['Arrow / Shift + Arrow', t('shortcut.nudge')],
                  ['Shift / Alt + resize', t('shortcut.resize')],
                  ['Alt + L', t('shortcut.lock')],
                  ['Alt + A / H / D', t('shortcut.alignHorizontal')],
                  ['Alt + W / V / S', t('shortcut.alignVertical')],
                  ['Alt + Shift + H / V', t('shortcut.distribute')],
                  ['Delete / Escape', t('shortcut.deleteOrClear')],
                  ['Ctrl/Cmd + P', t('print.action')],
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
            <div className="row" style={{ marginTop: 15 }}>
              <button onClick={() => openTour('full')}>{t('tour.start')}</button>
              <button onClick={() => openTour('whatsNew')}>{t('tour.whatsNew')}</button>
            </div>
          </Dialog>
        )}
      </div>
      <PrintSurface ref={printRoot} />
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label={t('toast.close')} onClick={() => store.setState({ message: '' })}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
