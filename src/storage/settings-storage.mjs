import { APP_CONFIG } from '../config.mjs';
import { normalizeSettings } from '../core/settings-schema.mjs';

export function loadSettings(storage = localStorage) {
  const serialized = storage.getItem(APP_CONFIG.SETTINGS_KEY);
  if (!serialized) return null;
  return normalizeSettings(JSON.parse(serialized));
}

export function saveSettings(settings, storage = localStorage) {
  storage.setItem(APP_CONFIG.SETTINGS_KEY, JSON.stringify(settings));
  return true;
}
