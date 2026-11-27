import type { OutputSnapshot } from '@/application/ports';
import { type Assets, type DocumentEntry, type Item, type Settings } from '@/domain/document/model';
import { itemGraphic } from '@/domain/document/graphics';
import {
  isTextItem,
  combCells,
  cssText,
  renderedFontSize,
  textStyle,
  type Css,
  type TextMeasurer,
} from '@/domain/document/presentation';
import { measureText } from './measure-text';
import {
  FULL_SCOPE,
  parsePageRange,
  scopedDocumentIds,
  type OutputScope,
} from '@/domain/document/output-scope';
import { imageSource } from '@/domain/document/schema';
import { type Paper, paperOf } from '@/domain/document/paper';
import { blobDataUrl } from '../storage/workspace';
import {
  guideSource,
  overlayPageCount,
  overlaySource,
  SHOWCASE_GUIDE_PAGES,
} from '../pdf/pdf-runtime';
import { getLocale, t } from '@/i18n/core';

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
/** Page size rules for one sheet size; also used by the in-app print surface. */
export const pageCss = (paper: Paper) =>
  `@page{size:${paper.width}mm ${paper.height}mm;margin:0}.output-page{width:${paper.width}mm;height:${paper.height}mm}`;
/**
 * Item-level rules shared by the in-app print surface and the standalone export, so
 * both lay items out exactly like the canvas.
 */
export const OUTPUT_ITEM_CSS =
  '.output-item{position:absolute;white-space:pre-wrap;line-height:1.5;transform-origin:center}' +
  '.output-item img{width:100%;height:100%;object-fit:contain}' +
  '.output-item svg{display:block;width:100%;height:100%;overflow:visible}' +
  '.comb{display:flex;width:100%;height:100%;align-items:center}' +
  '.comb-cell{flex:1 1 0;min-width:0;text-align:center;overflow:hidden;white-space:pre}';
/** Stylesheet of the standalone HTML export. */
export const outputCss = (paper: Paper) =>
  `${pageCss(paper)}*{box-sizing:border-box}html,body{margin:0;padding:0}.output-page{position:relative;isolation:isolate;overflow:hidden;background:white;color:#111827;break-after:page;page-break-after:always;print-color-adjust:exact;-webkit-print-color-adjust:exact}.output-page:last-child{break-after:auto;page-break-after:auto}${OUTPUT_ITEM_CSS}.output-overlay{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;pointer-events:none;z-index:-1001}.output-cal{position:absolute;font:6pt Arial;color:#888}.output-cal.tl{left:10mm;top:10mm}.output-cal.tr{right:10mm;top:10mm}.output-cal.bl{left:10mm;bottom:10mm}.output-cal.br{right:10mm;bottom:10mm}@media screen{body{background:#e2e8f0}.output-page{margin:20px auto;box-shadow:0 2px 12px #0002}}`;
/** Position, size, typography and calibration offset of one printed item. */
export function itemCss(item: Item, settings: Settings, measure: TextMeasurer = measureText) {
  const css: Css = { left: `${item.x}mm`, top: `${item.y}mm` };
  if (item.width) css.width = `${item.width}mm`;
  if (item.height) css.height = `${item.height}mm`;
  if (isTextItem(item)) Object.assign(css, textStyle(item, renderedFontSize(item, measure)));
  Object.assign(css, {
    transform: `translate(${settings.offsetX}mm,${settings.offsetY}mm) rotate(${item.rotation ?? 0}deg)`,
    'z-index': String(item.z_index ?? 1),
  });
  return cssText(css);
}
/** Inner markup of one printed item. */
function itemMarkup(item: Item, assets: Assets) {
  if (item.type === 'image') {
    const image = item.assetId ? assets[item.assetId]?.dataUrl : item.text;
    if (!image || !imageSource.test(image)) throw new Error(t('error.outputImage'));
    return `<img alt="" src="${escapeHtml(image)}">`;
  }
  const graphic = itemGraphic(item);
  if (graphic) return graphic;
  const cells = combCells(item);
  if (cells)
    return `<span class="comb">${cells.map((cell) => `<span class="comb-cell">${escapeHtml(cell)}</span>`).join('')}</span>`;
  return escapeHtml(item.text);
}
/**
 * Printable markup for every page. `guides` overrides showcase guide URLs with
 * embedded data URLs (used by the standalone export).
 */
