const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const os = require('node:os');
const { chromium } = require('@playwright/test');
const { start } = require('../build/serve-next.cjs');
const { pdfFixture } = require('../../tests/support/pdf-fixtures.cjs');
const { skipOnboarding } = require('../../tests/support/onboarding.cjs');

function dataset(documents, pages, items) {
  return Array.from({ length: documents }, (_, di) => ({
    title: `Dokumen ${di + 1}`,
    pages: Array.from({ length: pages }, (_, pi) => ({
      page_number: pi + 1,
      items: Array.from({ length: items }, (_, ii) => ({
        text: `Teks ${ii}`,
        x: 10 + (ii % 10) * 15,
        y: 15 + Math.floor(ii / 10) * 15,
        font_size: 8,
      })),
    })),
  }));
}
function emptyPdf(pageCount) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];
  for (let i = 0; i < pageCount; i++)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents ${4 + 2 * i} 0 R >>`,
      '<< /Length 0 >>\nstream\n\nendstream',
    );
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  return Buffer.from(
    source + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
};

(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const server = await start(0);
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const report = {
    date: new Date().toISOString(),
    node: process.version,
    machine: {
      platform: os.platform(),
      cpu: os.cpus()[0]?.model,
      memoryGiB: Math.round(os.totalmem() / 1024 ** 3),
    },
    browser: '',
    methodology:
      'Microsoft Edge/Chromium headless, loopback origin, service workers blocked to isolate editor profiling; offline is tested separately in E2E.',
    datasets: {},
  };
  try {
    browser = await chromium.launch(process.env.CI ? {} : { channel: 'msedge' });
    report.browser = browser.version();
    async function open(data) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: 'block',
      });
      await skipOnboarding(context);
      await context.addInitScript((value) => {
        const workers = new Set();
        const objectUrls = new Set();
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(...args) {
            super(...args);
            workers.add(this);
          }
          terminate() {
            workers.delete(this);
            return super.terminate();
          }
        };
        const create = URL.createObjectURL.bind(URL),
          revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
          const url = create(blob);
          objectUrls.add(url);
          return url;
        };
        URL.revokeObjectURL = (url) => {
          objectUrls.delete(url);
          return revoke(url);
        };
        window.__resourceCounts = () => ({
          activeWorkers: workers.size,
          objectUrls: objectUrls.size,
          fontFaces: document.fonts.size,
        });
        localStorage.setItem(
          'overlay_print_pro_settings',
          JSON.stringify({
            schemaVersion: 1,
            jsonInput: JSON.stringify(value),
            overlayDoc: 'none',
          }),
        );
      }, data);
      const page = await context.newPage();
      page.on('dialog', (dialog) => dialog.accept());
      const begin = performance.now();
      await page.goto(`${baseURL}/editor/`);
      await page.locator('.canvas-page').first().waitFor();
      await page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
      return { context, page, startupMs: performance.now() - begin };
    }
    async function counts(page) {
      return page.evaluate(() => ({
        mountedPages: document.querySelectorAll('.canvas-page').length,
        pagePlaceholders: document.querySelectorAll('.page-wrapper').length,
        printPages: document.querySelectorAll('.output-page').length,
        printItems: document.querySelectorAll('.output-item').length,
        domNodes: document.querySelectorAll('*').length,
      }));
    }
    const d1 = await open(dataset(1, 1, 100));
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const begin = performance.now();
      await d1.page.reload();
      await d1.page.locator('.canvas-page').first().waitFor();
      await d1.page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
      samples.push(performance.now() - begin);
    }
    report.datasets.D1 = {
      coldStartupMs: d1.startupMs,
      warmSamplesMs: samples,
      warmP95Ms: percentile(samples, 0.95),
      ...(await counts(d1.page)),
    };
    await d1.context.close();

    const d2 = await open(dataset(5, 10, 100));
    await d2.page.evaluate(() => {
      window.__frames = [];
      window.__sampling = true;
      function tick(time) {
        if (!window.__sampling) return;
        window.__frames.push(time);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const item = d2.page.locator('.canvas-item').first();
    const box = await item.boundingBox();
    await d2.page.mouse.move(box.x + 3, box.y + 3);
    await d2.page.mouse.down();
    for (let i = 1; i <= 45; i++) await d2.page.mouse.move(box.x + 3 + i, box.y + 3 + i / 2);
    await d2.page.mouse.up();
    await d2.page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
    const intervals = await d2.page.evaluate(() => {
      window.__sampling = false;
      return window.__frames.slice(1).map((time, index) => time - window.__frames[index]);
    });
    report.datasets.D2 = {
      startupMs: d2.startupMs,
      frameSamples: intervals.length,
      frameIntervalP95Ms: percentile(intervals, 0.95),
      frameIntervalMaxMs: Math.max(...intervals),
      ...(await counts(d2.page)),
    };
    await d2.context.close();

    const d3 = await open(dataset(1, 1, 1));
    await d3.page.getByLabel('Mode scan').selectOption('pdfjs');
    const pdfInput = d3.page.locator('input[type=file][accept="application/pdf,.pdf"]');
    let begin = performance.now();
    await pdfInput.setInputFiles({
      name: '50-pages.pdf',
      mimeType: 'application/pdf',
      buffer: emptyPdf(50),
    });
    await d3.page
      .getByRole('dialog', { name: 'Tinjau kandidat field' })
      .waitFor({ timeout: 60000 });
    report.datasets.D3 = {
      renderAndScan50PagesMs: performance.now() - begin,
      ...(await counts(d3.page)),
    };
    await d3.page.getByRole('button', { name: 'Tutup dialog', exact: true }).click();
    await d3.page.getByRole('button', { name: 'Hapus PDF', exact: true }).click();
    await d3.page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
    const cdp = await d3.context.newCDPSession(d3.page);
    const heap = [];
    const resourceSamples = [];
    for (let i = 0; i < 10; i++) {
      await pdfInput.setInputFiles({
        name: 'cycle.pdf',
        mimeType: 'application/pdf',
        buffer: pdfFixture(),
      });
      await d3.page.getByRole('dialog', { name: 'Tinjau kandidat field' }).waitFor();
      await d3.page.getByRole('button', { name: 'Tutup dialog', exact: true }).click();
      await d3.page.getByRole('button', { name: 'Hapus PDF', exact: true }).click();
      await d3.page.getByText('Tersimpan di perangkat', { exact: true }).waitFor();
      await cdp.send('HeapProfiler.collectGarbage');
      heap.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
      resourceSamples.push({
        ...(await cdp.send('Memory.getDOMCounters')),
        ...(await d3.page.evaluate(() => window.__resourceCounts())),
      });
    }
    report.datasets.D3.pdfOpenDeleteHeapBytes = heap;
    report.datasets.D3.heapTrendLastMinusFirstBytes = heap.at(-1) - heap[0];
    report.datasets.D3.resourceSamples = resourceSamples;
    await d3.context.close();

    const d4 = await open(dataset(100, 100, 0));
    report.datasets.D4 = { startupMs: d4.startupMs, ...(await counts(d4.page)) };
    await d4.context.close();
    fs.writeFileSync('test-results/next-performance.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
