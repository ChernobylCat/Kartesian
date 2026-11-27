/**
 * Native PDF export: vector pages at the exact sheet size, drawn from the same
 * layout rules as the canvas (presentation.ts) and the same shapes as the SVG
 * (shapes.ts). PDF standard fonts stand in for the editor fonts: Arial, Verdana and
 * Plus Jakarta Sans use Helvetica; Times New Roman and Georgia use Times; Courier
 * New uses Courier. Characters those fonts cannot encode print as "?".
 */
import {
  PDFDocument,
  StandardFonts,
  LineCapStyle,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import type { OutputSnapshot } from '@/application/ports';
import { ITEM_DEFAULTS, isBold, type Assets, type Item } from '@/domain/document/model';
import { paperOf } from '@/domain/document/paper';
import { FULL_SCOPE, type OutputScope } from '@/domain/document/output-scope';
import {
  combCells,
  fontSizeOf,
  isTextItem,
  lineHeightOf,
  renderedFontSize,
} from '@/domain/document/presentation';
import { itemDrawing } from '@/domain/document/graphics';
import type { Shape } from '@/domain/document/shapes';
import { scopedPages } from './html';
import { t } from '@/i18n/core';

/** Points per millimetre. */
const MM = 72 / 25.4;
type Family = 'Helvetica' | 'Times' | 'Courier';
const FAMILIES: Record<string, Family> = {
  'Arial, sans-serif': 'Helvetica',
  'Verdana, sans-serif': 'Helvetica',
  'Plus Jakarta Sans, sans-serif': 'Helvetica',
  'Times New Roman, Times, serif': 'Times',
  'Georgia, serif': 'Times',
  'Courier New, Courier, monospace': 'Courier',
};
const STANDARD: Record<Family, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Helvetica: [
    StandardFonts.Helvetica,
    StandardFonts.HelveticaBold,
    StandardFonts.HelveticaOblique,
    StandardFonts.HelveticaBoldOblique,
  ],
  Times: [
    StandardFonts.TimesRoman,
    StandardFonts.TimesRomanBold,
    StandardFonts.TimesRomanItalic,
    StandardFonts.TimesRomanBoldItalic,
  ],
  Courier: [
    StandardFonts.Courier,
    StandardFonts.CourierBold,
    StandardFonts.CourierOblique,
    StandardFonts.CourierBoldOblique,
  ],
};

function color(hex: string | undefined, fallback: string = ITEM_DEFAULTS.color) {
  const value = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
  return rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  );
}

/** Loads image bytes for the PDF; the browser version fetches and converts. */
export type ImageLoader = (source: string) => Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' }>;

/** Reads data URLs and same-origin URLs; WebP and GIF are converted to PNG via a canvas. */
export const browserImageLoader: ImageLoader = async (source) => {
  const blob = await (await fetch(source)).blob();
  if (blob.type === 'image/png' || blob.type === 'image/jpeg')
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: blob.type === 'image/png' ? 'png' : 'jpg',
    };
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG'))), 'image/png'),
  );
  return { bytes: new Uint8Array(await png.arrayBuffer()), type: 'png' };
};

class Fonts {
  private cache = new Map<StandardFonts, Promise<PDFFont>>();
  constructor(private document: PDFDocument) {}
  get(item: Item) {
    const family = FAMILIES[item.font_family ?? ITEM_DEFAULTS.font_family] ?? 'Helvetica';
    const variant = (isBold(item) ? 1 : 0) + (item.italic ? 2 : 0);
    const name = STANDARD[family][variant]!;
    let font = this.cache.get(name);
    if (!font) this.cache.set(name, (font = this.document.embedFont(name)));
    return font;
  }
}

/** Replaces characters the font cannot encode, so drawing never throws. */
function encodable(font: PDFFont, text: string) {
  return Array.from(text)
    .map((char) => {
      try {
        font.encodeText(char);
        return char;
      } catch {
        return '?';
      }
    })
    .join('');
}

/** Greedy word wrap at spaces, keeping explicit line breaks (like CSS pre-wrap). */
function wrap(text: string, maxWidth: number | undefined, measure: (line: string) => number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!maxWidth) {
      lines.push(paragraph);
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/(?<= )/)) {
      if (line && measure(line + word.trimEnd()) > maxWidth + 1e-6) {
        lines.push(line.trimEnd());
        line = word;
      } else line += word;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/**
 * Runs `draw` in item space: origin at the item's top-left, x right, y up, units pt,
 * rotated about the item centre like CSS `rotate()`.
 */
function inItemSpace(
  page: PDFPage,
  left: number,
  top: number,
  width: number,
  height: number,
  rotation: number,
  draw: () => void,
) {
  const angle = (-rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = width / 2;
  const cy = -height / 2;
  const x0 = left;
  const y0 = page.getHeight() - top;
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      cos,
      sin,
      -sin,
      cos,
      x0 + cx - (cos * cx - sin * cy),
      y0 + cy - (sin * cx + cos * cy),
    ),
  );
  draw();
  page.pushOperators(popGraphicsState());
}

