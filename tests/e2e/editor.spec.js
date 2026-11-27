const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { pdfFixture } = require('../support/pdf-fixtures.cjs');
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/valid-text.json', 'utf8'));

async function expectSquareMarker(page, locator) {
  const screenshot = await locator.screenshot();
  const bounds = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = Infinity,
      right = -1,
      top = Infinity,
      bottom = -1;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 220 && data[i + 1] < 210 && data[i + 2] > 220) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    return { width: right - left + 1, height: bottom - top + 1 };
  }, screenshot.toString('base64'));
  expect(bounds.width).toBeGreaterThan(10);
  expect(bounds.height).toBeGreaterThan(10);
  expect(Math.abs(bounds.width - bounds.height)).toBeLessThanOrEqual(2);
}

test('bundled background keeps its source ratio on the F4 sheet at 75% zoom', async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole('combobox', { name: 'Background', exact: true }).selectOption('doc_1');
  await page.getByLabel('Zoom canvas').selectOption('0.75');
  const background = page.locator('.canvas-overlay').first();
  await expect(background).toHaveCSS('object-fit', 'contain');
  await expect(background).toHaveCSS('object-position', '50% 50%');
  await expect.poll(() => background.evaluate((image) => image.naturalWidth)).toBe(1700);
  expect(await background.evaluate((image) => image.naturalHeight)).toBe(2600);
  const sheet = await page.locator('.canvas-page').first().boundingBox();
  expect(sheet.width).toBeCloseTo(((210 * 96) / 25.4) * 0.75, 0);
  expect(sheet.height).toBeCloseTo(((330 * 96) / 25.4) * 0.75, 0);
  await page.setViewportSize({ width: 647, height: 712 });
  await page
    .locator('#printContainer')
    .evaluate((node) => window.scrollBy(0, node.getBoundingClientRect().top - 125));
  await expect(page.locator('.canvas-overlay').first()).toBeVisible();
  await page.screenshot({ path: `test-results/background-fixed-${testInfo.project.name}.png` });
});

