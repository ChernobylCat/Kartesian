// Phase 3 features: saved workspaces and templates, display units, native PDF export.
const { test, expect } = require('@playwright/test');
const { skipOnboarding } = require('../support/onboarding.cjs');

const data = [
  {
    title: 'Formulir A',
    pages: [{ page_number: 1, items: [{ text: 'Isi A', x: 25.4, y: 20 }] }],
  },
];

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  await page.addInitScript((value) => {
    if (!localStorage.getItem('overlay_print_pro_settings'))
      localStorage.setItem(
        'overlay_print_pro_settings',
        JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(value), overlayDoc: 'none' }),
      );
  }, data);
  await page.goto('/editor/');
  await expect(page.locator('.canvas-item')).toHaveCount(1);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
});

/** Answers the next prompt with `value`; confirms are accepted. */
const answer = (page, value) =>
  page.once('dialog', (dialog) => dialog.accept(dialog.type() === 'prompt' ? value : undefined));

test('switches between saved workspaces and creates one from a template', async ({ page }) => {
  await expect(page.locator('.document-name')).toHaveText('Workspace saya');
  await page.getByRole('button', { name: 'Kelola workspace & template' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kelola workspace & template' });
  answer(page, 'Template Formulir');
  await dialog.getByRole('button', { name: 'Simpan sebagai template' }).click();
  await expect(dialog.getByText('Template Formulir')).toBeVisible();

  answer(page, 'Batch Kedua');
  await dialog.getByRole('button', { name: 'Workspace baru' }).click();
  await expect(page.locator('.document-name')).toHaveText('Batch Kedua');
  await expect(page.locator('.canvas-item')).toHaveCount(0);

  await page.getByRole('button', { name: 'Kelola workspace & template' }).click();
  await expect(dialog.getByText('Workspace saya')).toBeVisible();
  await dialog.getByRole('button', { name: 'Buka' }).click();
  await expect(page.locator('.document-name')).toHaveText('Workspace saya');
  await expect(page.locator('.canvas-item', { hasText: 'Isi A' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Kelola workspace & template' }).click();
  answer(page, 'Dari Template');
  await dialog.getByRole('button', { name: 'Pakai' }).click();
  await expect(page.locator('.document-name')).toHaveText('Dari Template');
  await expect(page.locator('.canvas-item', { hasText: 'Isi A' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Kelola workspace & template' }).click();
  await expect(dialog.locator('.library-list').first().locator('li')).toHaveCount(3);
});

test('shows rulers and positions in inches while storing millimetres', async ({ page }) => {
  await page.getByText('Cetak, kalibrasi & penyimpanan', { exact: true }).click();
  await page.getByLabel('Satuan tampilan').selectOption('in');
  await expect(page.locator('.ruler-origin').first()).toHaveText('in');
  await page.locator('.canvas-item', { hasText: 'Isi A' }).click();
  const x = page.getByLabel('X · in');
  await expect(x).toHaveValue('1');
  await x.fill('2');
  await x.press('Enter');
  await expect(page.locator('.canvas-item', { hasText: 'Isi A' })).toHaveAttribute(
    'style',
    /left: 50\.8mm/,
  );
  await page.reload();
  await expect(page.locator('.ruler-origin').first()).toHaveText('in');
});

test('exports a native PDF of the chosen pages', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('kartesian-dokumen.pdf');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  // Page size and content are checked against PDF.js in tests/unit/pdf-export.test.ts.
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(-6).toString()).toContain('%%EOF');
});
