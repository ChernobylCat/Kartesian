import { APP_CONFIG } from '../config.mjs';
import { isPlainObject, parseDocumentJson, toFiniteNumber } from './document-schema.mjs';

export function normalizeSettings(rawSettings) {
  if (!isPlainObject(rawSettings)) throw new Error('Berkas pengaturan harus berupa objek JSON.');
  const settings = {};

  if (rawSettings.schemaVersion !== undefined && rawSettings.schemaVersion !== APP_CONFIG.SETTINGS_SCHEMA_VERSION) {
    throw new Error(`Versi pengaturan ${rawSettings.schemaVersion} tidak didukung.`);
  }
  settings.schemaVersion = APP_CONFIG.SETTINGS_SCHEMA_VERSION;

  if (rawSettings.jsonInput !== undefined) {
    if (typeof rawSettings.jsonInput !== 'string') throw new Error('jsonInput harus berupa string.');
    parseDocumentJson(rawSettings.jsonInput);
    settings.jsonInput = rawSettings.jsonInput;
  }

  if (rawSettings.overlayDoc !== undefined) {
    if (!['none', 'doc_1', 'uploaded_pdf'].includes(rawSettings.overlayDoc)) {
      throw new Error('Pilihan dokumen overlay tidak valid.');
    }
    settings.overlayDoc = rawSettings.overlayDoc;
  }

  ['overlayToggle', 'hideCalCheck', 'hideCalPreviewCheck', 'printOverlayCheck', 'enableSnapCheck'].forEach(key => {
    if (rawSettings[key] !== undefined) {
      if (typeof rawSettings[key] !== 'boolean') throw new Error(`${key} harus berupa boolean.`);
      settings[key] = rawSettings[key];
    }
  });

  if (rawSettings.overlayOpacity !== undefined) {
    const opacity = toFiniteNumber(rawSettings.overlayOpacity, 'overlayOpacity');
    settings.overlayOpacity = String(Math.min(100, Math.max(5, opacity)));
  }
  ['offsetX', 'offsetY'].forEach(key => {
    if (rawSettings[key] !== undefined) {
      const offset = toFiniteNumber(rawSettings[key], key);
      settings[key] = String(Math.min(50, Math.max(-50, offset)));
    }
  });

  return settings;
}
