/**
 * How an item looks, shared by the editor canvas and every output (print, HTML,
 * PDF), so what is on screen is what prints. Pure: no DOM access.
 */
import { ITEM_DEFAULTS, isBold, type Item } from './model';

/** CSS declarations with kebab-case property names. */
export type Css = Record<string, string>;

export const PT_TO_MM = 25.4 / 72;
export const MIN_FONT_SIZE = 4;
/** Default line height (multiple of the font size), matching the stylesheet. */
export const DEFAULT_LINE_HEIGHT = 1.5;

export const isTextItem = (item: Pick<Item, 'type'>) => !item.type || item.type === 'text';
export const fontSizeOf = (item: Item) => Number(item.font_size) || ITEM_DEFAULTS.font_size;
export const lineHeightOf = (item: Item) => Number(item.line_height) || DEFAULT_LINE_HEIGHT;

/** CSS `font` shorthand, used for measuring text. */
export function fontShorthand(item: Item, fontSize = fontSizeOf(item)) {
  return `${item.italic ? 'italic ' : ''}${isBold(item) ? 700 : 400} ${fontSize}pt ${
    item.font_family ?? ITEM_DEFAULTS.font_family
  }`;
}

/** Typography and colour of an item (no position or size). */
export function textStyle(item: Item, fontSize = fontSizeOf(item)): Css {
  const css: Css = {
    'font-family': item.font_family ?? ITEM_DEFAULTS.font_family,
    'font-size': `${fontSize}pt`,
    'font-weight': isBold(item) ? '700' : '400',
    'font-style': item.italic ? 'italic' : 'normal',
    'text-decoration': item.underline ? 'underline' : 'none',
    color: item.color ?? ITEM_DEFAULTS.color,
    'line-height': String(lineHeightOf(item)),
  };
  if (item.bg_color) css['background-color'] = item.bg_color;
  if (item.text_align) css['text-align'] = item.text_align;
  if (item.letter_spacing && !item.comb_cells) css['letter-spacing'] = `${item.letter_spacing}mm`;
  return css;
}

/** Characters for each comb cell; extra characters beyond the cell count are dropped. */
export function combCells(item: Item): string[] | undefined {
  if (!item.comb_cells || !isTextItem(item)) return undefined;
  const characters = Array.from(item.text.replace(/\r?\n/g, ''));
  return Array.from({ length: item.comb_cells }, (_, index) => characters[index] ?? '');
}

/** Measures the width in mm of a single line of text in a CSS font. */
export type TextMeasurer = (text: string, font: string) => number;

/**
 * Rough width for environments without a canvas (tests, server): average glyph is
 * about half the font size wide.
 */
export const estimateTextWidth: TextMeasurer = (text, font) => {
  const size = Number(/([\d.]+)pt/.exec(font)?.[1] ?? ITEM_DEFAULTS.font_size);
  return Array.from(text).length * size * PT_TO_MM * 0.5;
};

/**
 * Font size used to render the item. With `fit: 'shrink'` the size is lowered in
 * 0.25 pt steps until every line fits the width (and all lines fit the height when
 * one is set); otherwise it is the stored size.
 */
export function renderedFontSize(item: Item, measure: TextMeasurer = estimateTextWidth) {
  const size = fontSizeOf(item);
  if (item.fit !== 'shrink' || !item.width || !isTextItem(item) || item.comb_cells) return size;
  const lines = item.text.split(/\r?\n/);
  const spacing = Number(item.letter_spacing) || 0;
  const fits = (candidate: number) => {
    const font = fontShorthand(item, candidate);
    const widest = Math.max(
      ...lines.map((line) => measure(line, font) + spacing * Array.from(line).length),
    );
    const height = lines.length * candidate * PT_TO_MM * lineHeightOf(item);
    return widest <= item.width! + 1e-6 && (!item.height || height <= item.height + 1e-6);
  };
  for (let candidate = size; candidate > MIN_FONT_SIZE; candidate -= 0.25)
    if (fits(candidate)) return Math.round(candidate * 100) / 100;
  return MIN_FONT_SIZE;
}

/** Serializes CSS declarations for a `style` attribute. */
export const cssText = (css: Css) =>
  Object.entries(css)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');

/** Converts kebab-case declarations to a React style object. */
export function reactStyle(css: Css): Record<string, string> {
  return Object.fromEntries(
    Object.entries(css).map(([property, value]) => [
      property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}
