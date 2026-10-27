import { APP_CONFIG } from './config.mjs';
import * as pdfjsLib from '../assets/vendor/pdf.min.mjs';
import { createBootstrapController } from './app/bootstrap.mjs';
import { createCanvasCommandController } from './canvas/commands.mjs';
import { createFormatTransactionController } from './canvas/format-transaction.mjs';
import { createCanvasInteractionController } from './canvas/interactions.mjs';
import { createCanvasKeyboardController } from './canvas/keyboard-controller.mjs';
import { renderCanvasPages } from './canvas/renderer.mjs';
import { isValidImageSrc, parseDocumentJson } from './core/document-schema.mjs';
import { applyFieldCandidates } from './pdf/field-detector.mjs';
import { createEditorController } from './editor/controller.mjs';
import {
  buildStandaloneExportHtml,
  downloadHtml,
  sanitizeExportFileName,
  serializeRenderedPages,
} from './export/html-export.mjs';
import { createOverlayController } from './overlay/controller.mjs';
import { createSettingsController } from './settings/controller.mjs';
import { createHistoryManager } from './state/history.mjs';
import { createAppShellController } from './ui/app-shell.mjs';
import { showConfirm, showToast } from './ui/feedback.mjs';
import { createFormatToolbarController } from './ui/format-toolbar.mjs';
import { createPropertyPanelController } from './ui/property-panel.mjs';
import { createContextMenuController } from './ui/context-menu.mjs';
import { createOnboardingController } from './ui/onboarding.mjs';
import { createFieldReviewController } from './ui/field-review.mjs';
import { registerServiceWorker } from './pwa/register.mjs';

const AppState = {
  editor: null, // jsonEditor
  isSilentUpdate: false, // isSilentUpdate
  activeUpload: {
    // activeUploadDbIdx/PageIdx
    dbIdx: 0,
    pageIdx: 0,
  },
  previewPageMap: [], // previewPageMap
  selectedElements: [], // elemen terpilih untuk multi-select dan keyboard
};
let editorDataCache = { source: null, data: null };
let fieldReview = null;
const appLifecycle = new AbortController();

const historyManager = createHistoryManager({
  onChange: ({ canUndo, canRedo }) => {
    const undoButton = document.getElementById('btnUndo');
    const redoButton = document.getElementById('btnRedo');
    if (undoButton) undoButton.disabled = !canUndo;
    if (redoButton) redoButton.disabled = !canRedo;
  },
});
const overlayController = createOverlayController({
  pdfLibrary: pdfjsLib,
  pdfWorkerSrc: new URL('../assets/vendor/pdf.worker.min.mjs', import.meta.url).href,
  confirmDelete: showConfirm,
  showToast,
  onSave: () => settingsController.scheduleSave(),
  onRender: () => renderDataDariJSON(),
  onValidate: () => {
    if (AppState.editor) editorController.validate(AppState.editor.getValue());
  },
  onCandidatesChange: (candidates) => fieldReview?.setCandidates(candidates),
});
const settingsController = createSettingsController({
  getJson: () => AppState.editor?.getValue() ?? document.getElementById('jsonInput').value,
  setJson: (value) => {
    document.getElementById('jsonInput').value = value;
    if (!AppState.editor) return;
    AppState.isSilentUpdate = true;
    AppState.editor.setValue(value, -1);
    AppState.isSilentUpdate = false;
    historyManager.commit(value);
  },
  getOverlaySettings: overlayController.getSettings,
  applyOverlaySettings: overlayController.applySettings,
  beforeImport: pushStateToUndo,
  onRender: () => renderDataDariJSON(),
  onStatusChange: ({ state, label }) => {
    const status = document.getElementById('saveStatus');
    if (!status) return;
    status.dataset.state = state;
    status.textContent = label;
  },
  showToast,
});
const canvasCommands = createCanvasCommandController({
  getData: readEditorData,
  pushUndo: pushStateToUndo,
  updateData: updateEditorData,
});
fieldReview = createFieldReviewController({
  onApply: applyPdfFieldSuggestions,
  onDismiss: (candidateIds) => overlayController.removeCandidates(candidateIds),
  confirmDismiss: showConfirm,
  showToast,
  isPreviewVisible: () =>
    document.getElementById('overlayDocSelect')?.value === 'uploaded_pdf' &&
    (document.getElementById('overlayToggle')?.checked ?? true),
});
function setCanvasSelection(selections, options) {
  AppState.selectedElements = Array.isArray(selections)
    ? selections
    : selections
      ? [selections]
      : [];
  propertyPanel?.setSelection(AppState.selectedElements, options);
}

