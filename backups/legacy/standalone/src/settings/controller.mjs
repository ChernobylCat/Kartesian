import { APP_CONFIG } from '../config.mjs';
import { normalizeSettings } from '../core/settings-schema.mjs';
import { debounce } from '../core/utils.mjs';
import { loadSettings, saveSettings } from '../storage/settings-storage.mjs';

const SAVE_STATUS_MODELS = Object.freeze({
  idle: { label: 'Siap', state: 'idle' },
  pending: { label: 'Belum tersimpan', state: 'pending' },
  saving: { label: 'Menyimpan…', state: 'saving' },
  saved: { label: 'Tersimpan lokal', state: 'saved' },
  error: { label: 'Gagal menyimpan', state: 'error' },
});

export function getSaveStatusModel(state) {
  return SAVE_STATUS_MODELS[state] ?? SAVE_STATUS_MODELS.idle;
}

export function normalizeCalibrationOffset(value, min = -50, max = 50) {
  const numericValue = Number.parseFloat(value) || 0;
  return Math.min(max, Math.max(min, numericValue));
}

export function createSettingsSnapshot({
  jsonInput,
  overlaySettings,
  offsetX,
  offsetY,
  hideCalibrationPrint,
  hideCalibrationPreview,
  snappingEnabled,
}) {
  return {
    schemaVersion: APP_CONFIG.SETTINGS_SCHEMA_VERSION,
    jsonInput,
    ...overlaySettings,
    offsetX: String(offsetX),
    offsetY: String(offsetY),
    hideCalCheck: Boolean(hideCalibrationPrint),
    hideCalPreviewCheck: Boolean(hideCalibrationPreview),
    enableSnapCheck: Boolean(snappingEnabled),
  };
}

