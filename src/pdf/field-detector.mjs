import { APP_CONFIG } from '../config.mjs';

const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 1, 0, 0]);
const SOURCE_PRIORITY = Object.freeze({
  acroform: 10,
  'pymupdf-acroform': 9,
  'table-cell': 8,
  'pymupdf-table': 7,
  'vector-box': 6,
  'text-underline': 5,
  'pymupdf-text': 4,
  'pymupdf-vector': 3,
  'vector-line': 2,
  paddleocr: 1
});
const SEMANTIC_SIGNATURE_LABEL = /\b(?:tanda\s*tangan|paraf|debitur|kreditur|pemberi\s+kuasa|penerima\s+kuasa|suami|istri|tempat\s*\/?\s*tanggal|materai)\b/i;

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function copyMatrix(matrix) {
  return Array.isArray(matrix) || ArrayBuffer.isView(matrix)
    ? Array.from(matrix).slice(0, 6)
    : [...IDENTITY_MATRIX];
}

export function multiplyTransform(first, second) {
  const a = copyMatrix(first);
  const b = copyMatrix(second);
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function transformPoint(matrix, x, y) {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5]
  ];
}

function normalizeViewportRect(points, viewport, {
  paperWidthMm = APP_CONFIG.PAPER_WIDTH_MM,
  paperHeightMm = APP_CONFIG.PAPER_HEIGHT_MM
} = {}) {
  const viewportPoints = points.map(([x, y]) => viewport.convertToViewportPoint(x, y));
  const xs = viewportPoints.map(point => point[0]);
  const ys = viewportPoints.map(point => point[1]);
  const left = clamp(Math.min(...xs), 0, viewport.width);
  const right = clamp(Math.max(...xs), 0, viewport.width);
  const top = clamp(Math.min(...ys), 0, viewport.height);
  const bottom = clamp(Math.max(...ys), 0, viewport.height);
  return {
    x: round(left / viewport.width * paperWidthMm),
    y: round(top / viewport.height * paperHeightMm),
    width: round((right - left) / viewport.width * paperWidthMm),
    height: round((bottom - top) / viewport.height * paperHeightMm)
  };
}

export function convertPdfRectToCanvas(rect, viewport, options) {
  if (!viewport || !Array.isArray(rect) || rect.length < 4) return null;
  const [x0, y0, x1, y1] = rect.map(Number);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  return normalizeViewportRect([[x0, y0], [x0, y1], [x1, y0], [x1, y1]], viewport, options);
}

export function normalizePlaceholderKey(value, fallback = 'field') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]*[:：._\-–—]+\s*$/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || fallback;
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/[_\.]{2,}/g, '')
    .replace(/[\s:：._\-–—]+$/g, '')
    .replace(/^\s+|\s+$/g, '');
}