function drawShapes(page: PDFPage, shapes: Shape[], width: number, height: number, font: PDFFont) {
  const point = ([x, y]: [number, number]) => ({ x: x * MM, y: -y * MM });
  for (const shape of shapes) {
    switch (shape.kind) {
      case 'lines':
        for (const line of shape.lines)
          for (let index = 1; index < line.length; index++)
            page.drawLine({
              start: point(line[index - 1]!),
              end: point(line[index]!),
              thickness: shape.width * MM,
              color: color(shape.color),
              lineCap: shape.cap === 'round' ? LineCapStyle.Round : LineCapStyle.Butt,
            });
        break;
      case 'ellipse':
        page.drawEllipse({
          x: shape.cx * MM,
          y: -shape.cy * MM,
          xScale: shape.rx * MM,
          yScale: shape.ry * MM,
          color: color(shape.color),
        });
        break;
      case 'rect':
        page.drawRectangle({
          x: shape.x * MM,
          y: -(shape.y + shape.height) * MM,
          width: shape.width * MM,
          height: shape.height * MM,
          color: color(shape.fill, '#ffffff'),
          ...(shape.stroke
            ? { borderColor: color(shape.stroke), borderWidth: (shape.strokeWidth ?? 0) * MM }
            : {}),
        });
        break;
      case 'bars':
        for (const bar of shape.bars)
          page.drawRectangle({
            x: bar.x * MM,
            y: -(bar.y + bar.height) * MM,
            width: bar.width * MM,
            height: bar.height * MM,
            color: color(shape.color),
          });
        break;
      case 'placeholder': {
        page.drawRectangle({
          x: 0,
          y: -height * MM,
          width: width * MM,
          height: height * MM,
          borderColor: color('#94a3b8'),
          borderWidth: 0.3 * MM,
          borderDashArray: [1 * MM, 0.8 * MM],
        });
        const size = Math.min(height * 0.3, 3.5) * MM;
        const text = encodable(font, shape.text.slice(0, 60));
        page.drawText(text, {
          x: (width * MM - font.widthOfTextAtSize(text, size)) / 2,
          y: -(height * MM) / 2 - size * 0.35,
          size,
          font,
          color: color('#64748b'),
        });
        break;
      }
    }
  }
}

function drawText(page: PDFPage, item: Item, font: PDFFont) {
  const spacing = (Number(item.letter_spacing) || 0) * MM;
  const width = (size: number, text: string) =>
    font.widthOfTextAtSize(text, size) + spacing * Array.from(text).length;
  const size = renderedFontSize(item, (text, shorthand) => {
    const points = Number(/([\d.]+)pt/.exec(shorthand)?.[1] ?? fontSizeOf(item));
    return width(points, encodable(font, text)) / MM;
  });
  const lineHeight = size * lineHeightOf(item);
  const ascent = font.heightAtSize(size, { descender: false });
  const contentHeight = font.heightAtSize(size);
  /** Baseline of a line box whose top is at `top` (pt below the item top), CSS half-leading. */
  const baseline = (top: number) => -(top + (lineHeight - contentHeight) / 2 + ascent);
  const textColor = color(item.color);
  const cells = combCells(item);
  const boxWidth = item.width ? item.width * MM : undefined;

  const drawLine = (text: string, x: number, y: number) => {
    if (!spacing) {
      page.drawText(text, { x, y, size, font, color: textColor });
    } else {
      let cursor = x;
      for (const char of Array.from(text)) {
        page.drawText(char, { x: cursor, y, size, font, color: textColor });
        cursor += font.widthOfTextAtSize(char, size) + spacing;
      }
    }
    if (item.underline && text)
      page.drawLine({
        start: { x, y: y - size * 0.11 },
        end: { x: x + width(size, text), y: y - size * 0.11 },
        thickness: Math.max(0.3, size * 0.06),
        color: textColor,
      });
  };

  if (cells) {
    const cellWidth = boxWidth! / cells.length;
    const height = item.height ? item.height * MM : lineHeight;
    const y = baseline((height - lineHeight) / 2);
    cells.forEach((cell, index) => {
      const text = encodable(font, cell);
      if (text)
        drawLine(text, index * cellWidth + (cellWidth - font.widthOfTextAtSize(text, size)) / 2, y);
    });
    return;
  }
  const lines = wrap(encodable(font, item.text), boxWidth, (line) => width(size, line));
  lines.forEach((line, index) => {
    const lineWidth = width(size, line);
    const x =
      boxWidth && item.text_align === 'center'
        ? (boxWidth - lineWidth) / 2
        : boxWidth && item.text_align === 'right'
          ? boxWidth - lineWidth
          : 0;
    drawLine(line, x, baseline(index * lineHeight));
  });
}