const formatTransaction = createFormatTransactionController({
  onPendingChange: (pending) => {
    if (!pending) return;
    const status = document.getElementById('saveStatus');
    if (status) {
      status.dataset.state = 'pending';
      status.textContent = 'Mengedit…';
    }
  },
  commitPatch: (selections, patch) => {
    updateSelectionProperties(selections, patch, { rerender: false });
    setCanvasSelection(AppState.selectedElements, { preserveActive: true });
    const selected = AppState.selectedElements.length === 1 ? AppState.selectedElements[0] : null;
    if (selected?.element?.querySelector('.text-content') && formatToolbar.isVisible()) {
      formatToolbar.show(selected.element, selected.dbIdx, selected.pageIdx, selected.itemIdx);
    }
  },
});
const propertyPanel = createPropertyPanelController({
  getItem: getItemFromEditor,
  previewProperties: formatTransaction.preview,
  beginProperties: formatTransaction.begin,
  flushProperties: formatTransaction.flush,
  align: alignSelection,
  clearSelection: () => canvasInteractions.clearSelection(),
  showToast,
});
const formatToolbar = createFormatToolbarController({
  getItem: getItemFromEditor,
  showToast,
  setSelection: (selection) => setCanvasSelection(selection ? [selection] : []),
  duplicateSelection: duplicateSelectedItems,
  deleteSelection: deleteSelectedItems,
  beginFormat: formatTransaction.begin,
  previewFormat: formatTransaction.preview,
  flushFormat: formatTransaction.flush,
  endFormat: formatTransaction.end,
});
const canvasInteractions = createCanvasInteractionController({
  getItem: getItemFromEditor,
  updateData: updateEditorData,
  pushUndo: pushStateToUndo,
  showFormatToolbar: formatToolbar.show,
  hideFormatToolbar: formatToolbar.hide,
  setSelection: setCanvasSelection,
  isSnappingEnabled: settingsController.isSnappingEnabled,
});
const canvasKeyboard = createCanvasKeyboardController({
  undo,
  redo,
  getSelection: () => AppState.selectedElements,
  clearSelection: canvasInteractions.clearSelection,
  getItem: getItemFromEditor,
  pushUndo: pushStateToUndo,
  updateData: updateEditorData,
  save: () => settingsController.scheduleSave(),
  deleteSelection: deleteSelectedItems,
  duplicateSelection: duplicateSelectedItems,
  selectAll: selectAllItems,
  toggleLock: toggleSelectionLock,
  alignSelection,
  showFormatToolbar: formatToolbar.show,
  isFormatToolbarVisible: formatToolbar.isVisible,
});
const contextMenu = createContextMenuController({
  root: document.getElementById('printContainer'),
  selectTarget: (element) => canvasInteractions.selectElement(element),
  duplicateSelection: duplicateSelectedItems,
  deleteSelection: deleteSelectedItems,
  toggleLock: toggleSelectionLock,
  changeLayer: changeSelectionLayer,
});
const onboarding = createOnboardingController({});
const editorController = createEditorController({
  parseDocument: parseDocumentJson,
  getActivePdfPageCount,
  isSilentUpdate: () => AppState.isSilentUpdate,
  onSave: () => settingsController.scheduleSave(),
  onValidInput: (value) => {
    historyManager.recordInput(value);
    renderDataDariJSON();
  },
  onFallback: () =>
    showToast('Ace Editor gagal dimuat; editor teks sederhana digunakan.', 'warning', 6000),
});
const appShell = createAppShellController({
  getEditor: () => AppState.editor,
});
const bootstrapController = createBootstrapController({
  settingsController,
  historyManager,
  editorController,
  overlayController,
  defaultJson: () => DEFAULT_DEMO_JSON,
  setEditor: (editor) => {
    AppState.editor = editor;
  },
  render: () => renderDataDariJSON(),
  syncTheme: appShell.syncTheme,
  onError: (error) => {
    console.error('Bootstrap aplikasi gagal:', error);
    showToast(`Aplikasi gagal dimulai: ${error.message}`, 'error', 8000);
  },
});