function cleanVectorLabel(value) {
  const clean = normalizeLabel(value)
    .replace(/^\s*\d+(?:\.\d+)*(?:[.)])?\s*/, '')
    .replace(/^[\s,.;:'"“”]+/, '')
    .replace(/[\s([/”"']+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/keberatan/i.test(clean) && /jika ada/i.test(clean)) return 'Keberatan (jika ada)';
  if (!clean || clean.length > 72 || !/[a-z]/i.test(clean)) return '';
  if (/^\s*[\[(].*[\])]\s*$/.test(clean)) return '';
  if (clean.split(/\s+/).length > 10) return '';
  if (/^(?:field|pasal|halaman)\b/i.test(clean)) return '';
  if (/^(?:laki-laki|perempuan|pria|wanita|ya|tidak|tujuan pengisian formulir)$/i.test(clean)) return '';
  return clean;
}

function makeCandidate({ pageNumber, source, index, label, rect, confidence }) {
  const fallback = `field_${pageNumber}_${index + 1}`;
  const cleanLabel = normalizeLabel(label) || `Field ${index + 1}`;
  const key = normalizePlaceholderKey(cleanLabel, fallback);
  const width = clamp(rect.width, 5, APP_CONFIG.PAPER_WIDTH_MM - rect.x);
  const height = clamp(rect.height, 4, APP_CONFIG.PAPER_HEIGHT_MM - rect.y);
  return {
    id: `pdf-field-p${pageNumber}-${source}-${index + 1}-${key}`,
    pageNumber,
    source,
    label: cleanLabel,
    key,
    placeholder: `{{${key}}}`,
    x: round(rect.x),
    y: round(rect.y),
    width: round(width),
    height: round(height),
    confidence: round(confidence, 2)
  };
}

export function extractAnnotationCandidates(annotations, viewport, pageNumber) {
  return (annotations || [])
    .filter(annotation => annotation?.subtype === 'Widget' && annotation.fieldType === 'Tx')
    .map((annotation, index) => {
      const rect = convertPdfRectToCanvas(annotation.rect, viewport);
      if (!rect || rect.width < 2 || rect.height < 2) return null;
      const label = annotation.fieldName || annotation.alternativeText || annotation.fieldValue;
      return makeCandidate({ pageNumber, source: 'acroform', index, label, rect, confidence: 0.99 });
    })
    .filter(Boolean);
}

function textItemToCanvasBox(item, viewport, { preserveText = false } = {}) {
  if (!item || typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) return null;
  const transform = item.transform.map(Number);
  if (transform.length < 6 || transform.some(value => !Number.isFinite(value))) return null;
  const x = transform[4];
  const y = transform[5];
  const width = Math.max(Number(item.width) || 0, Math.hypot(transform[0], transform[1]));
  const height = Math.max(Number(item.height) || 0, Math.hypot(transform[2], transform[3]), 1);
  const rect = normalizeViewportRect([[x, y], [x + width, y], [x, y + height], [x + width, y + height]], viewport);
  return { ...rect, text: preserveText ? item.str : item.str.trim() };
}

export function extractTextBoxes(items, viewport) {
  return (items || []).map(item => textItemToCanvasBox(item, viewport)).filter(Boolean)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function mergeTextBoxes(items, viewport) {
  const boxes = extractTextBoxes(items, viewport);
  const lines = [];
  boxes.forEach(box => {
    const centerY = box.y + box.height / 2;
    let line = lines.find(entry => Math.abs(entry.centerY - centerY) <= 2 && box.x - entry.right <= 5);
    if (!line) {
      line = { boxes: [], centerY, right: box.x + box.width };
      lines.push(line);
    }
    line.boxes.push(box);
    line.right = Math.max(line.right, box.x + box.width);
    line.centerY = line.boxes.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / line.boxes.length;
  });
  return lines.map(line => {
    line.boxes.sort((a, b) => a.x - b.x);
    const left = Math.min(...line.boxes.map(box => box.x));
    const top = Math.min(...line.boxes.map(box => box.y));
    const right = Math.max(...line.boxes.map(box => box.x + box.width));
    const bottom = Math.max(...line.boxes.map(box => box.y + box.height));
    return {
      text: line.boxes.map(box => box.text).join(' ').replace(/\s+/g, ' ').trim(),
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    };
  });
}

function getPathBounds(args, matrix, viewport) {
  const rawBounds = args?.[2];
  if (!rawBounds || rawBounds.length < 4) return null;
  const [x0, y0, x1, y1] = Array.from(rawBounds, Number);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  const corners = [
    transformPoint(matrix, x0, y0), transformPoint(matrix, x0, y1),
    transformPoint(matrix, x1, y0), transformPoint(matrix, x1, y1)
  ];
  return normalizeViewportRect(corners, viewport);
}

export function extractVectorShapes(operatorList, viewport, ops = {}) {
  if (!operatorList?.fnArray || !operatorList?.argsArray || !viewport) return [];
  const stack = [];
  let matrix = [...IDENTITY_MATRIX];
  const shapes = [];
  operatorList.fnArray.forEach((fn, index) => {
    const args = operatorList.argsArray[index];
    if (fn === ops.save) stack.push([...matrix]);
    else if (fn === ops.restore) matrix = stack.pop() || [...IDENTITY_MATRIX];
    else if (fn === ops.transform && args?.length >= 6) matrix = multiplyTransform(matrix, args);
    else if (fn === ops.constructPath) {
      const rect = getPathBounds(args, matrix, viewport);
      if (!rect) return;
      const horizontal = rect.width >= 15 && rect.height <= 1.5;
      const vertical = rect.height >= 8 && rect.width <= 1.5;
      const box = rect.width >= 15 && rect.width <= 190 && rect.height >= 4 && rect.height <= 55;
      const duplicate = shapes.some(shape =>
        Math.abs(shape.x - rect.x) <= 0.2 && Math.abs(shape.y - rect.y) <= 0.2 &&
        Math.abs(shape.width - rect.width) <= 0.2 && Math.abs(shape.height - rect.height) <= 0.2
      );
      if ((horizontal || vertical || box) && !duplicate) shapes.push({ ...rect, horizontal, vertical, box });
    }
  });
  return shapes;
}

function verticalOverlapRatio(first, second) {
  const overlap = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return overlap / Math.max(1, Math.min(first.height, second.height));
}

function deduplicateRects(rects, tolerance = 0.6) {
  const unique = [];
  rects.forEach(rect => {
    const duplicate = unique.some(existing =>
      Math.abs(existing.x - rect.x) <= tolerance && Math.abs(existing.y - rect.y) <= tolerance &&
      Math.abs(existing.width - rect.width) <= tolerance && Math.abs(existing.height - rect.height) <= tolerance
    );
    if (!duplicate) unique.push(rect);
  });
  return unique;
}

function deriveTableCells(shapes) {
  const segmentGroups = [];
  shapes.filter(shape => shape.horizontal && shape.width >= 15).forEach(shape => {
    let group = segmentGroups.find(entry =>
      Math.abs(entry.x - shape.x) <= 0.8 && Math.abs(entry.width - shape.width) <= 1
    );
    if (!group) {
      group = { x: shape.x, width: shape.width, segments: [] };
      segmentGroups.push(group);
    }
    if (!group.segments.some(segment => Math.abs(segment.y - shape.y) <= 0.5)) group.segments.push(shape);
  });

  const derived = [];
  segmentGroups.forEach(group => {
    group.segments.sort((a, b) => a.y - b.y);
    for (let index = 0; index < group.segments.length - 1; index++) {
      const top = group.segments[index];
      const bottom = group.segments[index + 1];
      const height = bottom.y - top.y;
      if (height >= 3 && height <= 15) {
        derived.push({ x: group.x, y: top.y + top.height, width: group.width, height: Math.max(3, height - top.height) });
      }
    }
  });

  return deduplicateRects([
    ...derived,
    ...shapes.filter(shape => shape.box).map(({ x, y, width, height }) => ({ x, y, width, height }))
  ]);
}

function textInsideRect(rect, textBoxes) {
  return textBoxes.filter(text => {
    const centerX = text.x + text.width / 2;
    const centerY = text.y + text.height / 2;
    return centerX >= rect.x - 1 && centerX <= rect.x + rect.width + 1 &&
      centerY >= rect.y - 1 && centerY <= rect.y + rect.height + 1;
  }).sort((a, b) => a.y - b.y || a.x - b.x)
    .map(text => text.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTableLabel(value) {
  const label = cleanVectorLabel(value);
  if (!label || label.length > 48 || label.split(/\s+/).length > 7) return '';
  if (/^(?:no|nomor urut|keterangan|uraian|rincian|jumlah|total)$/i.test(label)) return '';
  return label;
}

function tableColumnKey(pair) {
  const quantize = value => Math.round(value / 2);
  return [pair.labelCell.x, pair.labelCell.width, pair.valueCell.x, pair.valueCell.width]
    .map(quantize)
    .join(':');
}

export function extractTableCandidates({ operatorList, textContent, viewport, ops, pageNumber }) {
  const shapes = extractVectorShapes(operatorList, viewport, ops);
  const cells = deriveTableCells(shapes);
  const textBoxes = extractTextBoxes(textContent?.items, viewport);
  const cellsWithText = cells.map(cell => ({ ...cell, text: textInsideRect(cell, textBoxes) }));
  const pairs = [];

  cellsWithText.forEach(valueCell => {
    if (valueCell.width < 20 || valueCell.height < 3) return;
    const labelOptions = cellsWithText.filter(labelCell => {
      const gap = valueCell.x - (labelCell.x + labelCell.width);
      return labelCell !== valueCell && labelCell.x < valueCell.x && gap >= -0.8 && gap <= 12 &&
        verticalOverlapRatio(labelCell, valueCell) >= 0.72 && cleanTableLabel(labelCell.text);
    }).sort((a, b) => (b.x + b.width) - (a.x + a.width));
    const labelCell = labelOptions[0];
    if (!labelCell) return;

    const numberedSibling = cellsWithText.some(sibling => {
      const gap = labelCell.x - (sibling.x + sibling.width);
      return sibling !== labelCell && sibling.width <= 18 && sibling.x < labelCell.x && gap >= -0.8 && gap <= 8 &&
        verticalOverlapRatio(sibling, labelCell) >= 0.72 && /^\s*\d+[.)]?\s*$/.test(sibling.text);
    }) || textBoxes.some(text => {
      const gap = labelCell.x - (text.x + text.width);
      return text.x < labelCell.x && gap >= -0.8 && gap <= 8 && verticalOverlapRatio(text, labelCell) >= 0.72 &&
        /^\s*\d+[.)]?\s*$/.test(text.text);
    });
    if (numberedSibling) return;

    pairs.push({
      label: cleanTableLabel(labelCell.text),
      labelCell,
      valueCell,
      valueText: valueCell.text
    });
  });

  const groupCounts = new Map();
  pairs.forEach(pair => {
    const key = tableColumnKey(pair);
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  });

  return pairs.filter(pair => !pair.valueText && groupCounts.get(tableColumnKey(pair)) >= 2)
    .map((pair, index) => makeCandidate({
      pageNumber,
      source: 'table-cell',
      index,
      label: pair.label,
      rect: {
        x: pair.valueCell.x + 1,
        y: pair.valueCell.y + 0.6,
        width: Math.max(5, pair.valueCell.width - 2),
        height: Math.max(4, pair.valueCell.height - 1.2)
      },
      confidence: 0.88
    }));
}

function horizontalOverlapRatio(first, second) {
  const overlap = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  return overlap / Math.max(1, Math.min(first.width, second.width));
}

function hasTextOnBorder(shape, textBoxes) {
  if (!shape.horizontal) return false;
  const lineY = shape.y + shape.height / 2;
  const overlap = textBoxes.reduce((total, text) => {
    const textBottom = text.y + text.height;
    if (lineY - textBottom < -1.5 || lineY - textBottom > 3.5) return total;
    return total + Math.max(0, Math.min(shape.x + shape.width, text.x + text.width) - Math.max(shape.x, text.x));
  }, 0);
  return overlap >= Math.max(8, shape.width * 0.22);
}

function intersectsTableGrid(shape, shapes, textBoxes) {
  if (shape.horizontal) {
    const y = shape.y + shape.height / 2;
    const intersections = shapes.filter(other => other.vertical &&
      other.x >= shape.x - 1 && other.x <= shape.x + shape.width + 1 &&
      y >= other.y - 1 && y <= other.y + other.height + 1);
    if (intersections.length >= 2) return true;
    const densePage = shapes.length >= 30;
    const stackedPeers = shapes.filter(other => other !== shape && other.horizontal &&
      Math.abs(other.y - shape.y) >= 1.5 && Math.abs(other.y - shape.y) <= 35 &&
      horizontalOverlapRatio(shape, other) >= 0.78 &&
      Math.abs(other.x - shape.x) <= 3 && Math.abs(other.width - shape.width) <= 6);
    if (densePage && (stackedPeers.length >= 3 || hasTextOnBorder(shape, textBoxes))) return true;
  }
  if (shape.box) {
    const peers = shapes.filter(other => other !== shape && other.box &&
      Math.abs(other.y - shape.y) <= 1.5 && Math.abs(other.height - shape.height) <= 2);
    if (peers.length >= (shapes.length >= 20 ? 1 : 2)) return true;
  }
  return false;
}

function findNearestLabel(shape, textBoxes) {
  const centerY = shape.y + shape.height / 2;
  const candidates = [];
  textBoxes.forEach(text => {
    const cleanText = cleanVectorLabel(text.text);
    if (!cleanText) return;
    const candidateText = { ...text, text: cleanText };
    const textRight = text.x + text.width;
    const textBottom = text.y + text.height;
    const textCenterY = text.y + text.height / 2;
    const leftGap = shape.x - textRight;
    if (leftGap >= -2 && leftGap <= 30 && Math.abs(textCenterY - centerY) <= 7) {
      candidates.push({ text: candidateText, score: Math.abs(textCenterY - centerY) + Math.max(0, leftGap) * 0.15, mode: 'left' });
    }
    const aboveGap = shape.y - textBottom;
    const horizontalDistance = Math.abs(text.x - shape.x);
    if (aboveGap >= -1 && aboveGap <= 10 && horizontalDistance <= 25) {
      candidates.push({ text: candidateText, score: 4 + Math.max(0, aboveGap) + horizontalDistance * 0.1, mode: 'above' });
    }
    const textCenterX = text.x + text.width / 2;
    const shapeCenterX = shape.x + shape.width / 2;
    if (shape.width <= 90 && SEMANTIC_SIGNATURE_LABEL.test(cleanText) && aboveGap > 10 && aboveGap <= 50 &&
      Math.abs(textCenterX - shapeCenterX) <= Math.max(18, shape.width * 0.45)) {
      candidates.push({
        text: candidateText,
        score: 25 + aboveGap * 0.25 + Math.abs(textCenterX - shapeCenterX) * 0.1,
        mode: 'signature-above'
      });
    }
  });
  return candidates.sort((a, b) => a.score - b.score)[0] || null;
}

function findInteriorLabel(shape, textBoxes) {
  if (!shape.box) return '';
  return textBoxes.map(text => ({ text, clean: cleanVectorLabel(text.text) }))
    .filter(({ text, clean }) => clean && SEMANTIC_SIGNATURE_LABEL.test(clean) &&
      text.x >= shape.x - 2 && text.x + text.width <= shape.x + shape.width + 2 &&
      text.y >= shape.y - 2 && text.y + text.height <= shape.y + shape.height + 2)
    .sort((a, b) => a.text.y - b.text.y)[0]?.clean || '';
}

function findBoxInstructionLabel(shape, textBoxes) {
  if (!shape.box) return '';
  const nearby = textBoxes.filter(text => {
    const gap = shape.y - (text.y + text.height);
    return gap >= 0 && gap <= 15 && horizontalOverlapRatio(shape, text) >= 0.35;
  }).sort((a, b) => a.y - b.y).slice(-2);
  const combined = cleanVectorLabel(nearby.map(text => text.text).join(' '));
  return combined === 'Keberatan (jika ada)' ? combined : '';
}

export function extractTextCandidates({ textContent, viewport, pageNumber }) {
  const textBoxes = mergeTextBoxes(textContent?.items, viewport);
  const candidates = [];
  (textContent?.items || []).forEach((item, itemIndex) => {
    const rawText = typeof item?.str === 'string' ? item.str : '';
    const box = textItemToCanvasBox(item, viewport, { preserveText: true });
    if (!box || !rawText) return;
    for (const match of rawText.matchAll(/[_\uFF3F\uFE4F]{2,}(?:\s*[\/.-]\s*[_\uFF3F\uFE4F]{2,})*/g)) {
      const startRatio = match.index / Math.max(1, rawText.length);
      const widthRatio = match[0].length / Math.max(1, rawText.length);
      const rect = {
        x: box.x + box.width * startRatio,
        y: box.y,
        width: Math.max(5, box.width * widthRatio),
        height: Math.max(4, box.height)
      };
      const inlineLabel = cleanVectorLabel(rawText.slice(0, match.index).split(/[_\uFF3F\uFE4F]{2,}|\s{2,}|[|]/).pop());
      const nearest = inlineLabel ? null : findNearestLabel(rect, textBoxes);
      const label = inlineLabel || nearest?.text.text;
      if (!label) continue;
      candidates.push(makeCandidate({
        pageNumber,
        source: 'text-underline',
        index: itemIndex + candidates.length,
        label,
        rect,
        confidence: SEMANTIC_SIGNATURE_LABEL.test(label) ? 0.76 : 0.72
      }));
    }
  });
  return candidates;
}

export function extractVectorCandidates({ operatorList, textContent, viewport, ops, pageNumber }) {
  const shapes = extractVectorShapes(operatorList, viewport, ops);
  const textBoxes = mergeTextBoxes(textContent?.items, viewport);
  return shapes
    .filter(shape => (shape.horizontal || shape.box) && !intersectsTableGrid(shape, shapes, textBoxes))
    .map((shape, index) => {
      const interiorLabel = findInteriorLabel(shape, textBoxes);
      const instructionLabel = interiorLabel ? '' : findBoxInstructionLabel(shape, textBoxes);
      const match = interiorLabel || instructionLabel ? null : findNearestLabel(shape, textBoxes);
      const label = interiorLabel || instructionLabel || match?.text.text;
      if (!label) return null;
      const matchInsideBox = shape.box && match &&
        match.text.x >= shape.x - 2 && match.text.x + match.text.width <= shape.x + shape.width + 2 &&
        match.text.y >= shape.y - 2 && match.text.y + match.text.height <= shape.y + shape.height + 2;
      if (matchInsideBox && !SEMANTIC_SIGNATURE_LABEL.test(label)) return null;
      const rect = shape.horizontal
        ? { x: shape.x, y: clamp(shape.y - 4, 0, APP_CONFIG.PAPER_HEIGHT_MM - 4), width: shape.width, height: 5 }
        : shape;
      const colonBonus = /[:：]\s*$/.test(match?.text.text || '') ? 0.05 : 0;
      const signatureMatch = interiorLabel || match?.mode === 'signature-above';
      return makeCandidate({
        pageNumber,
        source: shape.box ? 'vector-box' : 'vector-line',
        index,
        label,
        rect,
        confidence: signatureMatch ? 0.7 : instructionLabel ? 0.72 : Math.min(0.92, (shape.box ? 0.78 : 0.82) + colonBonus)
      });
    })
    .filter(Boolean);
}

function overlapRatio(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(first.width * first.height, second.width * second.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

export function deduplicateCandidates(candidates) {
  const sorted = [...(candidates || [])].sort((a, b) =>
    (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0) || b.confidence - a.confidence
  );
  const unique = [];
  sorted.forEach(candidate => {
    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;
    const duplicate = unique.some(existing => existing.pageNumber === candidate.pageNumber && (
      overlapRatio(existing, candidate) >= 0.55 ||
      (Math.abs(existing.x + existing.width / 2 - centerX) <= 2 && Math.abs(existing.y + existing.height / 2 - centerY) <= 2)
    ));
    if (!duplicate) unique.push(candidate);
  });
  return unique.sort((a, b) => a.pageNumber - b.pageNumber || a.y - b.y || a.x - b.x);
}

export async function scanPdfPage(page, pageNumber, { ops = {} } = {}) {
  const viewport = page.getViewport({ scale: 1 });
  const [annotationResult, textResult, operatorResult] = await Promise.allSettled([
    page.getAnnotations({ intent: 'display' }),
    page.getTextContent(),
    page.getOperatorList()
  ]);
  const annotations = annotationResult.status === 'fulfilled' ? annotationResult.value : [];
  const textContent = textResult.status === 'fulfilled' ? textResult.value : { items: [] };
  const operatorList = operatorResult.status === 'fulfilled' ? operatorResult.value : { fnArray: [], argsArray: [] };
  const annotationCandidates = extractAnnotationCandidates(annotations, viewport, pageNumber);
  const textCandidates = extractTextCandidates({ textContent, viewport, pageNumber });
  const tableCandidates = extractTableCandidates({ operatorList, textContent, viewport, ops, pageNumber });
  const vectorCandidates = extractVectorCandidates({ operatorList, textContent, viewport, ops, pageNumber });
  if (annotationCandidates.length) {
    return deduplicateCandidates([
      ...annotationCandidates,
      ...tableCandidates,
      ...textCandidates,
      ...vectorCandidates.filter(candidate => candidate.source !== 'vector-box')
    ]);
  }
  return deduplicateCandidates([
    ...tableCandidates,
    ...textCandidates,
    ...vectorCandidates
  ]);
}

export async function scanPdfDocument(pdf, {
  ops = {},
  nextFrame = () => Promise.resolve(),
  onProgress = () => {}
} = {}) {
  const candidates = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    onProgress({ pageNumber, totalPages: pdf.numPages, percent: Math.round(pageNumber / pdf.numPages * 100) });
    await nextFrame();
    const page = await pdf.getPage(pageNumber);
    candidates.push(...await scanPdfPage(page, pageNumber, { ops }));
  }
  return deduplicateCandidates(candidates);
}

function ensurePage(debtor, pageNumber) {
  if (!Array.isArray(debtor.pages)) debtor.pages = [];
  while (debtor.pages.length < pageNumber) {
    debtor.pages.push({ page_number: debtor.pages.length + 1, items: [] });
  }
  const page = debtor.pages[pageNumber - 1];
  if (!Array.isArray(page.items)) page.items = [];
  return page;
}

export function applyFieldCandidates(data, candidates) {
  if (!Array.isArray(data) || !Array.isArray(candidates)) throw new TypeError('Data dan kandidat field harus berupa array.');
  const nextData = structuredClone(data);
  let addedCount = 0;
  const appliedCandidateIds = [];
  candidates.forEach(candidate => {
    const pageNumber = Number.parseInt(candidate.pageNumber, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    const key = normalizePlaceholderKey(candidate.key || candidate.label, `field_${pageNumber}`);
    const text = String(candidate.placeholder || `{{${key}}}`).trim() || `{{${key}}}`;
    let candidateApplied = false;
    nextData.forEach(debtor => {
      const page = ensurePage(debtor, pageNumber);
      const duplicate = page.items.some(item => item.type !== 'image' && item.text === text &&
        Math.abs(Number(item.x) - Number(candidate.x)) <= 1 && Math.abs(Number(item.y) - Number(candidate.y)) <= 1);
      if (duplicate) return;
      const x = clamp(Number(candidate.x) || 0, 0, APP_CONFIG.PAPER_WIDTH_MM - 1);
      const y = clamp(Number(candidate.y) || 0, 0, APP_CONFIG.PAPER_HEIGHT_MM - 1);
      const width = clamp(Number(candidate.width) || 30, 1, APP_CONFIG.PAPER_WIDTH_MM - x);
      const height = clamp(Number(candidate.height) || 5, 1, APP_CONFIG.PAPER_HEIGHT_MM - y);
      page.items.push({
        text,
        x: round(x),
        y: round(y),
        width: round(width),
        height: round(height),
        font_family: 'Arial, sans-serif',
        font_size: APP_CONFIG.DEFAULT_FONT_SIZE_PT,
        color: '#111827',
        bold: false
      });
      addedCount++;
      candidateApplied = true;
    });
    if (candidateApplied || nextData.length > 0) appliedCandidateIds.push(candidate.id);
  });
  return { data: nextData, addedCount, appliedCandidateIds };
}
