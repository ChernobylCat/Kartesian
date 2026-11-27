const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/valid-text.json', 'utf8'));

test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('kartesian_onboarding_complete_v1', 'true');
    localStorage.setItem(
      'overlay_print_pro_settings',
      JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(data), overlayDoc: 'none' }),
    );
    document.addEventListener('pointermove', (event) => {
      window.__rulerPointer = { x: event.clientX, y: event.clientY };
    });
  }, fixture);
  await page.goto('/');
  await expect(page.locator('.canvas-item')).toHaveCount(1);
});
async function saved(page) {
  await expect(page.getByText('Tersimpan di perangkat', { exact: true })).toBeAttached();
}
async function stored(page) {
  await saved(page);
  return page.evaluate(async () => {
    const database = await new Promise((resolve) => {
      const request = indexedDB.open('KartesianWorkspaceDB');
      request.onsuccess = () => resolve(request.result);
    });
    const value = await new Promise((resolve) => {
      const request = database.transaction('workspaces').objectStore('workspaces').get('active');
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return value;
  });
}
async function cursor(page, x, y) {
  const paper = await page.locator('.canvas-page').first().boundingBox();
  await page.mouse.move(paper.x + (x / 210) * paper.width, paper.y + (y / 330) * paper.height);
  const actual = await page.evaluate(() => window.__rulerPointer);
  return {
    x: Math.round(((actual.x - paper.x) / paper.width) * 2100) / 10,
    y: Math.round(((actual.y - paper.y) / paper.height) * 3300) / 10,
  };
}

for (const zoom of [0.4, 0.75, 1.5])
  test(`rulers match paper coordinates and selection bounds at ${zoom * 100}%`, async ({
    page,
  }) => {
    await page.getByLabel('Zoom canvas').selectOption(String(zoom));
    const paper = page.locator('.canvas-page').first();
    await paper.scrollIntoViewIfNeeded();
    await page.locator('.canvas-item').click();
    const point = await cursor(page, 60, 70);
    const value = page.getByLabel('Posisi kursor halaman 1', { exact: true });
    await expect
      .poll(async () => Number(await value.getAttribute('data-x')))
      .toBeCloseTo(point.x, 1);
    await expect
      .poll(async () => Number(await value.getAttribute('data-y')))
      .toBeCloseTo(point.y, 1);
    // Engine input is quantized to CSS pixels; the readout follows the actual event.
    expect(Math.abs(point.x - 60)).toBeLessThan(25.4 / 96 / zoom + 0.1);
    expect(Math.abs(point.y - 70)).toBeLessThan(25.4 / 96 / zoom + 0.1);
    await expect(page.locator('.ruler-cursor-label').first()).toBeVisible();
    const box = await paper.boundingBox();
    const top = await page.locator('.ruler-x').first().boundingBox();
    const side = await page.locator('.ruler-y').first().boundingBox();
    expect(Math.abs(top.x - box.x)).toBeLessThan(0.5);
    expect(Math.abs(top.width - box.width)).toBeLessThan(0.5);
    expect(Math.abs(side.y - box.y)).toBeLessThan(0.5);
    expect(Math.abs(side.height - box.height)).toBeLessThan(0.5);
    for (const axis of ['x', 'y']) {
      const labels = await page
        .locator(`.ruler-${axis}`)
        .first()
        .locator('text')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
          }),
        );
      for (let index = 1; index < labels.length; index++)
        expect(
          axis === 'x'
            ? labels[index].x - labels[index - 1].right
            : labels[index].y - labels[index - 1].bottom,
        ).toBeGreaterThanOrEqual(0);
    }
    const item = await page.locator('.canvas-item').boundingBox();
    const size = page.getByLabel('Ukuran pilihan halaman 1', { exact: true });
    expect(Number(await size.getAttribute('data-width'))).toBeCloseTo(
      (item.width / box.width) * 210,
      1,
    );
    expect(Number(await size.getAttribute('data-height'))).toBeCloseTo(
      (item.height / box.height) * 330,
      1,
    );
    await expect(page.locator('.ruler-selection-range').first()).toBeVisible();
    if (zoom === 0.4) {
      const edge = await cursor(page, 208, 328);
      await expect
        .poll(async () => Number(await value.getAttribute('data-x')))
        .toBeCloseTo(edge.x, 1);
      const tooltip = await page.locator('.ruler-cursor-label').first().boundingBox();
      expect(tooltip.x).toBeGreaterThanOrEqual(box.x);
      expect(tooltip.y).toBeGreaterThanOrEqual(box.y);
      expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(tooltip.y + tooltip.height).toBeLessThanOrEqual(box.y + box.height + 1);
    }
  });

