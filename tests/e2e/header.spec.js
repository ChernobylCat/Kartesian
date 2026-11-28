// Editor header on narrow screens: Export HTML and Export PDF stay reachable as icon
// buttons, and the header neither scrolls sideways nor spills out of its bar.
const { test, expect } = require('@playwright/test');
const { skipOnboarding } = require('../support/onboarding.cjs');

const data = [
  {
    title: 'Formulir Sempit',
    pages: [{ page_number: 1, items: [{ text: 'Isi sempit', x: 20, y: 20, font_size: 10 }] }],
  },
];
const NARROW_WIDTHS = [320, 375, 640, 768, 1000];

async function ready(page, { dark = false, lang = 'id' } = {}) {
  await skipOnboarding(page);
  await page.addInitScript(
    ({ value, dark }) => {
      if (localStorage.getItem('overlay_print_pro_settings')) return;
      localStorage.setItem('theme_preference', dark ? 'dark' : 'light');
      localStorage.setItem(
        'overlay_print_pro_settings',
        JSON.stringify({ schemaVersion: 1, jsonInput: JSON.stringify(value), overlayDoc: 'none' }),
      );
    },
    { value: data, dark },
  );
  await page.goto(lang === 'en' ? '/editor/?lang=en' : '/editor/');
  // The sidebar count, not the canvas: on a phone the page sits below the fold and
  // only renders its items once scrolled near.
  await expect(page.locator('.document-meta')).toContainText(/\b1 elemen(t)?\b/);
  if (dark) await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
}

async function bytesOf(download) {
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** The page does not scroll sideways, and every header control sits inside the bar. */
async function checkHeader(page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const header = document.querySelector('.app-header');
    const bar = header.getBoundingClientRect();
    const outside = [...header.querySelectorAll('button, .save-label, .brand')]
      .filter((node) => node.getClientRects().length)
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.left < -0.5 ||
          box.right > root.clientWidth + 0.5 ||
          box.top < bar.top - 0.5 ||
          box.bottom > bar.bottom + 0.5
        );
      })
      .map((node) => node.getAttribute('aria-label') || node.textContent.trim());
    return {
      page: root.scrollWidth - root.clientWidth,
      header: header.scrollWidth - header.clientWidth,
      outside,
    };
  });
  expect(layout).toEqual({ page: 0, header: 0, outside: [] });
}

/** Clicks an export button and returns the downloaded file. */
async function exportFile(page, button, name) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toBe(name);
  return bytesOf(download);
}

for (const dark of [false, true])
  test(`exports stay one tap away without overflow from 320 to 1000 px (${dark ? 'dark' : 'light'})`, async ({
    page,
  }, testInfo) => {
    await ready(page, { dark });
    // The tour's print/export step points at this group, so the exports stay inside it.
    const output = page.locator('[data-tour="output"]');
    const html = output.getByRole('button', { name: 'Ekspor HTML', exact: true });
    const pdf = output.getByRole('button', { name: 'Ekspor PDF', exact: true });
    for (const width of NARROW_WIDTHS) {
      await page.setViewportSize({ width, height: 720 });
      await test.step(`${width} px`, async () => {
        await checkHeader(page);
        for (const [button, name] of [
          [html, 'Ekspor HTML'],
          [pdf, 'Ekspor PDF'],
        ]) {
          await expect(button).toBeInViewport();
          await expect(button).toHaveAttribute('title', name);
          await expect(button.locator('.button-label')).toBeHidden();
          expect((await button.boundingBox()).width).toBeLessThanOrEqual(34);
        }
        await page
          .locator('.app-header')
          .screenshot({ path: testInfo.outputPath(`header-${width}.png`) });
        const document = (await exportFile(page, html, 'kartesian-dokumen.html')).toString();
        expect(document).toContain('<title>Formulir Sempit</title>');
        expect(document).toContain('Isi sempit');
        const bytes = await exportFile(page, pdf, 'kartesian-dokumen.pdf');
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(bytes.subarray(-6).toString()).toContain('%%EOF');
      });
    }
    // Wide screens keep the labelled buttons and the whole save status.
    await page.setViewportSize({ width: 1440, height: 720 });
    await expect(html.locator('.button-label')).toBeVisible();
    await expect(pdf.locator('.button-label')).toBeVisible();
    const status = page.locator('.save-label');
    expect(await status.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
  });

test('a phone exports a PDF from the English header too', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await ready(page, { lang: 'en' });
  await checkHeader(page);
  await expect(page.getByRole('button', { name: 'Export HTML', exact: true })).toHaveAttribute(
    'title',
    'Export HTML',
  );
  const pdf = page.getByRole('button', { name: 'Export PDF', exact: true });
  await expect(pdf).toHaveAttribute('title', 'Export PDF');
  const bytes = await exportFile(page, pdf, 'kartesian-dokumen.pdf');
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
});

test('the save status gives way before the narrow header wraps', async ({ page }) => {
  await ready(page);
  // Printing only some pages lengthens the Print label, the widest state of the header.
  await page.getByRole('button', { name: 'Pilih dokumen dan halaman untuk dicetak' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pilih dokumen dan halaman untuk dicetak' });
  await dialog.getByLabel('Halaman di setiap dokumen (kosongkan untuk semua)').fill('1');
  await dialog.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(page.locator('#btnPrint')).toHaveText('Cetak sebagian');
  await page.setViewportSize({ width: 721, height: 720 });
  await checkHeader(page);
  // A shortened status keeps its full text in the tooltip.
  await expect(
    page.getByRole('status').filter({ hasText: 'Tersimpan di perangkat' }),
  ).toHaveAttribute('title', 'Tersimpan di perangkat');
  await expect(page.getByRole('button', { name: 'Bantuan', exact: true })).toBeInViewport();
});
