export const APP_CONFIG = Object.freeze({
  PAPER_WIDTH_MM: 210,
  PAPER_HEIGHT_MM: 330,
  DOC_1_PAGE_COUNT: 9,

  PDF_RENDER_SCALE: 1.5,
  PDF_RENDER_FORMAT: 'image/jpeg',
  PDF_RENDER_QUALITY: 0.82,

  MIN_FONT_SIZE_PT: 4,
  MAX_FONT_SIZE_PT: 72,
  DEFAULT_FONT_SIZE_PT: 10,
  MIN_IMAGE_SIZE_PX: 10,

  MAX_IMAGE_FILE_SIZE_BYTES: 2 * 1024 * 1024,
  MAX_SETTINGS_FILE_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_PDF_FILE_SIZE_BYTES: 25 * 1024 * 1024,
  MAX_PDF_PAGES: 50,
  MAX_PDF_CANVAS_PIXELS: 20_000_000,
  MAX_DEBTORS: 100,
  MAX_PAGES_PER_DEBTOR: 100,
  MAX_ITEMS_PER_PAGE: 1000,
  MAX_TOTAL_ITEMS: 5000,

  DEBOUNCE_DELAY_MS: 300,
  SAVE_DEBOUNCE_MS: 500,

  DB_NAME: 'OverlayPrintProDB',
  DB_VERSION: 1,
  STORE_NAME: 'pdf_overlays',

  SETTINGS_KEY: 'overlay_print_pro_settings',
  SETTINGS_SCHEMA_VERSION: 1
});

export const ALLOWED_FONT_FAMILIES = new Set([
  'Courier New, Courier, monospace',
  'Arial, sans-serif',
  'Times New Roman, Times, serif',
  'Georgia, serif',
  'Verdana, sans-serif',
  'Plus Jakarta Sans, sans-serif'
]);