/** Natural size (pt) of an auto-sized text item, for its background and rotation centre. */
function textBox(item: Item, font: PDFFont) {
  const size = fontSizeOf(item);
  const lines = encodable(font, item.text).split(/\r?\n/);
  const spacing = (Number(item.letter_spacing) || 0) * MM;
  return {
    width: Math.max(
      ...lines.map(
        (line) => font.widthOfTextAtSize(line, size) + spacing * Array.from(line).length,
      ),
    ),
    height: lines.length * size * lineHeightOf(item),
  };
}

async function drawItem(
  page: PDFPage,
  item: Item,
  assets: Assets,
  fonts: Fonts,
  offset: { x: number; y: number },
  images: (source: string) => Promise<PDFImage>,
) {
  const left = (item.x + offset.x) * MM;
  const top = (item.y + offset.y) * MM;
  const rotation = Number(item.rotation) || 0;
  const font = await fonts.get(item);
  if (item.type === 'image') {
    const source = item.assetId ? assets[item.assetId]?.dataUrl : item.text;
    if (!source) throw new Error(t('error.outputImage'));
    const image = await images(source);
    const width = item.width! * MM;
    const height = item.height! * MM;
    // object-fit: contain, centred.
    const scale = Math.min(width / image.width, height / image.height);
    inItemSpace(page, left, top, width, height, rotation, () =>
      page.drawImage(image, {
        x: (width - image.width * scale) / 2,
        y: -height + (height - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      }),
    );
    return;
  }
  const drawing = itemDrawing(item);
  if (drawing) {
    inItemSpace(page, left, top, drawing.width * MM, drawing.height * MM, rotation, () =>
      drawShapes(page, drawing.shapes, drawing.width, drawing.height, font),
    );
    return;
  }
  if (!isTextItem(item)) return;
  const natural = textBox(item, font);
  const width = item.width ? item.width * MM : natural.width;
  const height = item.height ? item.height * MM : natural.height;
  inItemSpace(page, left, top, width, height, rotation, () => {
    if (item.bg_color)
      page.drawRectangle({ x: 0, y: -height, width, height, color: color(item.bg_color) });
    drawText(page, item, font);
  });
}

/** Builds the PDF for the scoped pages. */
export async function exportPdf(
  snapshot: OutputSnapshot,
  scope: OutputScope = FULL_SCOPE,
  loadImage: ImageLoader = browserImageLoader,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(snapshot.document.documents[0]?.title ?? 'Kartesian');
  pdf.setCreator('Kartesian');
  const fonts = new Fonts(pdf);
  const imageCache = new Map<string, Promise<PDFImage>>();
  const images = (source: string) => {
    let image = imageCache.get(source);
    if (!image) {
      image = loadImage(source).then(({ bytes, type }) =>
        type === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes),
      );
      imageCache.set(source, image);
    }
    return image;
  };
  const paper = paperOf(snapshot.document);
  const { settings, assets } = snapshot;
  const offset = { x: settings.offsetX, y: settings.offsetY };
  const marksFont = await pdf.embedFont(StandardFonts.Helvetica);
  for (const output of scopedPages(snapshot, scope)) {
    const page = pdf.addPage([paper.width * MM, paper.height * MM]);
    if (output.background) {
      const image = await images(output.background);
      const scale = Math.min(page.getWidth() / image.width, page.getHeight() / image.height);
      page.drawImage(image, {
        x: (page.getWidth() - image.width * scale) / 2,
        y: (page.getHeight() - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
        opacity: settings.overlayOpacity / 100,
      });
    }
    if (!settings.hideCalibration) {
      const size = 6;
      const label = '| 10mm |';
      const labelWidth = marksFont.widthOfTextAtSize(label, size);
      const inset = 10 * MM;
      const ascent = marksFont.heightAtSize(size, { descender: false });
      for (const [x, y] of [
        [inset, page.getHeight() - inset - ascent],
        [page.getWidth() - inset - labelWidth, page.getHeight() - inset - ascent],
        [inset, inset],
        [page.getWidth() - inset - labelWidth, inset],
      ] as const)
        page.drawText(label, { x, y, size, font: marksFont, color: rgb(0.53, 0.53, 0.53) });
    }
    // CSS stacking: higher z-index on top; equal values keep document order.
    const ordered = output.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (a.item.z_index ?? 1) - (b.item.z_index ?? 1) || a.index - b.index);
    for (const { item } of ordered) await drawItem(page, item, assets, fonts, offset, images);
  }
  return pdf.save();
}
