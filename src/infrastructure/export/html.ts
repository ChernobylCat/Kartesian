import type { OutputSnapshot } from '@/application/ports';
import type { Item, Settings } from '@/domain/document/model';
import { imageSource } from '@/domain/document/schema';
import { blobDataUrl } from '../storage/workspace';
import { guideSource } from '../pdf/pdf-runtime';

export const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export const OUTPUT_CSS = `@page{size:210mm 330mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}.output-page{width:210mm;height:330mm;position:relative;overflow:hidden;background:white;color:#111827;break-after:page;page-break-after:always}.output-page:last-child{break-after:auto;page-break-after:auto}.output-item{position:absolute;white-space:pre-wrap;line-height:1.5;transform-origin:center}.output-item img{width:100%;height:100%;object-fit:contain}.output-overlay{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;pointer-events:none}.output-cal{position:absolute;font:6pt Arial;color:#888}.output-cal.tl{left:10mm;top:10mm}.output-cal.tr{right:10mm;top:10mm}.output-cal.bl{left:10mm;bottom:10mm}.output-cal.br{right:10mm;bottom:10mm}@media screen{body{background:#e2e8f0}.output-page{margin:20px auto;box-shadow:0 2px 12px #0002}}`;
export function itemCss(item: Item, settings: Settings) {
  const styles: Record<string, string | number | undefined> = {
    left: `${item.x}mm`,
    top: `${item.y}mm`,
    width: item.width ? `${item.width}mm` : undefined,
    height: item.height ? `${item.height}mm` : undefined,
    'font-family': item.font_family ?? 'Courier New, Courier, monospace',
    'font-size': `${item.font_size ?? 10}pt`,
    'font-weight': item.bold === false ? '400' : '700',
    'font-style': item.italic ? 'italic' : 'normal',
    'text-decoration': item.underline ? 'underline' : 'none',
    color: item.color ?? '#000000',
    'background-color': item.bg_color,
    transform: `translate(${settings.offsetX}mm,${settings.offsetY}mm) rotate(${item.rotation ?? 0}deg)`,
    'z-index': item.z_index ?? 1,
  };
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}
export function outputPages(snapshot: OutputSnapshot, guides: Record<number, string> = {}) {
  const { document, assets, settings, pdf } = snapshot;
  return document.debtors
    .flatMap((entry) => {
      const count = Math.max(
        entry.pages.length,
        settings.overlay === 'doc_1'
          ? 1
          : settings.overlay === 'uploaded_pdf'
            ? pdf.pages.length
            : 0,
      );
      return Array.from({ length: count }, (_, index) => {
        const page = entry.pages[index];
        const source =
          settings.overlay === 'doc_1'
            ? (guides[index + 1] ?? guideSource(index + 1))
            : settings.overlay === 'uploaded_pdf'
              ? pdf.pages[index]
              : '';
        const overlay =
          settings.printOverlay && source
            ? `<img class="output-overlay" alt="" src="${escape(source)}" style="opacity:${settings.overlayOpacity / 100}">`
            : '';
        const marks = settings.hideCalibration
          ? ''
          : ['tl', 'tr', 'bl', 'br']
              .map((position) => `<span class="output-cal ${position}">│ 10mm │</span>`)
              .join('');
        const items = (page?.items ?? [])
          .map((item) => {
            const image = item.assetId ? assets[item.assetId]?.dataUrl : item.text;
            if (item.type === 'image' && (!image || !imageSource.test(image)))
              throw new Error('Gambar output tidak valid.');
            return `<div class="output-item" style="${escape(itemCss(item, settings))}">${item.type === 'image' ? `<img alt="" src="${escape(image)}">` : escape(item.text)}</div>`;
          })
          .join('');
        return `<section class="output-page" aria-label="${escape(entry.title)} halaman ${index + 1}">${overlay}${marks}${items}</section>`;
      });
    })
    .join('');
}
export async function standaloneHtml(snapshot: OutputSnapshot) {
  const guides: Record<number, string> = {};
  if (snapshot.settings.overlay === 'doc_1' && snapshot.settings.printOverlay)
    await Promise.all(
      Array.from({ length: 1 }, async (_, index) => {
        const response = await fetch(guideSource(index + 1));
        if (!response.ok) throw new Error('Guide gagal disematkan.');
        guides[index + 1] = await blobDataUrl(await response.blob());
      }),
    );
  let fontCss = '';
  const needsJakarta = snapshot.document.debtors.some((entry) =>
    entry.pages.some((page) =>
      page.items.some((item) => item.font_family?.startsWith('Plus Jakarta')),
    ),
  );
  if (needsJakarta) {
    const fonts = await Promise.all(
      ['400', '700'].map(async (weight) => {
        const response = await fetch(`/fonts/plus-jakarta-sans-latin-${weight}-normal.woff2`);
        if (!response.ok) throw new Error('Font gagal disematkan.');
        return `@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:${weight};src:url(${await blobDataUrl(await response.blob())}) format('woff2')}`;
      }),
    );
    fontCss = fonts.join('');
  }
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(snapshot.document.debtors[0]?.title ?? 'Kartesian')}</title><style>${fontCss}${OUTPUT_CSS}</style></head><body>${outputPages(snapshot, guides)}</body></html>`;
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
