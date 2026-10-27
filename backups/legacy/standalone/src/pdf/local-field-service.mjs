import { APP_CONFIG } from '../config.mjs';
import {
  deduplicateCandidates,
  normalizePlaceholderKey,
  scanPdfDocument,
} from './field-detector.mjs';

const SERVICE_SOURCES = new Set([
  'pymupdf-acroform',
  'pymupdf-table',
  'pymupdf-text',
  'pymupdf-vector',
  'paddleocr',
]);

export const PDF_FIELD_SCAN_MODES = Object.freeze(['auto', 'pdfjs', 'pymupdf', 'paddleocr']);

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeServiceCandidate(candidate, index) {
  if (!candidate || typeof candidate !== 'object') return null;
  const pageNumber = Number.parseInt(candidate.pageNumber, 10);
  const x = finiteNumber(candidate.x);
  const y = finiteNumber(candidate.y);
  const width = finiteNumber(candidate.width);
  const height = finiteNumber(candidate.height);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || [x, y, width, height].includes(null))
    return null;
  if (
    width <= 0 ||
    height <= 0 ||
    x >= APP_CONFIG.PAPER_WIDTH_MM ||
    y >= APP_CONFIG.PAPER_HEIGHT_MM
  )
    return null;

  const label = String(candidate.label || '')
    .trim()
    .slice(0, 120);
  if (!label) return null;
  const source = SERVICE_SOURCES.has(candidate.source) ? candidate.source : 'pymupdf-vector';
  const key = normalizePlaceholderKey(candidate.key || label, `field_${pageNumber}_${index + 1}`);
  const safeX = clamp(x, 0, APP_CONFIG.PAPER_WIDTH_MM - 1);
  const safeY = clamp(y, 0, APP_CONFIG.PAPER_HEIGHT_MM - 1);
  return {
    id: String(candidate.id || `pdf-field-p${pageNumber}-${source}-${index + 1}-${key}`),
    pageNumber,
    source,
    label,
    key,
    placeholder: `{{${key}}}`,
    x: Math.round(safeX * 10) / 10,
    y: Math.round(safeY * 10) / 10,
    width: Math.round(clamp(width, 1, APP_CONFIG.PAPER_WIDTH_MM - safeX) * 10) / 10,
    height: Math.round(clamp(height, 1, APP_CONFIG.PAPER_HEIGHT_MM - safeY) * 10) / 10,
    confidence: Math.round(clamp(finiteNumber(candidate.confidence) ?? 0.5, 0, 1) * 100) / 100,
  };
}

export function unresolvedPdfPages(pageCount, candidates = []) {
  const resolved = new Set(
    candidates.map((candidate) => Number.parseInt(candidate.pageNumber, 10)),
  );
  return Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (page) => !resolved.has(page),
  );
}

export function normalizeServiceCandidates(candidates, requestedPages = []) {
  const requested = new Set(requestedPages);
  return (Array.isArray(candidates) ? candidates : [])
    .map(normalizeServiceCandidate)
    .filter((candidate) => candidate && (!requested.size || requested.has(candidate.pageNumber)));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function scanWithLocalFieldService(
  pdfBytes,
  {
    pages = [],
    ocrMode = 'auto',
    serviceMode = 'hybrid',
    endpoint = globalThis.__KARTESIAN_FIELD_SERVICE_URL || APP_CONFIG.LOCAL_FIELD_SERVICE_URL,
    fetchImpl = globalThis.fetch,
    scanTimeoutMs = APP_CONFIG.LOCAL_FIELD_SERVICE_SCAN_TIMEOUT_MS,
  } = {},
) {
  if (!endpoint || typeof fetchImpl !== 'function' || !pages.length) {
    return { candidates: [], available: false, engines: [], warnings: [] };
  }

  const baseUrl = endpoint.replace(/\/+$/, '');
  try {
    const query = new URLSearchParams({ pages: pages.join(','), ocr: ocrMode, mode: serviceMode });
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/v1/detect?${query}`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfBytes,
      },
      scanTimeoutMs,
    );
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error || `detector HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      candidates: normalizeServiceCandidates(payload.candidates, pages),
      available: true,
      engines: Array.isArray(payload.engines) ? payload.engines.map(String) : [],
      warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
    };
  } catch (error) {
    return {
      candidates: [],
      available: false,
      engines: [],
      warnings: [
        error?.name === 'AbortError'
          ? 'Service detector lokal timeout.'
          : `Service detector lokal tidak tersedia: ${error.message}`,
      ],
    };
  }
}