test('ruler guides support pointer, keyboard, snap and live movement without changing output', async ({
  page,
}, testInfo) => {
  await page.getByLabel('Zoom canvas').selectOption('0.5');
  const paper = page.locator('.canvas-page').first();
  const x = page.getByRole('slider', { name: 'Garis bantu vertikal halaman 1', exact: true });
  const y = page.getByRole('slider', { name: 'Garis bantu horizontal halaman 1', exact: true });
  const original = await stored(page);
  const ruler = await x.boundingBox();
  await page.mouse.click(ruler.x + (ruler.width * 50) / 210, ruler.y + ruler.height / 2);
  await expect(x).toHaveAttribute('aria-valuenow', '50');
  await x.press('ArrowRight');
  await expect(x).toHaveAttribute('aria-valuenow', '51');
  await x.press('Alt+ArrowLeft');
  await expect(x).toHaveAttribute('aria-valuenow', '50.9');
  await x.press('Home');
  await x.press('Shift+ArrowRight');
  await x.press('Shift+ArrowRight');
  await x.press('Shift+ArrowRight');
  await x.press('Shift+ArrowRight');
  await x.press('Shift+ArrowRight');
  await expect(x).toHaveAttribute('aria-valuenow', '50');
  await y.press('Home');
  await y.press('Shift+ArrowDown');
  await y.press('Shift+ArrowDown');
  await y.press('Shift+ArrowDown');
  await y.press('Shift+ArrowDown');
  await y.press('Shift+ArrowDown');
  await expect(y).toHaveAttribute('aria-valuenow', '50');
  expect((await stored(page)).revision).toBe(original.revision);
  const element = page.locator('.canvas-item');
  await element.click();
  await expect(element).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await stored(page)).document.debtors[0].pages[0].items[0].x)
    .toBe(20.1);
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await stored(page)).document.debtors[0].pages[0].items[0].x)
    .toBe(20);
  const bounds = await element.boundingBox(),
    sheet = await paper.boundingBox();
  await page.mouse.move(bounds.x + 3, bounds.y + 3);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + 3 + (30.6 / 210) * sheet.width,
    bounds.y + 3 + (20.6 / 330) * sheet.height,
    { steps: 6 },
  );
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Ukuran pilihan halaman 1').getAttribute('data-x')),
    )
    .toBeCloseTo(50, 1);
  await page.mouse.up();
  const moved = (await stored(page)).document.debtors[0].pages[0].items[0];
  expect(moved.x).toBe(50);
  expect(moved.y).toBe(50);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).document.debtors[0].pages[0].items[0].x)
    .toBe(20);
  await x.focus();
  await x.press('Delete');
  await expect(page.locator('.ruler-pin-x')).toHaveCount(0);
  await expect(element).toHaveCount(1);
  await cursor(page, 80, 80);
  await page.getByRole('button', { name: 'Garis silang kursor halaman 1', exact: true }).click();
  await cursor(page, 80, 80);
  await expect(page.locator('.ruler-crosshair-x')).toBeHidden();
  await expect(page.locator('.ruler-pin-y')).toHaveCount(1);
  await page.getByRole('button', { name: 'Garis silang kursor halaman 1', exact: true }).click();
  await cursor(page, 80, 80);
  await expect(page.locator('.ruler-crosshair-x')).toBeVisible();
  await page.screenshot({ path: `test-results/ruler-interactive-${testInfo.project.name}.png` });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.page-ruler').first()).toBeHidden();
  const output = await page.locator('.output-page').first().boundingBox();
  expect(output.width).toBeCloseTo((210 * 96) / 25.4, 0);
  expect(output.height).toBeCloseTo((330 * 96) / 25.4, 0);
  await page.emulateMedia({ media: 'screen' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor HTML' }).click(),
  ]);
  const html = fs.readFileSync(await download.path(), 'utf8');
  expect(html).not.toContain('ruler-pin');
  expect(html).not.toContain('page-ruler');
  await page.getByRole('button', { name: 'Hapus garis bantu halaman 1', exact: true }).click();
  await expect(page.locator('.ruler-pin-line')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Background', exact: true }).selectOption('doc_1');
  await page.getByLabel('Zoom canvas').selectOption('0.75');
  await expect
    .poll(() =>
      page
        .locator('.canvas-overlay')
        .first()
        .evaluate((image) => image.naturalWidth),
    )
    .toBe(1700);
  const demoGuide = page.getByRole('slider', {
    name: 'Garis bantu vertikal halaman 1',
    exact: true,
  });
  await demoGuide.press('Home');
  for (let step = 0; step < 5; step++) await demoGuide.press('Shift+ArrowRight');
  await page.setViewportSize({ width: 1544, height: 712 });
  await page.locator('.canvas-item').first().click();
  await cursor(page, 70, 65);
  await expect(page.locator('.ruler-cursor-label').first()).toBeVisible();
  await saved(page);
  await page.screenshot({ path: `test-results/ruler-interactive-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: 'Ganti tema', exact: true }).click();
  await cursor(page, 70, 65);
  await expect(page.locator('.ruler-cursor-label').first()).toBeVisible();
  const contrast = await page
    .locator('.ruler-cursor-size')
    .first()
    .evaluate((node) => {
      const luminance = (color) => {
        const channels = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map((channel) => {
            const value = Number(channel) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const foreground = luminance(getComputedStyle(node).color);
      const background = luminance(getComputedStyle(node.parentElement).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await saved(page);
  await page.screenshot({
    path: `test-results/ruler-interactive-dark-${testInfo.project.name}.png`,
  });
});

test('session guides survive virtual pages becoming editable and leaving the viewport', async ({
  page,
}) => {
  await page.getByRole('combobox', { name: 'Background', exact: true }).selectOption('doc_1');
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: 'Tambah halaman', exact: true }).click();
  }
  await page.getByLabel('Zoom canvas').selectOption('0.4');
  const wrapper = page.locator('.page-wrapper').nth(2);
  await wrapper.scrollIntoViewIfNeeded();
  const ruler = page.getByRole('slider', { name: 'Garis bantu vertikal halaman 3', exact: true });
  await ruler.press('Home');
  await ruler.press('Shift+ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', '10');
  await wrapper.getByRole('button', { name: '+ Teks', exact: true }).click();
  await expect(ruler).toHaveAttribute('aria-valuenow', '10');
  await expect(wrapper.locator('.ruler-pin-x')).toHaveCount(1);
  await page.getByRole('button', { name: 'Garis silang kursor halaman 3', exact: true }).click();
  await page.locator('.page-wrapper').nth(8).scrollIntoViewIfNeeded();
  await expect(wrapper.locator('.canvas-page')).toHaveCount(0);
  await wrapper.scrollIntoViewIfNeeded();
  await expect(ruler).toHaveAttribute('aria-valuenow', '10');
  await expect(
    page.getByRole('button', { name: 'Garis silang kursor halaman 3', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
});