// --- CORE HELPER FUNCTIONS ---

// Snapshot dan penerapan settings dikelola oleh settingsController.

function getActivePdfPageCount() {
  return overlayController.getActivePageCount();
}

function readEditorData() {
  const source = AppState.editor?.getValue() ?? document.getElementById('jsonInput').value;
  if (editorDataCache.source === source && editorDataCache.data) return editorDataCache.data;
  const data = parseDocumentJson(source);
  editorDataCache = { source, data };
  return data;
}

function cacheEditorData(source, data) {
  editorDataCache = { source, data };
}

// Sinkronisasi editor saat apply/import diinjeksikan ke settingsController.

function getItemFromEditor(dbIdx, pageIdx, itemIdx) {
  if (!AppState.editor) return null;
  try {
    const data = readEditorData();
    if (data[dbIdx]?.pages?.[pageIdx]?.items?.[itemIdx]) {
      return { data, item: data[dbIdx].pages[pageIdx].items[itemIdx] };
    }
  } catch (e) {}
  return null;
}

function updateEditorData(data, options = {}) {
  const { silent = false, rerender = true } = options;
  if (silent) AppState.isSilentUpdate = true;
  const serialized = JSON.stringify(data, null, 2);

  let cursor = null;
  if (AppState.editor) {
    cursor = AppState.editor.getCursorPosition();
    AppState.editor.setValue(serialized, -1);
    AppState.editor.moveCursorToPosition(cursor);
    historyManager.commit(AppState.editor.getValue());
  } else {
    document.getElementById('jsonInput').value = serialized;
  }
  cacheEditorData(serialized, data);

  if (silent) AppState.isSilentUpdate = false;
  if (rerender) renderDataDariJSON();
}

async function applyPdfFieldSuggestions(candidates) {
  const result = applyFieldCandidates(readEditorData(), candidates);
  parseDocumentJson(JSON.stringify(result.data));
  if (result.addedCount > 0) {
    pushStateToUndo();
    updateEditorData(result.data, { silent: true });
  }
  try {
    await overlayController.removeCandidates(result.appliedCandidateIds);
  } catch (error) {
    console.warn('Placeholder diterapkan, tetapi status kandidat gagal disimpan:', error);
    showToast(
      'Placeholder diterapkan, tetapi kandidat mungkin muncul kembali setelah reload.',
      'warning',
      6000,
    );
  }
  return result;
}

function renderDataDariJSON(isManual = false) {
  formatTransaction.flush();
  const textarea = document.getElementById('jsonInput');
  const container = document.getElementById('printContainer');
  const scrollY = window.scrollY;
  const selectionSnapshot = AppState.selectedElements.map(({ dbIdx, pageIdx, itemIdx }) => ({
    dbIdx,
    pageIdx,
    itemIdx,
  }));

  try {
    const dataList = readEditorData();

    canvasInteractions.clearSelection();

    const renderResult = renderCanvasPages(dataList, {
      activePdfPageCount: getActivePdfPageCount(),
      container,
    });
    AppState.previewPageMap = renderResult.previewPageMap;

    overlayController.afterRender();

    canvasInteractions.init(container);
    selectionSnapshot.forEach((selection, index) => {
      const element = container.querySelector(
        `.data-item[data-db-idx="${selection.dbIdx}"][data-page-idx="${selection.pageIdx}"][data-item-idx="${selection.itemIdx}"]`,
      );
      if (element) canvasInteractions.selectElement(element, { additive: index > 0 });
    });

    // Ubah markup data-lucide menjadi icon SVG Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Kembalikan posisi scroll
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });

    // Sinkronisasikan state komitmen setelah rendering selesai
    if (AppState.editor && !AppState.isSilentUpdate) {
      historyManager.commit(AppState.editor.getValue());
    }
  } catch (error) {
    if (isManual) {
      showToast(`Data tidak dapat dirender: ${error.message}`, 'error', 6000);
    }
    console.error(error);
  }
}

