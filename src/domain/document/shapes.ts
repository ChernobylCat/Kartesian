/**
 * Drawing primitives for graphic items, in millimetres inside the item's box (origin
 * top-left, y down). Both the SVG renderer (canvas, print, HTML) and the PDF exporter
 * draw from the same list, so every output matches.
 */
export type Rect = { x: number; y: number; width: number; height: number };
export type Shape =
  /** Straight segments (`points` pairs), drawn as an open polyline per entry. */
  | {
      kind: 'lines';
      lines: [number, number][][];
      color: string;
      width: number;
      cap: 'round' | 'butt';
    }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: string }
  | ({ kind: 'rect'; fill: string; stroke?: string; strokeWidth?: number } & Rect)
  /** Many filled rectangles of one colour (barcode bars, QR modules). */
  | { kind: 'bars'; bars: Rect[]; color: string }
  /** Something that cannot be drawn yet, such as an unfilled `{{key}}` in a code. */
  | { kind: 'placeholder'; text: string };

export type Drawing = { width: number; height: number; shapes: Shape[] };

const round = (value: number) => Math.round(value * 1000) / 1000;
const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function shapeSvg(shape: Shape, width: number, height: number): string {
  switch (shape.kind) {
    case 'lines':
      return `<path fill="none" stroke="${shape.color}" stroke-width="${round(shape.width)}" stroke-linecap="${shape.cap}" stroke-linejoin="round" d="${shape.lines
        .map((points) =>
          points.map(([x, y], index) => `${index ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' '),
        )
        .join(' ')}"/>`;
    case 'ellipse':
      return `<ellipse cx="${round(shape.cx)}" cy="${round(shape.cy)}" rx="${round(shape.rx)}" ry="${round(shape.ry)}" fill="${shape.color}"/>`;
    case 'rect':
      return `<rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.width)}" height="${round(shape.height)}" fill="${shape.fill}"${
        shape.stroke
          ? ` stroke="${shape.stroke}" stroke-width="${round(shape.strokeWidth ?? 0)}"`
          : ''
      }/>`;
    case 'bars':
      return `<path fill="${shape.color}" shape-rendering="crispEdges" d="${shape.bars
        .map(
          (bar) =>
            `M${round(bar.x)} ${round(bar.y)}h${round(bar.width)}v${round(bar.height)}h${round(-bar.width)}z`,
        )
        .join('')}"/>`;
    case 'placeholder': {
      const size = round(Math.min(height * 0.3, 3.5));
      return `<rect x="0.15" y="0.15" width="${round(width - 0.3)}" height="${round(height - 0.3)}" fill="none" stroke="#94a3b8" stroke-width="0.3" stroke-dasharray="1 0.8"/><text x="${round(width / 2)}" y="${round(height / 2)}" font-size="${size}" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#64748b">${escapeXml(shape.text.slice(0, 60))}</text>`;
    }
  }
}

/** SVG whose viewBox is the item's box in mm, so stroke widths are real millimetres. */
export function drawingSvg({ width, height, shapes }: Drawing) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" preserveAspectRatio="none" aria-hidden="true">${shapes
    .map((shape) => shapeSvg(shape, width, height))
    .join('')}</svg>`;
}
