import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Candidate } from '@/application/ports';
import type { LegacyDocument } from '@/domain/document/schema';
import { DETECTOR_SPACE } from '@/domain/document/background';
import { DEFAULT_PAPER, type Paper } from '@/domain/document/paper';
import { t } from '@/i18n/core';

// Detection runs in detector space; `applyFieldCandidates` maps results onto the sheet.
const DETECTOR_WIDTH_MM = DETECTOR_SPACE.width;
const DETECTOR_HEIGHT_MM = DETECTOR_SPACE.height;
const DEFAULT_FONT_SIZE_PT = 11;

type Matrix6 = [number, number, number, number, number, number];

const IDENTITY_MATRIX: Matrix6 = [1, 0, 0, 1, 0, 0];
const SOURCE_PRIORITY: Record<string, number> = Object.freeze({
  acroform: 10,
  'pymupdf-acroform': 9,
  'table-cell': 8,
  'pymupdf-table': 7,
  'vector-box': 6,
  'text-underline': 5,
  'pymupdf-text': 4,
  'pymupdf-vector': 3,
  'vector-line': 2,
  paddleocr: 1,
});

const SEMANTIC_SIGNATURE_LABEL =
  /\b(?:tanda\s*tangan|paraf|debitur|kreditur|pemberi\s+kuasa|penerima\s+kuasa|suami|istri|tempat\s*\/?\s*tanggal|materai)\b/i;

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function copyMatrix(matrix: unknown): Matrix6 {
  if (Array.isArray(matrix) || (matrix && ArrayBuffer.isView(matrix))) {
    const arr = Array.from(matrix as ArrayLike<number>);
    return [arr[0] ?? 1, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 1, arr[4] ?? 0, arr[5] ?? 0];
  }
  return [...IDENTITY_MATRIX];
}

export function multiplyTransform(first: unknown, second: unknown): Matrix6 {
  const [a0, a1, a2, a3, a4, a5] = copyMatrix(first);
  const [b0, b1, b2, b3, b4, b5] = copyMatrix(second);
  return [
    a0 * b0 + a2 * b1,
    a1 * b0 + a3 * b1,
    a0 * b2 + a2 * b3,
    a1 * b2 + a3 * b3,
    a0 * b4 + a2 * b5 + a4,
    a1 * b4 + a3 * b5 + a5,
  ];
}