// Overlay preview dan PDF dikelola oleh overlayController.

// Kalibrasi, persistence, serta import/export dikelola oleh settingsController.

// Upload, render, persistence, dan lifecycle PDF dikelola oleh overlayController.

// --- MANAJEMEN EDITOR KODE JSON (ACE EDITOR) ---
const DEFAULT_DEMO_JSON = `[
  {
    "title": "Dokumen Baru",
    "pages": []
  }
]`;

// Adapter, validasi live, dan annotation dikelola oleh editorController.

function beautifyJsonInput() {
  if (!editorController.beautify()) {
    showToast('Tidak dapat merapikan: format JSON saat ini masih mengandung error.', 'error');
  }
}

async function loadDemoJson() {
  if (!AppState.editor) return;
  if (await showConfirm('Apakah Anda yakin ingin memuat kembali data contoh awal?')) {
    pushStateToUndo();
    AppState.editor.setValue(DEFAULT_DEMO_JSON, -1);
  }
}

async function resetJsonData() {
  if (!AppState.editor) return;
  if (await showConfirm('Apakah Anda yakin ingin mengosongkan seluruh data elemen template?')) {
    const emptyJson = `[\n  {\n    "title": "Dokumen Baru",\n    "pages": []\n  }\n]`;
    pushStateToUndo();
    formatToolbar.hide();
    AppState.editor.setValue(emptyJson, -1);
    renderDataDariJSON();
  }
}

// --- SISTEM PENGELOLAAN ELEMEN VISUAL ---

function addNewTextElement(dbIdx = null, pageIdx = null, customX = null, customY = null) {
  if (!AppState.editor) return;
  try {
    if (dbIdx === null || pageIdx === null) {
      const totalPages = AppState.previewPageMap ? AppState.previewPageMap.length - 1 : 0;
      if (totalPages > 1) {
        const targetPageStr = prompt(
          `Pilih nomor pratinjau kertas tujuan (1 s.d. ${totalPages}):`,
          '1',
        );
        if (targetPageStr === null) return;
        const targetPage = parseInt(targetPageStr, 10);
        if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
          showToast(`Halaman tidak valid. Masukkan angka antara 1 s.d. ${totalPages}.`, 'warning');
          return;
        }
        const target = AppState.previewPageMap[targetPage];
        dbIdx = target.dbIdx;
        pageIdx = target.pageIdx;
      } else {
        dbIdx = 0;
        pageIdx = 0;
      }
    }

    const posX = customX !== null ? customX : 20.0;
    const posY = customY !== null ? customY : 20.0;
    const result = canvasCommands.addText({ dbIdx, pageIdx, x: posX, y: posY });

    // Jika di-tambah kustom via double-click, picu langsung mode edit
    if (customX !== null && customY !== null) {
      const newElem = document.querySelector(
        `.data-item[data-db-idx="${result.dbIdx}"][data-page-idx="${result.pageIdx}"][data-item-idx="${result.itemIdx}"]`,
      );
      if (newElem) {
        // Kirim event dblclick buatan ke element untuk memicu inline text editing secara langsung
        const dblClickEvt = new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        newElem.dispatchEvent(dblClickEvt);
      }
    }
  } catch (err) {
    showToast('Tidak dapat menambah elemen: Pastikan format JSON saat ini tidak error.', 'error');
  }
}

