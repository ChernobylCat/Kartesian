const { test, expect } = require('@playwright/test');
const { skipOnboarding } = require('../support/onboarding.cjs');

const data = [
  {
    title: 'Contoh kertas',
    pages: [{ page_number: 1, items: [{ text: 'Bawah', x: 20, y: 300, font_size: 10 }] }],
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

const sheetRatio = (page) =>
  page
    .locator('.canvas-page')
    .first()
    .evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.height / box.width;
    });

test('switches paper size, refuses sizes that would cut elements off, and survives reload', async ({
  page,
}) => {
  const paper = page.getByLabel('Ukuran kertas', { exact: true });
  await expect(paper).toHaveValue('f4');
  expect(await sheetRatio(page)).toBeCloseTo(330 / 210, 2);

  // The element at y = 300 mm does not fit on A4 (297 mm tall).
  await paper.selectOption('a4');
  await expect(page.getByText(/1 elemen berada di luar kertas 210 × 297 mm/)).toBeVisible();
  await expect(paper).toHaveValue('f4');

  await paper.selectOption('legal');
  await expect(
    page.getByText('Legal · 215,9 × 355,6 mm · Klik skala untuk garis bantu'),
  ).toBeVisible();
  expect(await sheetRatio(page)).toBeCloseTo(355.6 / 215.9, 2);
  await expect(page.locator('.page-footer')).toContainText('Legal · 215,9 × 355,6 mm');

  // Landscape Legal is only 215.9 mm tall, so the element at y = 300 mm blocks it too.
  await page.getByRole('button', { name: 'Ubah ke lanskap' }).click();
  await expect(page.getByText(/1 elemen berada di luar kertas 355,6 × 215,9 mm/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ubah ke lanskap' })).toBeVisible();

  await paper.selectOption('custom');
  await page.getByLabel('Lebar kertas · mm').fill('200');
  await page.getByLabel('Tinggi kertas · mm').fill('320');
  await page.getByRole('button', { name: 'Terapkan' }).click();
  await expect(
    page.getByText('Kustom · 200 × 320 mm · Klik skala untuk garis bantu'),
  ).toBeVisible();
  expect(await sheetRatio(page)).toBeCloseTo(320 / 200, 2);

  await page.keyboard.press('Control+z');
  await expect(page.getByText(/^Legal · 215,9 × 355,6 mm/).first()).toBeVisible();

  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Ukuran kertas', { exact: true })).toHaveValue('legal');
  // The print surface overrides the F4 @page rule from print.css with the stored size.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll('style')].some((style) =>
          style.textContent.includes('@page{size:215.9mm 355.6mm;margin:0}'),
        ),
      ),
    )
    .toBe(true);
});