for (const shape of [
  { name: 'A4 portrait', width: 595, height: 842 },
  { name: 'narrow portrait', width: 400, height: 1000 },
  { name: 'landscape', width: 960, height: 612 },
  { name: 'square', width: 960, height: 960 },
  { name: 'rotated portrait', width: 612, height: 960, rotation: 90 },
])
  test(`PDF background ${shape.name} stays proportional and fields align in all outputs`, async ({
    page,
    context,
  }) => {
    await ready(page);
    // Keep the entire preview below the sticky toolbar for pixel measurements.
    await page.getByLabel('Zoom canvas').selectOption('0.5');
    await page.getByLabel('Mode scan').selectOption('pdfjs');
    await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles({
      name: 'shape.pdf',
      mimeType: 'application/pdf',
      buffer: pdfFixture({ ...shape, marker: true }),
    });
    await expect(page.getByLabel('Key placeholder').filter({ visible: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Tutup dialog' }).click();
    await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
    const saved = await stored(page);
    const raw = saved.pdf.candidates.find((candidate) => candidate.key === 'tanggal_lahir');
    expect(raw).toBeTruthy();
    const size = await page
      .locator('.canvas-overlay')
      .evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
    const scale = Math.min(210 / size.width, 330 / size.height);
    const fitted = {
      x: (210 - size.width * scale) / 2 + (raw.x / 210) * size.width * scale,
      y: (330 - size.height * scale) / 2 + (raw.y / 330) * size.height * scale,
    };
    const sheet = await page.locator('.canvas-page').boundingBox();
    const suggestion = await page
      .locator('.field-suggestion')
      .filter({ hasText: raw.label })
      .first()
      .boundingBox();
    expect(((suggestion.x - sheet.x) / sheet.width) * 210).toBeCloseTo(fitted.x, 1);
    expect(((suggestion.y - sheet.y) / sheet.height) * 330).toBeCloseTo(fitted.y, 1);
    await expectSquareMarker(page, page.locator('.canvas-page'));
    await page.reload();
    await expect(page.locator('.canvas-overlay')).toHaveCSS('object-fit', 'contain');
    await page.getByRole('button', { name: /Tinjau \(/ }).click();
    await expect(page.getByLabel('Key placeholder').first()).toBeVisible();
    await page.getByRole('button', { name: 'Pilih semua', exact: true }).click();
    await page.getByRole('button', { name: /Terapkan \d+ field/ }).click();
    await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
    const applied = (await stored(page)).document.documents[0].pages[0].items.find(
      (item) => item.text === '{{tanggal_lahir}}',
    );
    expect(applied.x).toBeCloseTo(fitted.x, 1);
    expect(applied.y).toBeCloseTo(fitted.y, 1);
    await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
    await page.getByLabel('Sertakan background saat cetak').check();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.output-overlay')).toHaveCSS('object-fit', 'contain');
    await expectSquareMarker(page, page.locator('.output-page'));
    await page.emulateMedia({ media: 'screen' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Ekspor HTML' }).click(),
    ]);
    const exported = await context.newPage();
    try {
      await exported.setContent(fs.readFileSync(await download.path(), 'utf8'));
      await expect(exported.locator('.output-overlay')).toHaveCSS('object-fit', 'contain');
      await expectSquareMarker(exported, exported.locator('.output-page'));
    } finally {
      await exported.close();
    }
  });

test('rotated resize preserves the opposite handle in page coordinates', async ({ page }) => {
  await ready(page);
  const item = page.locator('.canvas-item').first();
  await item.click();
  for (const [name, value] of [
    ['Lebar · mm', '40'],
    ['Tinggi · mm', '10'],
    ['Rotasi · °', '90'],
  ]) {
    await page.getByLabel(name, { exact: true }).fill(value);
    await page.getByLabel(name, { exact: true }).press('Enter');
  }
  const west = await item.locator('[data-resize="w"]').boundingBox();
  const east = await item.locator('[data-resize="e"]').boundingBox();
  await page.mouse.move(east.x + east.width / 2, east.y + east.height / 2);
  await page.mouse.down();
  await page.mouse.move(east.x + east.width / 2, east.y + east.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const after = await item.locator('[data-resize="w"]').boundingBox();
  expect(Math.abs(after.x - west.x) + Math.abs(after.y - west.y)).toBeLessThan(0.8);
  expect(Number(await page.getByLabel('Lebar · mm', { exact: true }).inputValue())).toBeGreaterThan(
    40,
  );
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
});

test('storage failure rolls back the transaction and still permits a complete backup', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    window.__originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'assets')
        throw new DOMException('Simulated asset quota failure', 'QuotaExceededError');
      return window.__originalPut.call(this, value, ...args);
    };
  });
  const source = JSON.parse(fs.readFileSync('tests/fixtures/valid-image.json', 'utf8'))[0].pages[0]
    .items[0].text;
  await page.getByRole('button', { name: 'Gambar', exact: true }).click();
  await page
    .locator('input[type=file][accept="image/png,image/jpeg,image/webp,image/gif"]')
    .setInputFiles({
      name: 'image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(source.split(',')[1], 'base64'),
    });
  await expect(page.getByText('Gagal menyimpan', { exact: true })).toBeVisible();
  expect((await stored(page)).document.documents[0].pages[0].items).toHaveLength(1);
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup workspace lengkap' }).click(),
  ]);
  const payload = JSON.parse(JSON.parse(fs.readFileSync(await backup.path(), 'utf8')).payload);
  expect(payload.document.documents[0].pages[0].items).toHaveLength(2);
  expect(Object.keys(payload.assets)).toHaveLength(1);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.__originalPut;
  });
  await page.getByRole('button', { name: 'Coba simpan', exact: true }).click();
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-item img')).toHaveCount(1);
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('kartesian_onboarding_complete_v1', 'true');
    if (!localStorage.getItem('overlay_print_pro_settings'))
      localStorage.setItem(
        'overlay_print_pro_settings',
        JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(data), overlayDoc: 'none' }),
      );
  }, fixture);
  page.on('dialog', (dialog) => dialog.accept());
});
async function ready(page, url = '/editor/') {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Kartesian', exact: true })).toBeVisible();
  await expect(page.locator('.canvas-item')).toHaveCount(1);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
}
async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('KartesianWorkspaceDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const value = await new Promise((resolve, reject) => {
      const req = db.transaction('workspaces').objectStore('workspaces').get('active');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  });
}
test('migrates non-destructively; add, undo/redo and reload persist', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  const original = await page.evaluate(() => localStorage.getItem('overlay_print_pro_settings'));
  await page.getByRole('button', { name: 'Teks', exact: true }).click();
  await expect(page.locator('.canvas-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.canvas-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.canvas-item')).toHaveCount(2);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-item')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('overlay_print_pro_settings'))).toBe(
    original,
  );
  expect(errors).toEqual([]);
});
test('selection, drag, resize, inline edit and property panel', async ({ page }) => {
  await ready(page);
  const item = page.locator('.canvas-item').first();
  await item.click();
  await expect(page.getByText('1 elemen terpilih')).toBeVisible();
  const before = await item.boundingBox();
  await page.mouse.move(before.x + 5, before.y + 5);
  await page.mouse.down();
  await page.mouse.move(before.x + 35, before.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await item.evaluate((element) => parseFloat(element.style.left))))
    .toBeGreaterThan(20);
  const handle = item.locator('[data-resize="se"]');
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + 3, handleBox.y + 3);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 50, handleBox.y + 25, { steps: 4 });
  await page.mouse.up();
  await expect(item).toHaveCSS('width', /px$/);
  await item.dblclick();
  const text = item.locator('[contenteditable=true]');
  await text.fill('Teks diperbarui');
  await text.press('Enter');
  await expect(item).toContainText('Teks diperbarui');
  await page.getByLabel('X · mm', { exact: true }).fill('42');
  await page.getByLabel('X · mm', { exact: true }).press('Enter');
  await expect
    .poll(async () => item.evaluate((element) => parseFloat(element.style.left)))
    .toBe(42);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  expect((await stored(page)).document.documents[0].pages[0].items[0].text).toBe('Teks diperbarui');
});
test('invalid JSON blocks output and preserves saved document', async ({ page }) => {
  await ready(page);
  await page.getByText('Data JSON', { exact: true }).click();
  await expect(page.locator('.ace_editor')).toBeVisible();
  await page.evaluate(() => window.ace.edit(document.querySelector('.ace-host')).setValue('{', -1));
  await expect(page.getByRole('button', { name: 'Cetak', exact: true })).toBeDisabled();
  await expect(page.locator('.canvas-item')).toHaveCount(1);
  await page.evaluate(
    (data) =>
      window.ace.edit(document.querySelector('.ace-host')).setValue(JSON.stringify(data), -1),
    fixture,
  );
  await expect(page.getByRole('button', { name: 'Cetak', exact: true })).toBeEnabled();
});
test('portable HTML includes all pages; backup restores assets and settings', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Tambah halaman' }).click();
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor HTML' }).click(),
  ]);
  const html = fs.readFileSync(await exported.path(), 'utf8');
  expect(html.match(/class="output-page"/g)).toHaveLength(2);
  expect(html).not.toContain('/_next/');
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup workspace lengkap' }).click(),
  ]);
  const raw = fs.readFileSync(await backup.path(), 'utf8');
  expect(JSON.parse(raw).format).toBe('kartesian-workspace');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.canvas-item')).toHaveCount(0);
  const input = page.locator('input[type=file][accept="application/json,.json"]');
  await input.setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(page.locator('.canvas-item')).toHaveCount(1);
  await expect(page.getByText('Data berhasil dipulihkan.')).toBeVisible();
});
test('PDF worker, field review, apply and undo work without local Python', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Mode scan').selectOption('pdfjs');
  await page
    .locator('input[type=file][accept="application/pdf,.pdf"]')
    .setInputFiles({ name: 'fields.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
  await expect(page.getByRole('dialog', { name: 'Tinjau kandidat field' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByLabel('Key placeholder').first()).toBeVisible();
  await page.getByRole('button', { name: 'Pilih semua', exact: true }).click();
  await page.getByRole('button', { name: /Terapkan \d+ field/ }).click();
  await expect.poll(() => page.locator('.canvas-item').count()).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.canvas-item')).toHaveCount(1);
  await expect(page.locator('.canvas-overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Hapus PDF', exact: true }).click();
  await expect(page.locator('.canvas-overlay')).toHaveCount(0);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hapus PDF', exact: true })).toHaveCount(0);
});
test('second tab is read-only and supports safe handover', async ({ page, context }) => {
  await ready(page);
  const second = await context.newPage();
  await second.goto('/editor/');
  await expect(second.getByText(/Workspace hanya-baca/)).toBeVisible();
  await second.getByRole('button', { name: 'Ambil alih' }).click();
  await expect(second.getByText(/Workspace hanya-baca/)).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Teks', exact: true })).toBeEnabled();
  await expect(page.getByText(/Workspace hanya-baca/)).toBeVisible();
  await second.close();
});
test('offline cold start has lazy editor, PDF and bundled assets', async ({ page }) => {
  // Stop the actual origin: Playwright WebKit's offline-emulation flag blocks
  // service-worker responses before dispatch (microsoft/playwright#42775).
  const server = await require('../../scripts/build/serve-next.cjs').start(0);
  const port = server.address().port;
  let stopped = false;
  try {
    await ready(page, `http://127.0.0.1:${port}/editor/`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(async () => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    stopped = true;
    await page.reload();
    await expect(page.locator('.canvas-item')).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        fetch('/__network-probe__').then(
          () => false,
          () => true,
        ),
      ),
    ).toBe(true);
    await page.getByText('Data JSON', { exact: true }).click();
    await expect(page.locator('.ace_editor')).toBeVisible();
    await page.getByLabel('Mode scan').selectOption('pdfjs');
    await page
      .locator('input[type=file][accept="application/pdf,.pdf"]')
      .setInputFiles({ name: 'offline.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
    await expect(page.getByRole('dialog', { name: 'Tinjau kandidat field' })).toBeVisible({
      timeout: 30000,
    });
  } finally {
    if (!stopped)
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
  }
});
test('large documents virtualize screen pages and keep full print output', async ({ page }) => {
  const data = Array.from({ length: 5 }, (_, index) => ({
    title: `Dokumen ${index}`,
    pages: Array.from({ length: 10 }, (_, page) => ({
      page_number: page + 1,
      items: Array.from({ length: 100 }, (_, item) => ({
        text: `Item ${item}`,
        x: 10 + (item % 10) * 15,
        y: 15 + Math.floor(item / 10) * 15,
        font_size: 8,
      })),
    })),
  }));
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        'overlay_print_pro_settings',
        JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(value), overlayDoc: 'none' }),
      ),
    data,
  );
  await page.goto('/editor/');
  await expect(page.locator('.page-wrapper')).toHaveCount(50);
  await expect.poll(() => page.locator('.canvas-page').count()).toBeLessThan(7);
  await expect(page.locator('.print-surface .output-page')).toHaveCount(50);
  await expect(page.locator('.print-surface .output-item')).toHaveCount(5000);
});
test('image upload, lossless backup and checksum failure preserve the current model', async ({
  page,
}) => {
  await ready(page);
  const image = JSON.parse(fs.readFileSync('tests/fixtures/valid-image.json', 'utf8'))[0].pages[0]
    .items[0].text;
  const [, base64] = image.split(',');
  await page.getByRole('button', { name: 'Gambar', exact: true }).click();
  await page
    .locator('input[type=file][accept="image/png,image/jpeg,image/webp,image/gif"]')
    .setInputFiles({
      name: 'image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(base64, 'base64'),
    });
  await expect(page.locator('.canvas-item img')).toHaveCount(1);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup workspace lengkap' }).click(),
  ]);
  const envelope = JSON.parse(fs.readFileSync(await backup.path(), 'utf8'));
  envelope.checksum = 'broken';
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await expect(page.getByText('Checksum backup tidak cocok.')).toBeVisible();
  await expect(page.locator('.canvas-item img')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.canvas-item img')).toHaveCount(1);
});
test('print geometry, calibration, theme and accessible desktop shell', async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  const item = page.locator('.canvas-item').first();
  const original = await item.boundingBox();
  await page.getByLabel('Offset X · mm').fill('2');
  await page.getByLabel('Offset X · mm').press('Enter');
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  const after = await item.boundingBox();
  expect(Math.abs(after.x - original.x)).toBeLessThan(0.1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.editor-app')).toBeHidden();
  const sheet = await page.locator('.output-page').first().boundingBox();
  expect(Math.abs(sheet.width - (210 * 96) / 25.4)).toBeLessThan(0.5);
  expect(Math.abs(sheet.height - (330 * 96) / 25.4)).toBeLessThan(0.5);
  const printed = await page.locator('.output-item').first().boundingBox();
  expect(Math.abs(printed.x - (22 * 96) / 25.4)).toBeLessThan(0.4);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await page.screenshot({
    path: `test-results/next-editor-${testInfo.project.name}.png`,
    fullPage: false,
  });
});
test('recovers invalid legacy storage without replacing it with demo data', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('overlay_print_pro_settings', '{"schemaVersion":99}'),
  );
  await page.goto('/editor/');
  await expect(page.getByRole('heading', { name: 'Workspace memerlukan pemulihan' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('overlay_print_pro_settings'))).toBe(
    '{"schemaVersion":99}',
  );
});
test('text print metrics render with precise typography and geometry', async ({
  page,
  browserName,
}) => {
  await ready(page);
  await page.emulateMedia({ media: 'print' });
  const current = await page
    .locator('.output-item')
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const sheet = element.closest('.output-page').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const css = getComputedStyle(element);
      return {
        x: rect.x - sheet.x,
        y: rect.y - sheet.y,
        textX: text.x - sheet.x,
        textY: text.y - sheet.y,
        textHeight: text.height,
        font: css.fontFamily,
        fontSize: css.fontSize,
        weight: css.fontWeight,
      };
    });
  if (browserName === 'chromium')
    await page.pdf({
      path: 'test-results/next-print.pdf',
      preferCSSPageSize: true,
      printBackground: true,
    });
  expect(current.x).toBeGreaterThan(0);
  expect(current.y).toBeGreaterThan(0);
  expect(current.textHeight).toBeGreaterThan(0);
  expect(parseFloat(current.fontSize)).toBeGreaterThan(0);
});
test('marquee, multi-selection, alignment, locking and keyboard nudge transact correctly', async ({
  page,
}) => {
  const data = [
    {
      title: 'Selection fixture',
      pages: [
        {
          page_number: 1,
          items: [
            { text: 'First', x: 20, y: 30, width: 20, height: 8 },
            { text: 'Second', x: 70, y: 60, width: 20, height: 8 },
            { text: 'Third', x: 110, y: 90, width: 20, height: 8 },
          ],
        },
      ],
    },
  ];
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        'overlay_print_pro_settings',
        JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(value), overlayDoc: 'none' }),
      ),
    data,
  );
  await page.goto('/editor/');
  await expect(page.locator('.canvas-item')).toHaveCount(3);
  const sheet = await page.locator('.canvas-page').boundingBox();
  const point = (x, y) => ({
    x: sheet.x + (x / 210) * sheet.width,
    y: sheet.y + (y / 330) * sheet.height,
  });
  const start = point(10, 20),
    end = point(150, 115);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.canvas-item.selected')).toHaveCount(3);
  await page.keyboard.press('Alt+a');
  await expect
    .poll(() =>
      page
        .locator('.canvas-item')
        .evaluateAll((nodes) => nodes.map((node) => parseFloat(node.style.left))),
    )
    .toEqual([20, 20, 20]);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      page
        .locator('.canvas-item')
        .evaluateAll((nodes) => nodes.map((node) => parseFloat(node.style.left))),
    )
    .toEqual([20.1, 20.1, 20.1]);
  await page.keyboard.press('Control+z');
  await expect
    .poll(() =>
      page
        .locator('.canvas-item')
        .evaluateAll((nodes) => nodes.map((node) => parseFloat(node.style.left))),
    )
    .toEqual([20, 20, 20]);
  await page.locator('.canvas-item').first().click();
  await page.keyboard.press('Alt+l');
  await expect(page.locator('.canvas-item.locked')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      page
        .locator('.canvas-item')
        .first()
        .evaluate((node) => parseFloat(node.style.left)),
    )
    .toBe(20);
});
test('legacy worker upgrade vetoes invalid drafts, then activates without losing data', async ({
  page,
}) => {
  const server = await require('../../scripts/build/serve-next.cjs').start(0);
  const handler = server.listeners('request')[0];
  let legacy = true;
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (legacy && req.url.startsWith('/sw.js')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      res.end(
        "const C='kartesian-v13';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['/','/index.html'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});",
      );
    } else handler(req, res);
  });
  try {
    await ready(page, `http://127.0.0.1:${server.address().port}/editor/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    legacy = false;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await expect(page.getByRole('button', { name: 'Perbarui aplikasi' })).toBeVisible({
      timeout: 20000,
    });
    await page.getByText('Data JSON', { exact: true }).click();
    await expect(page.locator('.ace_editor')).toBeVisible();
    await page.evaluate(() =>
      window.ace.edit(document.querySelector('.ace-host')).setValue('{', -1),
    );
    await page.getByRole('button', { name: 'Perbarui aplikasi' }).click();
    await expect(page.getByText(/Update ditunda/)).toBeVisible();
    expect(
      await page.evaluate(() => caches.keys().then((keys) => keys.includes('kartesian-v13'))),
    ).toBe(true);
    await page.evaluate(
      (value) =>
        window.ace.edit(document.querySelector('.ace-host')).setValue(JSON.stringify(value), -1),
      fixture,
    );
    await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Perbarui aplikasi' }).click(),
    ]);
    await expect(page.locator('.canvas-item')).toHaveCount(1);
    expect(
      await page.evaluate(() => caches.keys().then((keys) => keys.includes('kartesian-v13'))),
    ).toBe(false);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
test('migrates original PDF bytes and cached pages without modifying the legacy database', async ({
  page,
}) => {
  const bytes = [...pdfFixture()];
  const image = JSON.parse(fs.readFileSync('tests/fixtures/valid-image.json', 'utf8'))[0].pages[0]
    .items[0].text;
  await page.addInitScript(
    async ({ bytes, image }) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('OverlayPrintProDB', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('pdf_overlays'))
            req.result.createObjectStore('pdf_overlays', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pdf_overlays', 'readwrite');
        tx.objectStore('pdf_overlays').put({
          id: 'active_pdf',
          pages: [image],
          candidates: [],
          pdfData: new Uint8Array(bytes),
          fileName: 'legacy-fields.pdf',
          timestamp: 1,
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { bytes, image },
  );
  await ready(page);
  const migrated = await stored(page);
  expect(migrated.pdf.fileName).toBe('legacy-fields.pdf');
  expect(Object.values(migrated.pdf.bytes)).toEqual(bytes);
  expect(migrated.pdf.pages).toEqual([image]);
  await page
    .getByRole('combobox', { name: 'Background', exact: true })
    .selectOption('uploaded_pdf');
  await expect(page.locator('.canvas-overlay')).toBeVisible();
  await page.getByLabel('Mode scan').selectOption('pdfjs');
  await page.getByRole('button', { name: 'Pindai ulang', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tinjau kandidat field' })).toBeVisible({
    timeout: 30000,
  });
});