function triggerImageUpload(dbIdx = null, pageIdx = null) {
  if (dbIdx === null || pageIdx === null) {
    const totalPages = AppState.previewPageMap ? AppState.previewPageMap.length - 1 : 0;
    if (totalPages > 1) {
      const targetPageStr = prompt(
        `Pilih nomor pratinjau kertas tujuan untuk gambar (1 s.d. ${totalPages}):`,
        '1',
      );
      if (targetPageStr === null) return;
      const targetPage = parseInt(targetPageStr, 10);
      if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
        showToast(`Halaman tidak valid. Masukkan angka antara 1 s.d. ${totalPages}.`, 'warning');
        return;
      }
      const target = AppState.previewPageMap[targetPage];
      dbIdx = target.dbIdx;
      pageIdx = target.pageIdx;
    } else {
      dbIdx = 0;
      pageIdx = 0;
    }
  }
  AppState.activeUpload.dbIdx = dbIdx;
  AppState.activeUpload.pageIdx = pageIdx;
  document.getElementById('imageUploadInput').click();
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (file.size === 0) {
    showToast('Berkas gambar kosong.', 'error');
    event.target.value = '';
    return;
  }
  if (!allowedTypes.includes(file.type)) {
    showToast('Format gambar harus PNG, JPEG, WebP, atau GIF.', 'error');
    event.target.value = '';
    return;
  }
  if (file.size > APP_CONFIG.MAX_IMAGE_FILE_SIZE_BYTES) {
    showToast('Ukuran gambar melebihi batas 2 MB.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    if (!AppState.editor) return;
    try {
      if (!isValidImageSrc(e.target.result)) {
        throw new TypeError('Isi berkas gambar tidak valid atau tidak didukung.');
      }
      const dbIdx = AppState.activeUpload.dbIdx;
      const pageIdx = AppState.activeUpload.pageIdx;
      canvasCommands.addImage({ dbIdx, pageIdx, src: e.target.result });
    } catch (err) {
      showToast(`Tidak dapat menambah gambar: ${err.message}`, 'error');
    }
  };
  reader.onerror = () => {
    showToast('Berkas gambar gagal dibaca. Silakan pilih ulang gambar.', 'error');
  };
  reader.onabort = () => {
    showToast('Pembacaan berkas gambar dibatalkan.', 'warning');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function deleteItem(dbIdx, pageIdx, itemIdx, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (!(await showConfirm('Apakah Anda yakin ingin menghapus elemen ini?'))) return;

  canvasInteractions.clearSelection();
  try {
    canvasCommands.delete({ dbIdx, pageIdx, itemIdx });
  } catch (err) {
    console.error('Gagal menghapus elemen:', err);
    showToast('Elemen tidak dapat dihapus.', 'error');
  }
}

function updateSelectionProperties(selections, patch, { rerender = true } = {}) {
  if (!selections.length) return;
  try {
    canvasCommands.update({ selections, patch }, { silent: true, rerender });
    settingsController.scheduleSave();
  } catch (error) {
    showToast(`Properti tidak dapat diterapkan: ${error.message}`, 'error');
  }
}

function alignSelection(selections, action) {
  try {
    canvasCommands.align({ selections, action });
    settingsController.scheduleSave();
    showToast('Elemen berhasil diratakan.', 'success');
  } catch (error) {
    showToast(error.message, 'warning');
  }
}

function selectAllItems() {
  const current = AppState.selectedElements[0];
  const page = current?.element.closest('.print-page') || document.querySelector('.print-page');
  if (!page) return;
  page.querySelectorAll('.data-item').forEach((element) => element.classList.add('selected-item'));
  const selections = [...page.querySelectorAll('.data-item')].map((element) => ({
    element,
    dbIdx: Number(element.dataset.dbIdx),
    pageIdx: Number(element.dataset.pageIdx),
    itemIdx: Number(element.dataset.itemIdx),
  }));
  formatToolbar.hide();
  setCanvasSelection(selections);
}

async function deleteSelectedItems() {
  const selections = [...AppState.selectedElements];
  if (!selections.length) return false;
  if (!(await showConfirm(`Hapus ${selections.length} elemen terpilih?`))) return false;
  try {
    canvasInteractions.clearSelection();
    canvasCommands.deleteMany({ selections });
    showToast(`${selections.length} elemen dihapus.`, 'success');
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  }
}

function duplicateSelectedItems() {
  const selections = [...AppState.selectedElements];
  if (!selections.length) return;
  try {
    canvasCommands.cloneMany({ selections });
    showToast(`${selections.length} elemen diduplikasi.`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function toggleSelectionLock() {
  const selections = [...AppState.selectedElements];
  if (!selections.length) return;
  const shouldLock = !selections.every(
    (selection) =>
      getItemFromEditor(selection.dbIdx, selection.pageIdx, selection.itemIdx)?.item.locked,
  );
  updateSelectionProperties(selections, { locked: shouldLock });
}

function changeSelectionLayer(direction) {
  const selections = [...AppState.selectedElements];
  if (!selections.length) return;
  const data = readEditorData();
  const page = data[selections[0].dbIdx]?.pages?.[selections[0].pageIdx];
  if (!page) return;
  const layers = page.items.map((item) => (Number.isInteger(item.z_index) ? item.z_index : 1));
  const z_index =
    direction === 'front'
      ? Math.min(1000, Math.max(...layers) + 1)
      : Math.max(-1000, Math.min(...layers) - 1);
  updateSelectionProperties(selections, { z_index });
}

// Floating formatting toolbar dikelola oleh formatToolbar.

// Delegasi event double-click pada printContainer untuk menambahkan teks baru secara langsung
document.getElementById('printContainer').addEventListener(
  'dblclick',
  function (e) {
    // Jika double-click di atas elemen draggable (teks/gambar) yang sudah ada, abaikan
    if (e.target.closest('.data-item')) return;

    const pageEl = e.target.closest('.print-page');
    if (!pageEl) return;

    const dbIdx = parseInt(pageEl.getAttribute('data-db-idx'), 10);
    const pageIdx = parseInt(pageEl.getAttribute('data-page-idx'), 10);

    const rect = pageEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Konversikan koordinat piksel ke milimeter (mm) berdasarkan rasio ukuran pratinjau kertas F4 (210mm x 330mm)
    const x_mm = parseFloat(((clickX / rect.width) * APP_CONFIG.PAPER_WIDTH_MM).toFixed(1));
    const y_mm = parseFloat(((clickY / rect.height) * APP_CONFIG.PAPER_HEIGHT_MM).toFixed(1));

    addNewTextElement(dbIdx, pageIdx, x_mm, y_mm);
  },
  { signal: appLifecycle.signal },
);

// --- EXTENSION FEATURES (HISTORY, CLONE, DARK MODE, KEYBOARD, HELP MODAL) ---

// 1. History orchestration
function pushStateToUndo() {
  if (!AppState.editor) return;
  historyManager.push(AppState.editor.getValue());
}

function undo() {
  if (!AppState.editor) return;
  formatTransaction.flush();
  const previousState = historyManager.undo(AppState.editor.getValue());
  if (previousState !== null) updateEditorDataFromStack(previousState);
}

function redo() {
  if (!AppState.editor) return;
  formatTransaction.flush();
  const nextState = historyManager.redo(AppState.editor.getValue());
  if (nextState !== null) updateEditorDataFromStack(nextState);
}

function updateEditorDataFromStack(jsonStr) {
  if (!AppState.editor) return;
  AppState.isSilentUpdate = true;
  const cursor = AppState.editor.getCursorPosition();
  AppState.editor.setValue(jsonStr, -1);
  AppState.editor.moveCursorToPosition(cursor);
  AppState.isSilentUpdate = false;

  historyManager.commit(jsonStr);

  editorController.validate(jsonStr);
  renderDataDariJSON();
}

// 2. Duplikasi Elemen (Clone Item)
function cloneItem(dbIdx, pageIdx, itemIdx, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  try {
    canvasCommands.clone({ dbIdx, pageIdx, itemIdx });
    showToast('Elemen berhasil diduplikasi!', 'success');
  } catch (error) {
    console.error('Gagal menduplikasi elemen:', error);
    showToast('Elemen tidak dapat diduplikasi.', 'error');
  }
}

// Theme, fullscreen, help modal, dan Escape lifecycle dikelola oleh appShell.

async function exportToHTML() {
  formatTransaction.flush();
  const container = document.getElementById('printContainer');
  const pages = Array.from(container.querySelectorAll('.print-page'));

  if (pages.length === 0) {
    showToast(
      'Belum ada halaman yang di-render. Klik "Render Preview" terlebih dahulu.',
      'warning',
    );
    return;
  }

  const hideCalOnPrint = document.getElementById('hideCalCheck').checked;
  const printOverlayVisible = document.getElementById('printOverlayCheck').checked;
  const offsetX = parseFloat(document.getElementById('offsetX').value) || 0;
  const offsetY = parseFloat(document.getElementById('offsetY').value) || 0;
  try {
    const pagesHtml = await serializeRenderedPages(pages, {
      hideCalibration: hideCalOnPrint,
      includeOverlay: printOverlayVisible,
    });
    const fileName = sanitizeExportFileName(document.getElementById('jsonInput').value);
    const exportHtml = buildStandaloneExportHtml({
      pagesHtml,
      fileName,
      offsetX,
      offsetY,
    });

    downloadHtml(exportHtml, fileName);
    showToast(`Berhasil mengexport ${pages.length} halaman ke file HTML!`, 'success');
  } catch (error) {
    console.error(error);
    showToast(
      'Export dibatalkan karena aset tidak dapat disematkan. Jalankan aplikasi melalui local server lalu coba lagi.',
      'error',
      7000,
    );
  }
}

function bindUiEvents(signal) {
  const on = (id, eventName, handler) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Elemen UI #${id} tidak ditemukan.`);
    element.addEventListener(eventName, handler, { signal });
  };

  on('btnUndo', 'click', undo);
  on('btnRedo', 'click', redo);
  on('btnAddText', 'click', () => addNewTextElement());
  on('btnAddImage', 'click', () => triggerImageUpload());
  on('btnFormatJson', 'click', beautifyJsonInput);
  on('btnLoadDemo', 'click', loadDemoJson);
  on('btnResetData', 'click', resetJsonData);
  on('imageUploadInput', 'change', handleImageUpload);
  on('btnRenderPreview', 'click', () => renderDataDariJSON(true));
  on('btnPrint', 'click', () => {
    formatTransaction.flush();
    window.print();
  });
  on('btnExportHtml', 'click', exportToHTML);

  on('printContainer', 'click', (event) => {
    const button = event.target.closest('[data-canvas-action]');
    if (!button) return;

    const dbIdx = Number(button.dataset.dbIdx);
    const pageIdx = Number(button.dataset.pageIdx);
    const itemIdx = Number(button.dataset.itemIdx);

    switch (button.dataset.canvasAction) {
      case 'add-text':
        addNewTextElement(dbIdx, pageIdx);
        break;
      case 'add-image':
        triggerImageUpload(dbIdx, pageIdx);
        break;
      case 'clone':
        cloneItem(dbIdx, pageIdx, itemIdx, event);
        break;
      case 'delete':
        deleteItem(dbIdx, pageIdx, itemIdx, event);
        break;
    }
  });
}

function destroyApp() {
  formatTransaction.destroy();
  appLifecycle.abort();
  canvasInteractions.destroy();
  canvasKeyboard.destroy();
  formatToolbar.destroy();
  propertyPanel.destroy();
  contextMenu.destroy();
  fieldReview?.destroy();
  appShell.destroy();
  bootstrapController.destroy();
}

bindUiEvents(appLifecycle.signal);
settingsController.init();
fieldReview.init();
overlayController.init();
formatToolbar.init();
propertyPanel.init();
contextMenu.init();
canvasKeyboard.init();
appShell.init();
bootstrapController.init();
onboarding.init();
registerServiceWorker({ showToast });
window.addEventListener('beforeunload', destroyApp, { once: true, signal: appLifecycle.signal });
