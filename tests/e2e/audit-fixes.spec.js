const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pdfFixture } = require('../support/pdf-fixtures.cjs');
const { skipOnboarding } = require('../support/onboarding.cjs');
test.use({ serviceWorkers: 'block' });
const fixture = [
  {
    title: 'Audit fixture',
    pages: [{ page_number: 1, items: [{ text: 'Teks awal', x: 20, y: 30, font_size: 10 }] }],
  },
];

async function ready(page, data = fixture, settings = {}) {
  await skipOnboarding(page);
  await page.addInitScript(
    ({ data, settings }) => {
      if (!localStorage.getItem('overlay_print_pro_settings'))
        localStorage.setItem(
          'overlay_print_pro_settings',
          JSON.stringify({ jsonInput: JSON.stringify(data), overlayDoc: 'none', ...settings }),
        );
    },
    { data, settings },
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/editor/');
  await expect(page.getByText('Tersimpan di perangkat', { exact: true })).toBeVisible();
}
async function saved(page) {
  await expect(page.getByText('Tersimpan di perangkat', { exact: true })).toBeVisible();
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('KartesianWorkspaceDB');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const value = await new Promise((resolve, reject) => {
      const r = db.transaction('workspaces').objectStore('workspaces').get('active');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return value;
  });
}
async function magentaPixels(page, locator) {
  const png = await locator.screenshot();
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] > 240 && pixels[i + 1] < 20 && pixels[i + 2] > 240) count++;
    return count;
  }, png.toString('base64'));
}

test('auto-size resize, effective defaults and rejected numeric edits match the canvas', async ({
  page,
}) => {
  await ready(page);
  const item = page.locator('.canvas-item').first();
  await item.click();
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue(
    'Courier New, Courier, monospace',
  );
  await expect(page.getByLabel('Warna teks', { exact: true })).toHaveValue('#000000');
  const before = await item.boundingBox();
  const handle = await item.locator('[data-resize="e"]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 6, handle.y + handle.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  const after = await item.boundingBox();
  expect(Math.abs(after.width - before.width - 6)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
  await page.getByLabel('Lebar · mm', { exact: true }).fill('30');
  await page.getByLabel('Lebar · mm', { exact: true }).press('Enter');
  await page.getByLabel('X · mm', { exact: true }).fill('209');
  await page.getByLabel('X · mm', { exact: true }).press('Enter');
  await expect(page.getByLabel('X · mm', { exact: true })).toHaveValue('20');
  expect((await saved(page)).document.documents[0].pages[0].items[0].x).toBe(20);
});

test('alignment uses natural text bounds and mixed fonts remain explicit', async ({ page }) => {
  const data = structuredClone(fixture);
  data[0].pages[0].items.push({
    text: 'WW',
    x: 80,
    y: 50,
    font_family: 'Arial, sans-serif',
    font_size: 18,
  });
  await ready(page, data);
  const items = page.locator('.canvas-item');
  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ['Control'] });
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Ukuran font · pt', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Tengah H', exact: true }).click();
  const boxes = await items.evaluateAll((nodes) =>
    nodes.map((n) => {
      const b = n.getBoundingClientRect();
      return b.x + b.width / 2;
    }),
  );
  expect(Math.abs(boxes[0] - boxes[1])).toBeLessThan(0.6);
  await expect(page.getByLabel('Font', { exact: true })).toHaveValue('');
});

for (const virtual of [false, true])
  test(`sidebar image upload follows the active ${virtual ? 'virtual' : 'second'} page`, async ({
    page,
  }) => {
    await ready(
      page,
      virtual ? [{ title: 'Virtual page', pages: [] }] : fixture,
      virtual ? { overlayDoc: 'doc_1' } : {},
    );
    if (!virtual) await page.getByRole('button', { name: 'Tambah halaman' }).click();
    const index = virtual ? 0 : 1;
    await page.locator('.page-wrapper').nth(index).scrollIntoViewIfNeeded();
    await page
      .locator('.canvas-page')
      .nth(index)
      .click({ position: { x: 200, y: 150 } });
    await page.getByRole('button', { name: 'Gambar', exact: true }).click();
    const image = JSON.parse(fs.readFileSync('tests/fixtures/valid-image.json', 'utf8'))[0].pages[0]
      .items[0].text;
    await page
      .locator('input[type=file][accept="image/png,image/jpeg,image/webp,image/gif"]')
      .setInputFiles({
        name: 'pixel.png',
        mimeType: 'image/png',
        buffer: Buffer.from(image.split(',')[1], 'base64'),
      });
    await expect(page.locator('.canvas-item img')).toHaveCount(1);
    const counts = (await saved(page)).document.documents[0].pages.map(
      (p) => p.items.filter((i) => i.type === 'image').length,
    );
    expect(counts).toEqual(virtual ? [1] : [0, 1]);
  });