export async function getLocalFieldServiceHealth({
  endpoint = globalThis.__KARTESIAN_FIELD_SERVICE_URL || APP_CONFIG.LOCAL_FIELD_SERVICE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = APP_CONFIG.LOCAL_FIELD_SERVICE_HEALTH_TIMEOUT_MS,
} = {}) {
  if (!endpoint || typeof fetchImpl !== 'function') {
    return { available: false, pymupdf: false, paddleocr: false };
  }
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${endpoint.replace(/\/+$/, '')}/health`,
      {
        method: 'GET',
        cache: 'no-store',
      },
      timeoutMs,
    );
    const payload = await response.json().catch(() => ({}));
    return {
      available: response.ok && payload.pymupdf === true,
      pymupdf: payload.pymupdf === true,
      paddleocr: payload.paddleocr === true,
    };
  } catch (error) {
    return {
      available: false,
      pymupdf: false,
      paddleocr: false,
      error: error?.name === 'AbortError' ? 'Service timeout.' : error.message,
    };
  }
}

export async function scanPdfWithFallbacks(
  pdf,
  pdfBytes,
  {
    ops = {},
    nextFrame = () => Promise.resolve(),
    onProgress = () => {},
    onFallback = () => {},
    fetchImpl = globalThis.fetch,
    endpoint = globalThis.__KARTESIAN_FIELD_SERVICE_URL || APP_CONFIG.LOCAL_FIELD_SERVICE_URL,
  } = {},
) {
  const browserCandidates = await scanPdfDocument(pdf, { ops, nextFrame, onProgress });
  const pages = unresolvedPdfPages(pdf.numPages, browserCandidates);
  if (!pages.length) {
    return { candidates: browserCandidates, engines: ['pdfjs'], warnings: [], fallbackPages: [] };
  }

  onFallback({ pages });
  const localResult = await scanWithLocalFieldService(pdfBytes, { pages, endpoint, fetchImpl });
  return {
    candidates: deduplicateCandidates([...browserCandidates, ...localResult.candidates]),
    engines: ['pdfjs', ...localResult.engines],
    warnings: localResult.warnings,
    fallbackPages: pages,
    localServiceAvailable: localResult.available,
  };
}

export async function scanPdfWithMode(
  pdf,
  pdfBytes,
  {
    mode = 'auto',
    ops = {},
    nextFrame = () => Promise.resolve(),
    onProgress = () => {},
    onFallback = () => {},
    fetchImpl = globalThis.fetch,
    endpoint = globalThis.__KARTESIAN_FIELD_SERVICE_URL || APP_CONFIG.LOCAL_FIELD_SERVICE_URL,
  } = {},
) {
  if (!PDF_FIELD_SCAN_MODES.includes(mode))
    throw new RangeError(`Mode scan PDF tidak didukung: ${mode}`);
  if (mode === 'auto') {
    return scanPdfWithFallbacks(pdf, pdfBytes, {
      ops,
      nextFrame,
      onProgress,
      onFallback,
      fetchImpl,
      endpoint,
    });
  }
  if (mode === 'pdfjs') {
    return {
      candidates: await scanPdfDocument(pdf, { ops, nextFrame, onProgress }),
      engines: ['pdfjs'],
      warnings: [],
      localServiceAvailable: null,
    };
  }

  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  onFallback({ pages, forced: true, mode });
  const localResult = await scanWithLocalFieldService(pdfBytes, {
    pages,
    endpoint,
    fetchImpl,
    ocrMode: mode === 'paddleocr' ? 'always' : 'never',
    serviceMode: mode === 'paddleocr' ? 'ocr' : 'pymupdf',
  });
  return {
    candidates: localResult.candidates,
    engines: localResult.engines,
    warnings: localResult.warnings,
    fallbackPages: pages,
    localServiceAvailable: localResult.available,
  };
}
