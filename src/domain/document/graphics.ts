/**
 * Graphic items (marks, lines, cover boxes, barcodes and QR codes) described as
 * shapes in the item's box, plus their SVG. Only validated numbers and #rrggbb colours
 * reach the output.
 */
import { ITEM_DEFAULTS, type Item } from './model';
import { codeShapes } from './codes';
import { drawingSvg, type Drawing, type Shape } from './shapes';

const safeColor = (value: string | undefined, fallback: string) =>
  value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
/** Default stroke for marks scales with the box, so a 5 mm tick is clearly visible. */
const markStroke = (width: number, height: number) =>
  Math.max(0.25, Math.min(width, height) * 0.12);

function markShapes(item: Item, width: number, height: number, color: string): Shape[] {
  const stroke = Number(item.stroke_width) || markStroke(width, height);
  const inset = stroke / 2;
  const at = (fx: number, fy: number): [number, number] => [
    inset + (width - stroke) * fx,
    inset + (height - stroke) * fy,
  ];
  switch (item.text) {
    case 'check':
      return [
        {
          kind: 'lines',
          lines: [[at(0.08, 0.55), at(0.38, 0.88), at(0.94, 0.12)]],
          color,
          width: stroke,
          cap: 'round',
        },
      ];
    case 'cross':
      return [
        {
          kind: 'lines',
          lines: [
            [at(0.1, 0.1), at(0.9, 0.9)],
            [at(0.9, 0.1), at(0.1, 0.9)],
          ],
          color,
          width: stroke,
          cap: 'round',
        },
      ];
    default:
      return [
        {
          kind: 'ellipse',
          cx: width / 2,
          cy: height / 2,
          rx: width * 0.32,
          ry: height * 0.32,
          color,
        },
      ];
  }
}

function lineShapes(item: Item, width: number, height: number, color: string): Shape[] {
  const points: Record<string, [number, number][]> = {
    horizontal: [
      [0, height / 2],
      [width, height / 2],
    ],
    vertical: [
      [width / 2, 0],
      [width / 2, height],
    ],
    diagonal: [
      [0, 0],
      [width, height],
    ],
    antidiagonal: [
      [0, height],
      [width, 0],
    ],
  };
  return [
    {
      kind: 'lines',
      lines: [points[item.text] ?? points.horizontal!],
      color,
      width: Number(item.stroke_width) || 0.3,
      cap: 'butt',
    },
  ];
}

function rectShapes(item: Item, width: number, height: number, color: string): Shape[] {
  const stroke = Number(item.stroke_width) || 0;
  const inset = stroke / 2;
  return [
    {
      kind: 'rect',
      x: inset,
      y: inset,
      width: Math.max(0, width - stroke),
      height: Math.max(0, height - stroke),
      fill: safeColor(item.bg_color, '#ffffff'),
      ...(stroke ? { stroke: color, strokeWidth: stroke } : {}),
    },
  ];
}

/** Shapes for a graphic item, or undefined for text and images. */
export function itemDrawing(item: Item): Drawing | undefined {
  const width = Number(item.width) || 0;
  const height = Number(item.height) || 0;
  if (!width || !height) return undefined;
  const color = safeColor(item.color, ITEM_DEFAULTS.color);
  let shapes: Shape[];
  switch (item.type) {
    case 'mark':
      shapes = markShapes(item, width, height, color);
      break;
    case 'line':
      shapes = lineShapes(item, width, height, color);
      break;
    case 'rect':
      shapes = rectShapes(item, width, height, color);
      break;
    case 'barcode':
    case 'qr':
      shapes = codeShapes(
        item.type,
        item.text,
        item.barcode_format ?? 'code128',
        width,
        height,
        color,
      );
      break;
    default:
      return undefined;
  }
  return { width, height, shapes };
}

/** SVG markup for a graphic item, or undefined for text and images. */
export function itemGraphic(item: Item): string | undefined {
  const drawing = itemDrawing(item);
  return drawing && drawingSvg(drawing);
}