function transformPoint(matrix: Matrix6, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

interface ViewportLike {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => [number, number];
}

interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfAnnotation {
  subtype?: string;
  fieldType?: string;
  rect?: unknown;
  fieldName?: string;
  alternativeText?: string;
  fieldValue?: string;
}

interface TextItemLike {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
}

interface OperatorListLike {
  fnArray?: number[];
  argsArray?: unknown[];
}

interface TextContentLike {
  items?: TextItemLike[];
}

interface PageProxyLike {
  getViewport: (options: { scale: number }) => ViewportLike;
  getAnnotations: (options: { intent: string }) => Promise<PdfAnnotation[]>;
  getTextContent: () => Promise<TextContentLike>;
  getOperatorList: () => Promise<OperatorListLike>;
}

interface DocEntryLike {
  pages?: { page_number: number; items?: unknown[] }[];
}

interface DocumentItemLike {
  type?: unknown;
  text?: unknown;
  x?: unknown;
  y?: unknown;
}

function normalizeViewportRect(
  points: [number, number][],
  viewport: ViewportLike,
  {
    paperWidthMm = DETECTOR_WIDTH_MM,
    paperHeightMm = DETECTOR_HEIGHT_MM,
  }: { paperWidthMm?: number; paperHeightMm?: number } = {},
): CanvasRect {
  const viewportPoints = points.map(([x, y]) => viewport.convertToViewportPoint(x, y));
  const xs = viewportPoints.map((point) => point[0]);
  const ys = viewportPoints.map((point) => point[1]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const left = clamp(minX, 0, viewport.width);
  const right = clamp(maxX, 0, viewport.width);
  const top = clamp(minY, 0, viewport.height);
  const bottom = clamp(maxY, 0, viewport.height);
  return {
    x: round((left / viewport.width) * paperWidthMm),
    y: round((top / viewport.height) * paperHeightMm),
    width: round(((right - left) / viewport.width) * paperWidthMm),
    height: round(((bottom - top) / viewport.height) * paperHeightMm),
  };
}

export function convertPdfRectToCanvas(
  rect: unknown,
  viewport: ViewportLike,
  options?: { paperWidthMm?: number; paperHeightMm?: number },
): CanvasRect | null {
  if (!viewport || !Array.isArray(rect) || rect.length < 4) return null;
  const [rawX0 = 0, rawY0 = 0, rawX1 = 0, rawY1 = 0] = rect.map(Number);
  if (![rawX0, rawY0, rawX1, rawY1].every(Number.isFinite)) return null;
  return normalizeViewportRect(
    [
      [rawX0, rawY0],
      [rawX0, rawY1],
      [rawX1, rawY0],
      [rawX1, rawY1],
    ],
    viewport,
    options,
  );
}

export function normalizePlaceholderKey(value: string, fallback = 'field'): string {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]*[:：._\-–—]+\s*$/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || fallback;
}

function normalizeLabel(value: unknown): string {
  return String(value || '')
    .replace(/[_.]{2,}/g, '')
    .replace(/[\s:：._\-–—]+$/g, '')
    .replace(/^\s+|\s+$/g, '');
}

function cleanVectorLabel(value: unknown): string {
  const clean = normalizeLabel(value)
    .replace(/^\s*\d+(?:\.\d+)*(?:[.)])?\s*/, '')
    .replace(/^[\s,.;:'"“”]+/, '')
    .replace(/[\s([/”"']+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/keberatan/i.test(clean) && /jika ada/i.test(clean)) return 'Keberatan (jika ada)';
  if (!clean || clean.length > 72 || !/[a-z]/i.test(clean)) return '';
  if (/^\s*[[/(].*[\]/)]\s*$/.test(clean)) return '';
  if (clean.split(/\s+/).length > 10) return '';
  if (/^(?:field|pasal|halaman)\b/i.test(clean)) return '';
  if (/^(?:laki-laki|perempuan|pria|wanita|ya|tidak|tujuan pengisian formulir)$/i.test(clean))
    return '';
  return clean;
}

interface MakeCandidateParams {
  pageNumber: number;
  source: string;
  index: number;
  label: unknown;
  rect: CanvasRect;
  confidence: number;
}

function makeCandidate({
  pageNumber,
  source,
  index,
  label,
  rect,
  confidence,
}: MakeCandidateParams): Candidate {
  const fallback = `field_${pageNumber}_${index + 1}`;
  const cleanLabel = normalizeLabel(label) || `Field ${index + 1}`;
  const key = normalizePlaceholderKey(cleanLabel, fallback);
  const width = clamp(rect.width, 5, DETECTOR_WIDTH_MM - rect.x);
  const height = clamp(rect.height, 4, DETECTOR_HEIGHT_MM - rect.y);
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
    confidence: round(confidence, 2),
  };
}

export function extractAnnotationCandidates(
  annotations: unknown[],
  viewport: ViewportLike,
  pageNumber: number,
): Candidate[] {
  return (annotations || [])
    .filter((annotation): annotation is PdfAnnotation => {
      const item = annotation as PdfAnnotation | undefined;
      return item?.subtype === 'Widget' && item.fieldType === 'Tx';
    })
    .map((annotation, index: number) => {
      const rect = convertPdfRectToCanvas(annotation.rect, viewport);
      if (!rect || rect.width < 2 || rect.height < 2) return null;
      const label = annotation.fieldName || annotation.alternativeText || annotation.fieldValue;
      return makeCandidate({
        pageNumber,
        source: 'acroform',
        index,
        label,
        rect,
        confidence: 0.99,
      });
    })
    .filter((c): c is Candidate => c !== null);
}

interface TextBox extends CanvasRect {
  text: string;
}

function textItemToCanvasBox(
  item: TextItemLike | undefined,
  viewport: ViewportLike,
  { preserveText = false } = {},
): TextBox | null {
  if (!item || typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform))
    return null;
  const transform = item.transform.map(Number);
  if (transform.length < 6 || transform.some((value: number) => !Number.isFinite(value)))
    return null;
  const x = transform[4] ?? 0;
  const y = transform[5] ?? 0;
  const t0 = transform[0] ?? 0;
  const t1 = transform[1] ?? 0;
  const t2 = transform[2] ?? 0;
  const t3 = transform[3] ?? 0;
  const width = Math.max(Number(item.width) || 0, Math.hypot(t0, t1));
  const height = Math.max(Number(item.height) || 0, Math.hypot(t2, t3), 1);
  const rect = normalizeViewportRect(
    [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ],
    viewport,
  );
  return { ...rect, text: preserveText ? item.str : item.str.trim() };
}

export function extractTextBoxes(items: unknown[] | undefined, viewport: ViewportLike): TextBox[] {
  return (items || [])
    .map((item) => textItemToCanvasBox(item as TextItemLike, viewport))
    .filter((b): b is TextBox => b !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function mergeTextBoxes(items: unknown[] | undefined, viewport: ViewportLike): TextBox[] {
  const boxes = extractTextBoxes(items, viewport);
  const lines: { boxes: TextBox[]; centerY: number; right: number }[] = [];
  boxes.forEach((box) => {
    const centerY = box.y + box.height / 2;
    let line = lines.find(
      (entry) => Math.abs(entry.centerY - centerY) <= 2 && box.x - entry.right <= 5,
    );
    if (!line) {
      line = { boxes: [], centerY, right: box.x + box.width };
      lines.push(line);
    }
    line.boxes.push(box);
    line.right = Math.max(line.right, box.x + box.width);
    line.centerY =
      line.boxes.reduce((sum, entry) => sum + entry.y + entry.height / 2, 0) / line.boxes.length;
  });
  return lines.map((line) => {
    line.boxes.sort((a, b) => a.x - b.x);
    const xs = line.boxes.map((box) => box.x);
    const ys = line.boxes.map((box) => box.y);
    const rights = line.boxes.map((box) => box.x + box.width);
    const bottoms = line.boxes.map((box) => box.y + box.height);
    const left = xs.length ? Math.min(...xs) : 0;
    const top = ys.length ? Math.min(...ys) : 0;
    const right = rights.length ? Math.max(...rights) : 0;
    const bottom = bottoms.length ? Math.max(...bottoms) : 0;
    return {
      text: line.boxes
        .map((box) => box.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  });
}

function getPathBounds(
  args: unknown[] | undefined,
  matrix: Matrix6,
  viewport: ViewportLike,
): CanvasRect | null {
  const rawBounds = args?.[2] as ArrayLike<number> | undefined;
  if (!rawBounds || rawBounds.length < 4) return null;
  const [rawX0 = 0, rawY0 = 0, rawX1 = 0, rawY1 = 0] = Array.from(rawBounds, Number);
  if (![rawX0, rawY0, rawX1, rawY1].every(Number.isFinite)) return null;
  const corners: [number, number][] = [
    transformPoint(matrix, rawX0, rawY0),
    transformPoint(matrix, rawX0, rawY1),
    transformPoint(matrix, rawX1, rawY0),
    transformPoint(matrix, rawX1, rawY1),
  ];
  return normalizeViewportRect(corners, viewport);
}

interface VectorShape extends CanvasRect {
  horizontal: boolean;
  vertical: boolean;
  box: boolean;
}

export function extractVectorShapes(
  operatorList: OperatorListLike | undefined,
  viewport: ViewportLike,
  ops: Record<string, number> = {},
): VectorShape[] {
  if (!operatorList?.fnArray || !operatorList?.argsArray || !viewport) return [];
  const stack: Matrix6[] = [];
  let matrix: Matrix6 = [...IDENTITY_MATRIX];
  const shapes: VectorShape[] = [];
  operatorList.fnArray.forEach((fn: number, index: number) => {
    const args = operatorList.argsArray?.[index] as unknown[] | undefined;
    if (fn === ops['save']) stack.push([...matrix]);
    else if (fn === ops['restore']) matrix = stack.pop() || [...IDENTITY_MATRIX];
    else if (fn === ops['transform'] && args && args.length >= 6)
      matrix = multiplyTransform(matrix, args);
    else if (fn === ops['constructPath']) {
      const rect = getPathBounds(args, matrix, viewport);
      if (!rect) return;
      const horizontal = rect.width >= 15 && rect.height <= 1.5;
      const vertical = rect.height >= 8 && rect.width <= 1.5;
      const box = rect.width >= 15 && rect.width <= 190 && rect.height >= 4 && rect.height <= 55;
      const duplicate = shapes.some(
        (shape) =>
          Math.abs(shape.x - rect.x) <= 0.2 &&
          Math.abs(shape.y - rect.y) <= 0.2 &&
          Math.abs(shape.width - rect.width) <= 0.2 &&
          Math.abs(shape.height - rect.height) <= 0.2,
      );
      if ((horizontal || vertical || box) && !duplicate)
        shapes.push({ ...rect, horizontal, vertical, box });
    }
  });
  return shapes;
}

function verticalOverlapRatio(first: CanvasRect, second: CanvasRect): number {
  const overlap = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
  );
  return overlap / Math.max(1, Math.min(first.height, second.height));
}

function deduplicateRects(rects: CanvasRect[], tolerance = 0.6): CanvasRect[] {
  const unique: CanvasRect[] = [];
  rects.forEach((rect) => {
    const duplicate = unique.some(
      (existing) =>
        Math.abs(existing.x - rect.x) <= tolerance &&
        Math.abs(existing.y - rect.y) <= tolerance &&
        Math.abs(existing.width - rect.width) <= tolerance &&
        Math.abs(existing.height - rect.height) <= tolerance,
    );
    if (!duplicate) unique.push(rect);
  });
  return unique;
}

function deriveTableCells(shapes: VectorShape[]): CanvasRect[] {
  const segmentGroups: { x: number; width: number; segments: VectorShape[] }[] = [];
  shapes
    .filter((shape) => shape.horizontal && shape.width >= 15)
    .forEach((shape) => {
      let group = segmentGroups.find(
        (entry) => Math.abs(entry.x - shape.x) <= 0.8 && Math.abs(entry.width - shape.width) <= 1,
      );
      if (!group) {
        group = { x: shape.x, width: shape.width, segments: [] };
        segmentGroups.push(group);
      }
      if (!group.segments.some((segment) => Math.abs(segment.y - shape.y) <= 0.5))
        group.segments.push(shape);
    });

  const derived: CanvasRect[] = [];
  segmentGroups.forEach((group) => {
    group.segments.sort((a, b) => a.y - b.y);
    for (let index = 0; index < group.segments.length - 1; index++) {
      const top = group.segments[index];
      const bottom = group.segments[index + 1];
      if (top && bottom) {
        const height = bottom.y - top.y;
        if (height >= 3 && height <= 15) {
          derived.push({
            x: group.x,
            y: top.y + top.height,
            width: group.width,
            height: Math.max(3, height - top.height),
          });
        }
      }
    }
  });

  return deduplicateRects([
    ...derived,
    ...shapes
      .filter((shape) => shape.box)
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
  ]);
}

function textInsideRect(rect: CanvasRect, textBoxes: TextBox[]): string {
  return textBoxes
    .filter((text) => {
      const centerX = text.x + text.width / 2;
      const centerY = text.y + text.height / 2;
      return (
        centerX >= rect.x - 1 &&
        centerX <= rect.x + rect.width + 1 &&
        centerY >= rect.y - 1 &&
        centerY <= rect.y + rect.height + 1
      );
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((text) => text.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTableLabel(value: unknown): string {
  const label = cleanVectorLabel(value);
  if (!label || label.length > 48 || label.split(/\s+/).length > 7) return '';
  if (/^(?:no|nomor urut|keterangan|uraian|rincian|jumlah|total)$/i.test(label)) return '';
  return label;
}

function tableColumnKey(pair: { labelCell: CanvasRect; valueCell: CanvasRect }): string {
  const quantize = (value: number) => Math.round(value / 2);
  return [pair.labelCell.x, pair.labelCell.width, pair.valueCell.x, pair.valueCell.width]
    .map(quantize)
    .join(':');
}

export function extractTableCandidates({
  operatorList,
  textContent,
  viewport,
  ops,
  pageNumber,
}: {
  operatorList?: OperatorListLike;
  textContent?: TextContentLike;
  viewport: ViewportLike;
  ops?: Record<string, number>;
  pageNumber: number;
}): Candidate[] {
  const shapes = extractVectorShapes(operatorList, viewport, ops);
  const cells = deriveTableCells(shapes);
  const textBoxes = extractTextBoxes(textContent?.items, viewport);
  const cellsWithText = cells.map((cell) => ({ ...cell, text: textInsideRect(cell, textBoxes) }));
  const pairs: {
    label: string;
    labelCell: CanvasRect & { text: string };
    valueCell: CanvasRect & { text: string };
    valueText: string;
  }[] = [];

  cellsWithText.forEach((valueCell) => {
    if (valueCell.width < 20 || valueCell.height < 3) return;
    const labelOptions = cellsWithText
      .filter((labelCell) => {
        const gap = valueCell.x - (labelCell.x + labelCell.width);
        return (
          labelCell !== valueCell &&
          labelCell.x < valueCell.x &&
          gap >= -0.8 &&
          gap <= 12 &&
          verticalOverlapRatio(labelCell, valueCell) >= 0.72 &&
          cleanTableLabel(labelCell.text)
        );
      })
      .sort((a, b) => b.x + b.width - (a.x + a.width));
    const labelCell = labelOptions[0];
    if (!labelCell) return;

    const numberedSibling =
      cellsWithText.some((sibling) => {
        const gap = labelCell.x - (sibling.x + sibling.width);
        return (
          sibling !== labelCell &&
          sibling.width <= 18 &&
          sibling.x < labelCell.x &&
          gap >= -0.8 &&
          gap <= 8 &&
          verticalOverlapRatio(sibling, labelCell) >= 0.72 &&
          /^\s*\d+[.)]?\s*$/.test(sibling.text)
        );
      }) ||
      textBoxes.some((text) => {
        const gap = labelCell.x - (text.x + text.width);
        return (
          text.x < labelCell.x &&
          gap >= -0.8 &&
          gap <= 8 &&
          verticalOverlapRatio(text, labelCell) >= 0.72 &&
          /^\s*\d+[.)]?\s*$/.test(text.text)
        );
      });
    if (numberedSibling) return;

    pairs.push({
      label: cleanTableLabel(labelCell.text),
      labelCell,
      valueCell,
      valueText: valueCell.text,
    });
  });

  const groupCounts = new Map<string, number>();
  pairs.forEach((pair) => {
    const key = tableColumnKey(pair);
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  });

  return pairs
    .filter((pair) => !pair.valueText && (groupCounts.get(tableColumnKey(pair)) || 0) >= 2)
    .map((pair, index) =>
      makeCandidate({
        pageNumber,
        source: 'table-cell',
        index,
        label: pair.label,
        rect: {
          x: pair.valueCell.x + 1,
          y: pair.valueCell.y + 0.6,
          width: Math.max(5, pair.valueCell.width - 2),
          height: Math.max(4, pair.valueCell.height - 1.2),
        },
        confidence: 0.88,
      }),
    );
}

function horizontalOverlapRatio(first: CanvasRect, second: CanvasRect): number {
  const overlap = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
  );
  return overlap / Math.max(1, Math.min(first.width, second.width));
}

function hasTextOnBorder(shape: VectorShape, textBoxes: TextBox[]): boolean {
  if (!shape.horizontal) return false;
  const lineY = shape.y + shape.height / 2;
  const overlap = textBoxes.reduce((total, text) => {
    const textBottom = text.y + text.height;
    if (lineY - textBottom < -1.5 || lineY - textBottom > 3.5) return total;
    return (
      total +
      Math.max(0, Math.min(shape.x + shape.width, text.x + text.width) - Math.max(shape.x, text.x))
    );
  }, 0);
  return overlap >= Math.max(8, shape.width * 0.22);
}

function intersectsTableGrid(
  shape: VectorShape,
  shapes: VectorShape[],
  textBoxes: TextBox[],
): boolean {
  if (shape.horizontal) {
    const y = shape.y + shape.height / 2;
    const intersections = shapes.filter(
      (other) =>
        other.vertical &&
        other.x >= shape.x - 1 &&
        other.x <= shape.x + shape.width + 1 &&
        y >= other.y - 1 &&
        y <= other.y + other.height + 1,
    );
    if (intersections.length >= 2) return true;
    const densePage = shapes.length >= 30;
    const stackedPeers = shapes.filter(
      (other) =>
        other !== shape &&
        other.horizontal &&
        Math.abs(other.y - shape.y) >= 1.5 &&
        Math.abs(other.y - shape.y) <= 35 &&
        horizontalOverlapRatio(shape, other) >= 0.78 &&
        Math.abs(other.x - shape.x) <= 3 &&
        Math.abs(other.width - shape.width) <= 6,
    );
    if (densePage && (stackedPeers.length >= 3 || hasTextOnBorder(shape, textBoxes))) return true;
  }
  if (shape.box) {
    const peers = shapes.filter(
      (other) =>
        other !== shape &&
        other.box &&
        Math.abs(other.y - shape.y) <= 1.5 &&
        Math.abs(other.height - shape.height) <= 2,
    );
    if (peers.length >= (shapes.length >= 20 ? 1 : 2)) return true;
  }
  return false;
}

interface LabelCandidate {
  text: TextBox;
  score: number;
  mode: string;
}

function findNearestLabel(shape: CanvasRect, textBoxes: TextBox[]): LabelCandidate | null {
  const centerY = shape.y + shape.height / 2;
  const candidates: LabelCandidate[] = [];
  textBoxes.forEach((text) => {
    const cleanText = cleanVectorLabel(text.text);
    if (!cleanText) return;
    const candidateText = { ...text, text: cleanText };
    const textRight = text.x + text.width;
    const textBottom = text.y + text.height;
    const textCenterY = text.y + text.height / 2;
    const leftGap = shape.x - textRight;
    if (leftGap >= -2 && leftGap <= 30 && Math.abs(textCenterY - centerY) <= 7) {
      candidates.push({
        text: candidateText,
        score: Math.abs(textCenterY - centerY) + Math.max(0, leftGap) * 0.15,
        mode: 'left',
      });
    }
    const aboveGap = shape.y - textBottom;
    const horizontalDistance = Math.abs(text.x - shape.x);
    if (aboveGap >= -1 && aboveGap <= 10 && horizontalDistance <= 25) {
      candidates.push({
        text: candidateText,
        score: 4 + Math.max(0, aboveGap) + horizontalDistance * 0.1,
        mode: 'above',
      });
    }
    const textCenterX = text.x + text.width / 2;
    const shapeCenterX = shape.x + shape.width / 2;
    if (
      shape.width <= 90 &&
      SEMANTIC_SIGNATURE_LABEL.test(cleanText) &&
      aboveGap > 10 &&
      aboveGap <= 50 &&
      Math.abs(textCenterX - shapeCenterX) <= Math.max(18, shape.width * 0.45)
    ) {
      candidates.push({
        text: candidateText,
        score: 25 + aboveGap * 0.25 + Math.abs(textCenterX - shapeCenterX) * 0.1,
        mode: 'signature-above',
      });
    }
  });
  return candidates.sort((a, b) => a.score - b.score)[0] || null;
}

function findInteriorLabel(shape: VectorShape, textBoxes: TextBox[]): string {
  if (!shape.box) return '';
  return (
    textBoxes
      .map((text) => ({ text, clean: cleanVectorLabel(text.text) }))
      .filter(
        ({ text, clean }) =>
          clean &&
          SEMANTIC_SIGNATURE_LABEL.test(clean) &&
          text.x >= shape.x - 2 &&
          text.x + text.width <= shape.x + shape.width + 2 &&
          text.y >= shape.y - 2 &&
          text.y + text.height <= shape.y + shape.height + 2,
      )
      .sort((a, b) => a.text.y - b.text.y)[0]?.clean || ''
  );
}

function findBoxInstructionLabel(shape: VectorShape, textBoxes: TextBox[]): string {
  if (!shape.box) return '';
  const nearby = textBoxes
    .filter((text) => {
      const gap = shape.y - (text.y + text.height);
      return gap >= 0 && gap <= 15 && horizontalOverlapRatio(shape, text) >= 0.35;
    })
    .sort((a, b) => a.y - b.y)
    .slice(-2);
  const combined = cleanVectorLabel(nearby.map((text) => text.text).join(' '));
  return combined === 'Keberatan (jika ada)' ? combined : '';
}

export function extractTextCandidates({
  textContent,
  viewport,
  pageNumber,
}: {
  textContent?: TextContentLike;
  viewport: ViewportLike;
  pageNumber: number;
}): Candidate[] {
  const textBoxes = mergeTextBoxes(textContent?.items, viewport);
  const candidates: Candidate[] = [];
  (textContent?.items || []).forEach((item, itemIndex: number) => {
    const rawText = typeof item?.str === 'string' ? item.str : '';
    const box = textItemToCanvasBox(item, viewport, { preserveText: true });
    if (!box || !rawText) return;
    for (const match of rawText.matchAll(
      /[_\uFF3F\uFE4F]{2,}(?:\s*[\/.-]\s*[_\uFF3F\uFE4F]{2,})*/g,
    )) {
      const matchIndex = match.index ?? 0;
      const startRatio = matchIndex / Math.max(1, rawText.length);
      const widthRatio = match[0].length / Math.max(1, rawText.length);
      const rect: CanvasRect = {
        x: box.x + box.width * startRatio,
        y: box.y,
        width: Math.max(5, box.width * widthRatio),
        height: Math.max(4, box.height),
      };
      const inlineLabel = cleanVectorLabel(
        rawText
          .slice(0, matchIndex)
          .split(/[_\uFF3F\uFE4F]{2,}|\s{2,}|[|]/)
          .pop(),
      );
      const nearest = inlineLabel ? null : findNearestLabel(rect, textBoxes);
      const label = inlineLabel || nearest?.text.text;
      if (!label) continue;
      candidates.push(
        makeCandidate({
          pageNumber,
          source: 'text-underline',
          index: itemIndex + candidates.length,
          label,
          rect,
          confidence: SEMANTIC_SIGNATURE_LABEL.test(label) ? 0.76 : 0.72,
        }),
      );
    }
  });
  return candidates;
}

export function extractVectorCandidates({
  operatorList,
  textContent,
  viewport,
  ops,
  pageNumber,
}: {
  operatorList?: OperatorListLike;
  textContent?: TextContentLike;
  viewport: ViewportLike;
  ops?: Record<string, number>;
  pageNumber: number;
}): Candidate[] {
  const shapes = extractVectorShapes(operatorList, viewport, ops);
  const textBoxes = mergeTextBoxes(textContent?.items, viewport);
  return shapes
    .filter(
      (shape) => (shape.horizontal || shape.box) && !intersectsTableGrid(shape, shapes, textBoxes),
    )
    .map((shape, index) => {
      const interiorLabel = findInteriorLabel(shape, textBoxes);
      const instructionLabel = interiorLabel ? '' : findBoxInstructionLabel(shape, textBoxes);
      const match = interiorLabel || instructionLabel ? null : findNearestLabel(shape, textBoxes);
      const label = interiorLabel || instructionLabel || match?.text.text;
      if (!label) return null;
      const matchInsideBox =
        shape.box &&
        match &&
        match.text.x >= shape.x - 2 &&
        match.text.x + match.text.width <= shape.x + shape.width + 2 &&
        match.text.y >= shape.y - 2 &&
        match.text.y + match.text.height <= shape.y + shape.height + 2;
      if (matchInsideBox && !SEMANTIC_SIGNATURE_LABEL.test(label)) return null;
      const rect = shape.horizontal
        ? {
            x: shape.x,
            y: clamp(shape.y - 4, 0, DETECTOR_HEIGHT_MM - 4),
            width: shape.width,
            height: 5,
          }
        : shape;
      const colonBonus = /[:：]\s*$/.test(match?.text.text || '') ? 0.05 : 0;
      const signatureMatch = interiorLabel || match?.mode === 'signature-above';
      return makeCandidate({
        pageNumber,
        source: shape.box ? 'vector-box' : 'vector-line',
        index,
        label,
        rect,
        confidence: signatureMatch
          ? 0.7
          : instructionLabel
            ? 0.72
            : Math.min(0.92, (shape.box ? 0.78 : 0.82) + colonBonus),
      });
    })
    .filter((c): c is Candidate => c !== null);
}

function overlapRatio(first: CanvasRect, second: CanvasRect): number {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(first.width * first.height, second.width * second.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

export function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const sorted = [...(candidates || [])].sort(
    (a, b) =>
      (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0) ||
      b.confidence - a.confidence,
  );
  const unique: Candidate[] = [];
  sorted.forEach((candidate) => {
    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;
    const duplicate = unique.some(
      (existing) =>
        existing.pageNumber === candidate.pageNumber &&
        (overlapRatio(existing, candidate) >= 0.55 ||
          (Math.abs(existing.x + existing.width / 2 - centerX) <= 2 &&
            Math.abs(existing.y + existing.height / 2 - centerY) <= 2)),
    );
    if (!duplicate) unique.push(candidate);
  });
  return unique.sort((a, b) => a.pageNumber - b.pageNumber || a.y - b.y || a.x - b.x);
}

export async function scanPdfPage(
  page: PageProxyLike,
  pageNumber: number,
  { ops = {} }: { ops?: Record<string, number> } = {},
): Promise<Candidate[]> {
  const viewport = page.getViewport({ scale: 1 });
  const [annotationResult, textResult, operatorResult] = await Promise.allSettled([
    page.getAnnotations({ intent: 'display' }),
    page.getTextContent(),
    page.getOperatorList(),
  ]);
  const annotations = annotationResult.status === 'fulfilled' ? annotationResult.value : [];
  const textContent = textResult.status === 'fulfilled' ? textResult.value : { items: [] };
  const operatorList =
    operatorResult.status === 'fulfilled' ? operatorResult.value : { fnArray: [], argsArray: [] };
  const annotationCandidates = extractAnnotationCandidates(annotations, viewport, pageNumber);
  const textCandidates = extractTextCandidates({ textContent, viewport, pageNumber });
  const tableCandidates = extractTableCandidates({
    operatorList,
    textContent,
    viewport,
    ops,
    pageNumber,
  });
  const vectorCandidates = extractVectorCandidates({
    operatorList,
    textContent,
    viewport,
    ops,
    pageNumber,
  });
  if (annotationCandidates.length) {
    return deduplicateCandidates([
      ...annotationCandidates,
      ...tableCandidates,
      ...textCandidates,
      ...vectorCandidates.filter((candidate) => candidate.source !== 'vector-box'),
    ]);
  }
  return deduplicateCandidates([...tableCandidates, ...textCandidates, ...vectorCandidates]);
}

export async function scanPdfDocument(
  pdf: PDFDocumentProxy,
  {
    ops = {},
    nextFrame = () => Promise.resolve(),
    onProgress = () => {},
  }: {
    ops?: Record<string, number>;
    nextFrame?: () => Promise<unknown>;
    onProgress?: (progress: { pageNumber: number; totalPages: number; percent: number }) => void;
  } = {},
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    onProgress({
      pageNumber,
      totalPages: pdf.numPages,
      percent: Math.round((pageNumber / pdf.numPages) * 100),
    });
    await nextFrame();
    const page = await pdf.getPage(pageNumber);
    candidates.push(...(await scanPdfPage(page as unknown as PageProxyLike, pageNumber, { ops })));
  }
  return deduplicateCandidates(candidates);
}

function ensurePage(docEntry: DocEntryLike, pageNumber: number) {
  if (!Array.isArray(docEntry.pages)) docEntry.pages = [];
  while (docEntry.pages.length < pageNumber) {
    docEntry.pages.push({ page_number: docEntry.pages.length + 1, items: [] });
  }
  const page = docEntry.pages[pageNumber - 1];
  if (page && !Array.isArray(page.items)) page.items = [];
  return page;
}

export function applyFieldCandidates(
  data: LegacyDocument,
  candidates: Candidate[],
  /** Sheet the candidates were already fitted to (see `fitPdfCandidates`). */
  paper: Paper = DEFAULT_PAPER,
): { data: LegacyDocument; addedCount: number; appliedCandidateIds: string[] } {
  if (!Array.isArray(data) || !Array.isArray(candidates))
    throw new TypeError(t('error.candidatesNotArrays'));
  const nextData = structuredClone(data);
  let addedCount = 0;
  const appliedCandidateIds: string[] = [];
  candidates.forEach((candidate) => {
    const pageNumber = Number.parseInt(String(candidate.pageNumber), 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    const key = normalizePlaceholderKey(candidate.key || candidate.label, `field_${pageNumber}`);
    const text = String(candidate.placeholder || `{{${key}}}`).trim() || `{{${key}}}`;
    let candidateApplied = false;
    nextData.forEach((docEntry) => {
      const page = ensurePage(docEntry, pageNumber);
      if (!page || !Array.isArray(page.items)) return;
      const duplicate = page.items.some((rawItem) => {
        const item = rawItem as DocumentItemLike;
        return (
          item.type !== 'image' &&
          item.text === text &&
          Math.abs(Number(item.x) - Number(candidate.x)) <= 1 &&
          Math.abs(Number(item.y) - Number(candidate.y)) <= 1
        );
      });
      if (duplicate) return;
      // Round the origin first so the rounded size cannot push the box past the sheet
      // (e.g. x 100.05 → 100.1 with width 109.95 → 110 would end at 210.1 mm).
      const x = round(clamp(Number(candidate.x) || 0, 0, paper.width - 1));
      const y = round(clamp(Number(candidate.y) || 0, 0, paper.height - 1));
      const width = round(clamp(Number(candidate.width) || 30, 1, paper.width - x));
      const height = round(clamp(Number(candidate.height) || 5, 1, paper.height - y));
      page.items.push({
        text,
        x,
        y,
        width,
        height,
        font_family: 'Arial, sans-serif',
        font_size: DEFAULT_FONT_SIZE_PT,
        color: '#111827',
        bold: false,
      });
      addedCount++;
      candidateApplied = true;
    });
    // A placeholder that already exists counts as applied, so the candidate is consumed
    // whenever there is at least one document to apply it to.
    if (candidateApplied || nextData.length > 0) appliedCandidateIds.push(candidate.id);
  });
  return { data: nextData, addedCount, appliedCandidateIds };
}
