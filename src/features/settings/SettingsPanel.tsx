'use client';
import { useRef } from 'react';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import { useEditor, useEditorState } from '../editor/context';
import { NumericField } from '../editor/components/PropertyPanel';
import { backupWorkspace, restoreWorkspace } from '@/infrastructure/storage/workspace';
import { writeLegacySettings, readLegacySettings } from '@/infrastructure/serialization/settings';
import { decodeLegacy, encodeLegacy } from '@/domain/document/model';
import { download } from '@/infrastructure/export/html';
import { LIMITS } from '@/domain/document/schema';
import { errorMessage } from '@/application/error-message';
import { useT } from '@/i18n/react';
import { UNITS, type Unit } from '@/domain/document/units';
import { UNIT_KEY } from '../editor/preferences';

export default function SettingsPanel() {
  const t = useT();
  const { store, flush } = useEditor();
  const settings = useEditorState((state) => state.workspace.settings);
  const unit = useEditorState((state) => state.unit);
  const input = useRef<HTMLInputElement>(null);
  async function backup() {
    try {
      // A backup must still be downloadable when quota or persistence fails.
      await flush().catch(() => {});
      download(await backupWorkspace(store.getState().workspace), 'kartesian-workspace.json');
    } catch (error) {
      store.setState({ message: errorMessage(error, t('backup.failed')) });
    }
  }
  async function restore(file: File) {
    try {
      if (file.size > LIMITS.backupBytes) throw new Error(t('import.fileTooLarge'));
      if (store.getState().readonly) throw new Error(t('import.takeOverFirst'));
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;
      if (!confirm(t('import.confirmReplace'))) return;
      if (raw.format === 'kartesian-workspace') {
        const next = await restoreWorkspace(text);
        const state = store.getState();
        state.replace(next.document, next.assets);
        state.settings(next.settings);
        state.pdf(next.pdf);
      } else {
        if (file.size > LIMITS.settingsBytes) throw new Error(t('import.settingsTooLarge'));
        const legacy = readLegacySettings(raw, store.getState().workspace.settings.dark);
        const state = store.getState();
        if (legacy.jsonInput) {
          const decoded = decodeLegacy(
            legacy.jsonInput,
            state.workspace.document,
            state.workspace.assets,
          );
          state.replace(decoded.document, decoded.assets);
        }
        state.settings(legacy.settings);
      }
      await flush();
      store.setState({ message: t('import.restored') });
    } catch (error) {
      store.setState({ message: errorMessage(error, t('import.failed')) });
    }
  }
  return (
    <section className="sidebar-section">
      <details>
        <summary>{t('settings.title')}</summary>
        <div className="stack">
          <div className="field-grid">
            <NumericField
              label="Offset X · mm"
              value={settings.offsetX}
              min={-50}
              max={50}
              change={(offsetX) => store.getState().settings({ offsetX })}
            />
            <NumericField
              label="Offset Y · mm"
              value={settings.offsetY}
              min={-50}
              max={50}
              change={(offsetY) => store.getState().settings({ offsetY })}
            />
          </div>
          <label className="field">
            {t('settings.unit')}
            <select
              value={unit}
              onChange={(event) => {
                const value = event.target.value as Unit;
                store.setState({ unit: value });
                try {
                  localStorage.setItem(UNIT_KEY, value);
                } catch {}
              }}
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {t(`unit.${value}`)} ({value})
                </option>
              ))}
            </select>
          </label>
          <p className="settings-note">{t('settings.unitNote')}</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.snap}
              onChange={(event) => store.getState().settings({ snap: event.target.checked })}
            />
            {t('settings.snap')}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.printOverlay}
              onChange={(event) =>
                store.getState().settings({ printOverlay: event.target.checked })
              }
            />
            {t('settings.printOverlay')}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.hideCalibration}
              onChange={(event) =>
                store.getState().settings({ hideCalibration: event.target.checked })
              }
            />
            {t('settings.hidePrintMarkers')}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.hideCalibrationPreview}
              onChange={(event) =>
                store.getState().settings({ hideCalibrationPreview: event.target.checked })
              }
            />
            {t('settings.hidePreviewMarkers')}
          </label>
          <p className="settings-note">{t('settings.printNote')}</p>
          <button onClick={() => void backup()}>
            <ShieldCheck size={14} />
            {t('settings.fullBackup')}
          </button>
          <button
            onClick={() => {
              const state = store.getState();
              if (state.error) return;
              download(
                JSON.stringify(
                  writeLegacySettings(
                    JSON.stringify(
                      encodeLegacy(state.workspace.document, state.workspace.assets),
                      null,
                      2,
                    ),
                    state.workspace.settings,
                  ),
                  null,
                  2,
                ),
                'kartesian-settings.json',
              );
            }}
          >
            <Download size={14} />
            {t('settings.exportLegacy')}
          </button>
          <button onClick={() => input.current?.click()}>
            <Upload size={14} />
            {t('settings.import')}
          </button>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void restore(file);
            }}
          />
          <p className="settings-note">{t('settings.backupNote')}</p>
        </div>
      </details>
    </section>
  );
}
