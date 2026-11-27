// Phase 2 features: graphic elements and codes, groups, layers, zoom fit and grid.
const { test, expect } = require('@playwright/test');

const data = [
  {
    title: 'Fase 2',
    pages: [
      {
        page_number: 1,
        items: [
          { text: 'Alpha', x: 20, y: 20 },
          { text: 'Beta', x: 60, y: 20 },
        ],
      },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('kartesian_onboarding_complete_v1', 'true');
    if (!localStorage.getItem('overlay_print_pro_settings'))
      localStorage.setItem(
        'overlay_print_pro_settings',
        JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(value), overlayDoc: 'none' }),
      );
  }, data);
  await page.goto('/editor/');
  await expect(page.locator('.canvas-item')).toHaveCount(2);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
});

test('adds marks and barcodes that print exactly like the canvas', async ({ page }) => {
  await page.getByRole('button', { name: 'Elemen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Tanda centang ✓' }).click();
  await expect(page.locator('.canvas-item.graphic-item svg path')).toHaveCount(1);
  await expect(page.locator('.print-surface .output-item svg path')).toHaveCount(1);
  await expect(page.getByLabel('Bentuk tanda')).toHaveValue('check');
  await page.getByLabel('Bentuk tanda').selectOption('cross');
  await expect(page.locator('.print-surface .output-item svg path')).toHaveAttribute('d', /M.* M/);

  await page.getByRole('button', { name: 'Elemen', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Barcode' }).click();
  const value = page.getByLabel('Isi kode');
  await value.fill('{{nik}}');
  await value.press('Enter');
  await expect(page.locator('.canvas-item.graphic-item').last()).toContainText('{{nik}}');
  await value.fill('ABC-123456');
  await value.press('Enter');
  await expect(page.locator('.canvas-item.graphic-item').last().locator('svg path')).toHaveCount(1);
});

test('groups move together and layers hide only on screen', async ({ page }) => {
  await page.locator('.canvas-item', { hasText: 'Alpha' }).click();
  await page.locator('.canvas-item', { hasText: 'Beta' }).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  await page.keyboard.press('Escape');
  await page.locator('.canvas-item', { hasText: 'Alpha' }).click();
  await expect(page.locator('.canvas-item.selected')).toHaveCount(2);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.canvas-item', { hasText: 'Alpha' })).toHaveCSS('left', /./);
  const lefts = await page
    .locator('.canvas-item')
    .evaluateAll((nodes) => nodes.map((node) => node.style.left));
  expect(lefts).toEqual(['21mm', '61mm']);

  await page.getByText(/Layer halaman \(2\)/).click();
  await page.getByRole('button', { name: 'Sembunyikan di layar' }).first().click();
  await expect(page.locator('.canvas-item', { hasText: 'Beta' })).toBeHidden();
  await expect(page.locator('.print-surface .output-item', { hasText: 'Beta' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Tampilkan di layar' }).click();
  await expect(page.locator('.canvas-item', { hasText: 'Beta' })).toBeVisible();
  await page.keyboard.press('Control+Shift+g');
  await page.keyboard.press('Escape');
  await page.locator('.canvas-item', { hasText: 'Alpha' }).click();
  await expect(page.locator('.canvas-item.selected')).toHaveCount(1);
});

test('fits the page to the canvas width and shows a grid', async ({ page }) => {
  const width = () =>
    page
      .locator('.page-wrapper')
      .first()
      .evaluate((node) => node.getBoundingClientRect().width);
  const before = await width();
  await page.getByLabel('Zoom canvas').selectOption('fit-width');
  await expect.poll(width).toBeGreaterThan(before);
  const container = await page.locator('#printContainer').evaluate((node) => node.clientWidth - 60);
  expect(await width()).toBeLessThanOrEqual(container + 1);
  await page.getByLabel('Grid kanvas').selectOption('5');
  await expect(page.locator('#printContainer')).toHaveClass(/show-grid/);
  await page.reload();
  await expect(page.getByLabel('Grid kanvas')).toHaveValue('5');
});