export function createSettingsController({
  documentRef = document,
  windowRef = window,
  storageLoad = loadSettings,
  storageSave = saveSettings,
  getJson = () => '',
  setJson = () => {},
  getOverlaySettings = () => ({}),
  applyOverlaySettings = () => {},
  beforeImport = () => {},
  onRender = () => {},
  onStatusChange = () => {},
  showToast = () => {},
} = {}) {
  let lifecycle = null;
  let delayedCalibration = null;
  let storageWarningShown = false;
  const element = (id) => documentRef.getElementById(id);

  function updateStatus(state) {
    const model = getSaveStatusModel(state);
    onStatusChange(model);
    return model;
  }

  function snapshot() {
    return createSettingsSnapshot({
      jsonInput: getJson(),
      overlaySettings: getOverlaySettings(),
      offsetX: element('offsetX')?.value ?? 0,
      offsetY: element('offsetY')?.value ?? 0,
      hideCalibrationPrint: element('hideCalCheck')?.checked,
      hideCalibrationPreview: element('hideCalPreviewCheck')?.checked,
      snappingEnabled: element('enableSnapCheck')?.checked ?? true,
    });
  }

  function load() {
    try {
      const settings = storageLoad();
      updateStatus(settings ? 'saved' : 'idle');
      return settings;
    } catch (error) {
      console.error('Pengaturan tersimpan tidak valid:', error);
      showToast('Pengaturan tersimpan tidak valid; data contoh digunakan.', 'warning');
      updateStatus('error');
      return null;
    }
  }

  function saveNow() {
    updateStatus('saving');
    try {
      storageSave(snapshot());
      storageWarningShown = false;
      updateStatus('saved');
      return true;
    } catch (error) {
      console.error('Gagal menyimpan pengaturan:', error);
      if (!storageWarningShown) {
        showToast(
          'Penyimpanan browser penuh. Kurangi ukuran/jumlah gambar lalu ekspor pengaturan sebagai cadangan.',
          'error',
          6000,
        );
        storageWarningShown = true;
      }
      updateStatus('error');
      return false;
    }
  }

  const persistScheduled = debounce(saveNow, APP_CONFIG.SAVE_DEBOUNCE_MS);

  function scheduleSave() {
    updateStatus('pending');
    persistScheduled();
  }

  function applyCalibration() {
    const offsetX = element('offsetX');
    const offsetY = element('offsetY');
    if (!offsetX || !offsetY) return { x: 0, y: 0 };
    const x = normalizeCalibrationOffset(offsetX.value);
    const y = normalizeCalibrationOffset(offsetY.value);
    offsetX.value = String(x);
    offsetY.value = String(y);
    documentRef.documentElement.style.setProperty('--offset-x', `${x}mm`);
    documentRef.documentElement.style.setProperty('--offset-y', `${y}mm`);
    return { x, y };
  }

  function applyCanvasFlags() {
    const container = element('printContainer');
    if (!container) return;
    container.classList.toggle('hide-cal-on-print', element('hideCalCheck')?.checked ?? false);
    container.classList.toggle(
      'hide-cal-on-preview',
      element('hideCalPreviewCheck')?.checked ?? false,
    );
  }

  function apply(settings = {}, { includeJson = true } = {}) {
    if (includeJson && settings.jsonInput !== undefined) setJson(settings.jsonInput);
    applyOverlaySettings(settings);
    if (settings.offsetX !== undefined) element('offsetX').value = settings.offsetX;
    if (settings.offsetY !== undefined) element('offsetY').value = settings.offsetY;
    if (settings.hideCalCheck !== undefined)
      element('hideCalCheck').checked = settings.hideCalCheck;
    if (settings.hideCalPreviewCheck !== undefined) {
      element('hideCalPreviewCheck').checked = settings.hideCalPreviewCheck;
    }
    if (settings.enableSnapCheck !== undefined)
      element('enableSnapCheck').checked = settings.enableSnapCheck;
    applyCalibration();
    applyCanvasFlags();
  }

  function exportToFile() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const dataUrl = windowRef.URL.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = dataUrl;
    anchor.download = 'calibration-settings.json';
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(dataUrl), 1000);
  }

  async function importFromInput(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size === 0) throw new TypeError('File pengaturan kosong.');
      if (file.size > APP_CONFIG.MAX_SETTINGS_FILE_SIZE_BYTES) {
        throw new RangeError('Ukuran file pengaturan melebihi batas 5 MB.');
      }
      const settings = normalizeSettings(JSON.parse(await file.text()));
      beforeImport();
      apply(settings);
      onRender();
      saveNow();
      showToast('Pengaturan berhasil diimpor!', 'success');
    } catch (error) {
      showToast(`Gagal mengimpor file: ${error.message}`, 'error', 6000);
      console.error(error);
    } finally {
      input.value = '';
    }
  }

  function init() {
    delayedCalibration?.cancel();
    lifecycle?.abort();
    lifecycle = new AbortController();
    const { signal } = lifecycle;
    delayedCalibration = debounce(() => {
      applyCalibration();
      scheduleSave();
    }, APP_CONFIG.DEBOUNCE_DELAY_MS);

    element('offsetX')?.addEventListener('input', delayedCalibration, { signal });
    element('offsetY')?.addEventListener('input', delayedCalibration, { signal });
    element('hideCalCheck')?.addEventListener(
      'change',
      () => {
        applyCanvasFlags();
        scheduleSave();
      },
      { signal },
    );
    element('hideCalPreviewCheck')?.addEventListener(
      'change',
      () => {
        applyCanvasFlags();
        scheduleSave();
      },
      { signal },
    );
    element('enableSnapCheck')?.addEventListener('change', scheduleSave, { signal });
    element('btnExportSettings')?.addEventListener('click', exportToFile, { signal });
    element('btnImportSettings')?.addEventListener('click', () => element('importFile')?.click(), {
      signal,
    });
    element('importFile')?.addEventListener('change', importFromInput, { signal });
    windowRef.addEventListener('pagehide', saveNow, { signal });
  }

  function destroy() {
    delayedCalibration?.cancel();
    delayedCalibration = null;
    persistScheduled.cancel();
    lifecycle?.abort();
    lifecycle = null;
  }

  return {
    apply,
    applyCalibration,
    destroy,
    exportToFile,
    importFromInput,
    init,
    isSnappingEnabled: () => element('enableSnapCheck')?.checked ?? true,
    load,
    saveNow,
    scheduleSave,
    snapshot,
  };
}
