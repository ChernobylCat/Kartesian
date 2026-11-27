import { z } from 'zod';
import { defaultSettings, type Settings } from '@/domain/document/model';
import { numericInput } from '@/domain/document/schema';

/** localStorage keys written by the pre-IndexedDB editor. */
export const LEGACY_SETTINGS_KEY = 'overlay_print_pro_settings';
export const LEGACY_THEME_KEY = 'theme_preference';

export const settingsSchema = z.object({
  offsetX: z.number().finite().min(-50).max(50),
  offsetY: z.number().finite().min(-50).max(50),
  overlay: z.enum(['none', 'doc_1', 'uploaded_pdf']),
  overlayVisible: z.boolean(),
  overlayOpacity: z.number().min(5).max(100),
  printOverlay: z.boolean(),
  hideCalibration: z.boolean(),
  hideCalibrationPreview: z.boolean(),
  snap: z.boolean(),
  dark: z.boolean(),
});
const legacySettings = z
  .object({
    schemaVersion: z.literal(1).optional(),
    jsonInput: z.string().optional(),
    overlayDoc: z.enum(['none', 'doc_1', 'uploaded_pdf']).optional(),
    offsetX: numericInput.optional(),
    offsetY: numericInput.optional(),
    overlayOpacity: numericInput.optional(),
    overlayToggle: z.boolean().optional(),
    printOverlayCheck: z.boolean().optional(),
    hideCalCheck: z.boolean().optional(),
    hideCalPreviewCheck: z.boolean().optional(),
    enableSnapCheck: z.boolean().optional(),
  })
  .passthrough();
export function readLegacySettings(raw: unknown, dark = false) {
  const value = legacySettings.parse(raw);
  const bounded = (n: number | undefined, fallback: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n ?? fallback));
  return {
    jsonInput: value.jsonInput,
    settings: {
      ...defaultSettings,
      dark,
      offsetX: bounded(value.offsetX, 0, -50, 50),
      offsetY: bounded(value.offsetY, 0, -50, 50),
      overlay: value.overlayDoc ?? defaultSettings.overlay,
      overlayVisible: value.overlayToggle ?? true,
      overlayOpacity: bounded(value.overlayOpacity, 50, 5, 100),
      printOverlay: value.printOverlayCheck ?? false,
      hideCalibration: value.hideCalCheck ?? false,
      hideCalibrationPreview: value.hideCalPreviewCheck ?? false,
      snap: value.enableSnapCheck ?? true,
    } satisfies Settings,
  };
}
export function writeLegacySettings(jsonInput: string, settings: Settings) {
  return {
    schemaVersion: 1,
    jsonInput,
    overlayDoc: settings.overlay,
    overlayToggle: settings.overlayVisible,
    overlayOpacity: String(settings.overlayOpacity),
    offsetX: String(settings.offsetX),
    offsetY: String(settings.offsetY),
    hideCalCheck: settings.hideCalibration,
    hideCalPreviewCheck: settings.hideCalibrationPreview,
    printOverlayCheck: settings.printOverlay,
    enableSnapCheck: settings.snap,
  };
}
