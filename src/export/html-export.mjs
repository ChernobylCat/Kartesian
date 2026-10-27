import { APP_CONFIG } from '../config.mjs';
import { escapeHtml } from '../core/utils.mjs';

export function sanitizeExportFileName(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    const documentTitle = Array.isArray(data)
      ? data[0]?.title || data[0]?.name || data[0]?.debitur
      : null;
    if (typeof documentTitle !== 'string') return 'export';
    return (
      documentTitle
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '_') || 'export'
    );
  } catch {
    return 'export';
  }
}

export function blobToDataUrl(blob, FileReaderCtor = FileReader) {
  return new Promise((resolve, reject) => {
    const reader = new FileReaderCtor();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function makeImagePortable(
  src,
  {
    baseUrl = document.baseURI,
    documentRef = document,
    fetchFn = fetch,
    FileReaderCtor = FileReader,
    ImageCtor = Image,
  } = {},
) {
  if (!src || src.startsWith('data:image/')) return src;
  const absoluteUrl = new URL(src, baseUrl).href;

  try {
    const response = await fetchFn(absoluteUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return blobToDataUrl(await response.blob(), FileReaderCtor);
  } catch (fetchError) {
    return new Promise((resolve, reject) => {
      const image = new ImageCtor();
      image.onload = () => {
        try {
          const canvas = documentRef.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (canvasError) {
          reject(canvasError);
        }
      };
      image.onerror = () => reject(fetchError);
      image.src = absoluteUrl;
    });
  }
}

export async function serializeRenderedPages(
  pages,
  { hideCalibration = false, includeOverlay = false, portableImage = makeImagePortable } = {},
) {
  let pagesHtml = '';
  const portableImageCache = new Map();

  for (const page of pages) {
    let itemsHtml = '';

    if (includeOverlay) {
      const overlay = page.querySelector('.page-overlay-guide');
      if (overlay?.src) {
        let portableSrc = portableImageCache.get(overlay.src);
        if (!portableSrc) {
          portableSrc = await portableImage(overlay.src);
          portableImageCache.set(overlay.src, portableSrc);
        }
        const opacity = overlay.style.opacity || '0.5';
        itemsHtml += `<img class="page-background" src="${escapeHtml(portableSrc)}" alt="" style="opacity:${escapeHtml(opacity)};" />\n`;
      }
    }

    if (!hideCalibration) {
      page.querySelectorAll('.cal-mark').forEach((mark) => {
        const style = mark.getAttribute('style') || '';
        const classes = mark.className.replace('print-item', '').replace('cal-mark', '').trim();
        itemsHtml += `<div class="print-item cal-mark ${escapeHtml(classes)}" style="${escapeHtml(style)}">${mark.innerHTML}</div>\n`;
      });
    }

    page.querySelectorAll('.data-item').forEach((item) => {
      const style = item.getAttribute('style') || '';
      const image = item.querySelector('img');
      if (image) {
        const src = image.getAttribute('src') || '';
        const imageStyle = image.getAttribute('style') || '';
        itemsHtml += `<div class="print-item data-item" style="${escapeHtml(style)}"><img src="${escapeHtml(src)}" alt="" style="${escapeHtml(imageStyle)}" /></div>\n`;
      } else {
        const textSpan = item.querySelector('.text-content');
        const text = textSpan ? textSpan.textContent : item.textContent;
        itemsHtml += `<div class="print-item data-item" style="${escapeHtml(style)}">${escapeHtml(text)}</div>\n`;
      }
    });

    pagesHtml += `<div class="print-page">${itemsHtml}</div>\n`;
  }

  return pagesHtml;
}

export function buildStandaloneExportHtml({
  pagesHtml,
  fileName,
  offsetX = 0,
  offsetY = 0,
  paperWidth = APP_CONFIG.PAPER_WIDTH_MM,
  paperHeight = APP_CONFIG.PAPER_HEIGHT_MM,
}) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Export - ${escapeHtml(fileName)}</title>
    <style>
        :root {
            --offset-x: ${offsetX}mm;
            --offset-y: ${offsetY}mm;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', Courier, monospace;
            background: #f1f5f9;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 40px;
            padding: 40px 20px;
        }
        .print-page {
            position: relative;
            width: ${paperWidth}mm;
            height: ${paperHeight}mm;
            background-color: #ffffff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        }
        .print-item {
            position: absolute;
            font-family: 'Courier New', Courier, monospace;
            font-size: 9pt;
            font-weight: bold;
            color: #000000;
            z-index: 1;
        }
        .data-item { --item-rotation:0deg; transform:translate(var(--offset-x), var(--offset-y)) rotate(var(--item-rotation)); transform-origin:center; }
        .page-background { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; z-index:0; }
        .cal-mark { color:#ef4444; font-size:10pt; line-height:1.2; z-index:2; }
        .cal-tl { top:10mm; left:10mm; }
        .cal-tr { top:10mm; right:10mm; text-align:right; }
        .cal-bl { bottom:10mm; left:10mm; }
        .cal-br { bottom:10mm; right:10mm; text-align:right; }
        img { object-fit:contain; display:block; }
        @media print {
            @page { size:${paperWidth}mm ${paperHeight}mm; margin:0; }
            body { background:none !important; padding:0; gap:0; }
            .print-page { box-shadow:none; page-break-after:always; break-after:page; }
            .print-page:last-child { page-break-after:avoid; break-after:avoid; }
        }
    </style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

export function downloadHtml(
  html,
  fileName,
  { BlobCtor = Blob, URLApi = URL, documentRef = document } = {},
) {
  const blob = new BlobCtor([html], { type: 'text/html;charset=utf-8' });
  const url = URLApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}_export.html`;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URLApi.revokeObjectURL(url);
}