/** One output page: its document, 0-based index, items (if any) and background. */
export type OutputPage = {
  entry: DocumentEntry;
  index: number;
  items: Item[];
  /** Background image URL when the background is printed, else ''. */
  background: string;
};

/**
 * Every page Print and the exports produce for a scope, in order. Documents also get
 * pages for the whole background (an uploaded PDF may have more pages than items).
 */
export function scopedPages(
  snapshot: OutputSnapshot,
  scope: OutputScope = FULL_SCOPE,
  guides: Record<number, string> = {},
): OutputPage[] {
  const { document, settings, pdf } = snapshot;
  const documentIds = scopedDocumentIds(document, scope);
  const pageNumbers = parsePageRange(scope.pages);
  return document.documents
    .filter((entry) => documentIds.has(entry.id))
    .flatMap((entry) => {
      const count = Math.max(
        entry.pages.length,
        overlayPageCount(settings.overlay, pdf.pages.length),
      );
      return Array.from({ length: count }, (_, index) => index)
        .filter((index) => !pageNumbers || pageNumbers.has(index + 1))
        .map((index) => {
          const source =
            (settings.overlay === 'doc_1' ? guides[index + 1] : undefined) ??
            overlaySource(settings.overlay, index + 1, pdf.pages);
          return {
            entry,
            index,
            items: entry.pages[index]?.items ?? [],
            background: settings.printOverlay ? source : '',
          };
        });
    });
}

export function outputPages(
  snapshot: OutputSnapshot,
  guides: Record<number, string> = {},
  scope: OutputScope = FULL_SCOPE,
) {
  const { assets, settings } = snapshot;
  return scopedPages(snapshot, scope, guides)
    .map(({ entry, index, items, background }) => {
      const overlay = background
        ? `<img class="output-overlay" alt="" src="${escapeHtml(background)}" style="opacity:${settings.overlayOpacity / 100}">`
        : '';
      const marks = settings.hideCalibration
        ? ''
        : ['tl', 'tr', 'bl', 'br']
            .map((position) => `<span class="output-cal ${position}">│ 10mm │</span>`)
            .join('');
      const markup = items
        .map(
          (item) =>
            `<div class="output-item" style="${escapeHtml(itemCss(item, settings))}">${itemMarkup(item, assets)}</div>`,
        )
        .join('');
      return `<section class="output-page" aria-label="${escapeHtml(t('output.pageLabel', { title: entry.title, number: index + 1 }))}">${overlay}${marks}${markup}</section>`;
    })
    .join('');
}
/** Number of pages Print and the exports produce for a scope. */
export const scopedPageCount = (snapshot: OutputSnapshot, scope: OutputScope) =>
  scopedPages(snapshot, scope).length;
export async function standaloneHtml(snapshot: OutputSnapshot, scope: OutputScope = FULL_SCOPE) {
  const guides: Record<number, string> = {};
  if (snapshot.settings.overlay === 'doc_1' && snapshot.settings.printOverlay)
    await Promise.all(
      Array.from({ length: SHOWCASE_GUIDE_PAGES }, async (_, index) => {
        const pageNumber = index + 1;
        const response = await fetch(guideSource(pageNumber));
        if (!response.ok) throw new Error(t('error.embedGuide'));
        guides[pageNumber] = await blobDataUrl(await response.blob());
      }),
    );
  let fontCss = '';
  const docs = snapshot.document.documents;
  const needsJakarta = docs.some((entry) =>
    entry.pages.some((page) =>
      page.items.some((item) => item.font_family?.startsWith('Plus Jakarta')),
    ),
  );
  if (needsJakarta) {
    const fonts = await Promise.all(
      ['400', '700'].map(async (weight) => {
        const response = await fetch(`/fonts/plus-jakarta-sans-latin-${weight}-normal.woff2`);
        if (!response.ok) throw new Error(t('error.embedFont'));
        return `@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:${weight};src:url(${await blobDataUrl(await response.blob())}) format('woff2')}`;
      }),
    );
    fontCss = fonts.join('');
  }
  return `<!doctype html><html lang="${getLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(docs[0]?.title ?? 'Kartesian')}</title><style>${fontCss}${outputCss(paperOf(snapshot.document))}</style></head><body>${outputPages(snapshot, guides, scope)}</body></html>`;
}
export function download(value: string | Blob, name: string, type = 'application/json') {
  const blob = typeof value === 'string' ? new Blob([value], { type }) : value;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