test('negative layers remain above the background in preview, print and portable HTML', async ({
  page,
  context,
}) => {
  const data = [
    {
      title: 'Layer fixture',
      pages: [
        {
          page_number: 1,
          items: [
            { text: '', x: 20, y: 30, width: 20, height: 20, bg_color: '#ff00ff', z_index: -1000 },
          ],
        },
      ],
    },
  ];
  await ready(page, data, { overlayDoc: 'doc_1', overlayOpacity: '100', printOverlayCheck: true });
  await expect
    .poll(() =>
      page.locator('.canvas-overlay').evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  expect(await magentaPixels(page, page.locator('.canvas-page').first())).toBeGreaterThan(1000);
  await page.emulateMedia({ media: 'print' });
  expect(await magentaPixels(page, page.locator('.output-page').first())).toBeGreaterThan(3000);
  await page.emulateMedia({ media: 'screen' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor HTML' }).click(),
  ]);
  const exported = await context.newPage();
  try {
    await exported.setContent(fs.readFileSync(await download.path(), 'utf8'));
    await exported.locator('.output-overlay').evaluate((img) => img.decode());
    expect(await magentaPixels(exported, exported.locator('.output-page').first())).toBeGreaterThan(
      3000,
    );
  } finally {
    await exported.close();
  }
});

test('malformed PDFs clean up workers after every failure', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.auditWorkers = new Set();
    window.auditCreated = 0;
    window.Worker = class extends Native {
      constructor(...args) {
        super(...args);
        window.auditWorkers.add(this);
        window.auditCreated++;
      }
      terminate() {
        window.auditWorkers.delete(this);
        return super.terminate();
      }
    };
  });
  await ready(page);
  await page.getByLabel('Mode scan').selectOption('pdfjs');
  for (let i = 0; i < 3; i++) {
    await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles({
      name: `bad-${i}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\ninvalid\n%%EOF'),
    });
    await expect.poll(() => page.evaluate(() => window.auditCreated)).toBe(i + 1);
    await expect.poll(() => page.evaluate(() => window.auditWorkers.size)).toBe(0);
    await expect(page.getByRole('button', { name: 'Batalkan scan', exact: true })).toHaveCount(0);
  }
  await expect(page.locator('.canvas-item')).toHaveCount(1);
});

test('restoring a backup cancels an old scan without restoring its PDF', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Mode scan').selectOption('pdfjs');
  await page
    .locator('input[type=file][accept="application/pdf,.pdf"]')
    .setInputFiles({ name: 'original.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Tutup dialog' }).click();
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup workspace lengkap' }).click(),
  ]);
  const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const payload = JSON.parse(backup.payload);
  payload.pdf.fileName = 'restored.pdf';
  payload.pdf.candidates = [];
  backup.payload = JSON.stringify(payload);
  backup.checksum = crypto.createHash('sha256').update(backup.payload).digest('hex');
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let entered;
  const started = new Promise((resolve) => (entered = resolve));
  const origin = new URL(page.url()).origin;
  await page.route('http://127.0.0.1:8765/**', async (route) => {
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'Content-Type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().includes('/health'))
      return route.fulfill({ status: 200, headers, body: '{}' });
    entered();
    await gate;
    await route
      .fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [], warnings: [] }),
      })
      .catch(() => {});
  });
  try {
    await page.getByLabel('Mode scan').selectOption('pymupdf');
    await page.getByRole('button', { name: 'Pindai ulang', exact: true }).click();
    await started;
    await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({
      name: 'restore.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByText('Data berhasil dipulihkan.', { exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('button', { name: 'Batalkan scan' })).toHaveCount(0);
    expect((await saved(page)).pdf.fileName).toBe('restored.pdf');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    expect((await saved(page)).pdf.fileName).toBe('restored.pdf');
  } finally {
    release();
  }
});

test('handover freezes mutations during a slow save and commits focused inline text', async ({
  page,
  context,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Teks', exact: true }).click();
  await saved(page);
  const second = await context.newPage();
  await second.goto('/editor/');
  await expect(second.getByText(/Workspace hanya-baca/)).toBeVisible();
  try {
    const item = page.locator('.canvas-item').first();
    await item.dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Draft sebelum handover');
    await page.evaluate(() => {
      const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...d,
        set(callback) {
          const tx = this;
          d.set.call(
            tx,
            tx.mode === 'readwrite' && callback
              ? function (event) {
                  setTimeout(() => callback.call(tx, event), 1500);
                }
              : callback,
          );
        },
      });
    });
    await second.getByRole('button', { name: 'Ambil alih', exact: true }).click();
    await expect(page.locator('.editor-app')).toHaveAttribute('inert', '');
    await page.evaluate(() => document.getElementById('btnAddText').click());
    await expect(page.locator('.canvas-item')).toHaveCount(2);
    await expect(second.getByRole('button', { name: 'Teks', exact: true })).toBeEnabled();
    await expect(page.getByText(/Workspace hanya-baca/)).toBeVisible();
    const state = await saved(second);
    expect(state.document.documents[0].pages[0].items).toHaveLength(2);
    expect(state.document.documents[0].pages[0].items[0].text).toBe('Draft sebelum handover');
  } finally {
    await second.close();
  }
});

test('mobile sidebar controls stay within the viewport', async ({ page }, testInfo) => {
  await ready(page);
  await page.locator('.canvas-item').first().click();
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  for (const width of [320, 390, 480, 640]) {
    await page.setViewportSize({ width, height: 568 });
    const overflow = await page.locator('.sidebar').evaluate(
      (root, width) =>
        [...root.querySelectorAll('button,input:not([hidden]),select')]
          .filter((node) => {
            if (!node.getClientRects().length) return false;
            const b = node.getBoundingClientRect();
            return b.left < -0.5 || b.right > width + 0.5;
          })
          .map((node) => node.textContent || node.getAttribute('aria-label') || node.type),
      width,
    );
    expect(overflow).toEqual([]);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page
    .locator('.sidebar')
    .screenshot({ path: testInfo.outputPath('sidebar-mobile-fixed.png') });
});

test('recovery offers working backup controls without a removed legacy link', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('overlay_print_pro_settings', '{invalid'));
  await page.goto('/editor/');
  await expect(page.getByRole('heading', { name: 'Workspace memerlukan pemulihan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buka editor legacy' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pulihkan backup lengkap' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unduh settings mentah' })).toBeVisible();
});
