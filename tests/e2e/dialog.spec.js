const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { pdfFixture } = require('../support/pdf-fixtures.cjs');
const { skipOnboarding } = require('../support/onboarding.cjs');
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/valid-text.json', 'utf8'));

async function focusWithKey(page, dialog, target, key) {
  // Firefox includes scrollable regions in the tab order. Keep those valid
  // stops while checking that keyboard navigation stays inside the modal.
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press(key);
    if (await target.evaluate((node) => node === document.activeElement)) return;
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await expect(target).toBeFocused();
}

const TOUR_STEPS = 7;

/** The tour popover stays on screen, with its text unclipped and its buttons reachable. */
async function checkTourLayout(page, popover) {
  await expect(popover).toBeVisible();
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  const box = await popover.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const description = popover.locator('.driver-popover-description');
  expect(
    await description.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await expect(popover.locator('.driver-popover-next-btn')).toBeInViewport();
}

async function checkLayout(page, dialog) {
  await expect(dialog).toBeVisible();
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  const box = await dialog.boundingBox();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.y).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 15);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 15);
  const body = dialog.locator('.dialog-body');
  const width = await body.evaluate((node) => ({
    content: node.scrollWidth,
    visible: node.clientWidth,
  }));
  expect(width.content - width.visible).toBeLessThanOrEqual(1);
  const close = dialog.getByRole('button', { name: 'Tutup dialog' });
  const before = await close.boundingBox();
  await body.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const after = await close.boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await expect(close).toBeInViewport();
  await body.evaluate((node) => {
    node.scrollTop = 0;
  });
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 908, height: 438 },
  { width: 320, height: 568 },
  { width: 640, height: 320 },
])
  for (const dark of [false, true]) {
    test(`shared dialogs stay centered, readable and usable at ${viewport.width}x${viewport.height} ${dark ? 'dark' : 'light'}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      // Without motion the tour moves straight to each step, so its position is final.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await skipOnboarding(page);
      await page.addInitScript(
        ({ fixture, dark }) => {
          localStorage.setItem('theme_preference', dark ? 'dark' : 'light');
          localStorage.setItem(
            'overlay_print_pro_settings',
            JSON.stringify({
              schemaVersion: 1,
              jsonInput: JSON.stringify(fixture),
              overlayDoc: 'none',
            }),
          );
        },
        { fixture, dark },
      );
      await page.goto('/editor/');
      const helpButton = page.getByRole('button', { name: 'Bantuan', exact: true });
      // Establish the keyboard opener explicitly before checking focus return.
      await helpButton.focus();
      await helpButton.press('Enter');
      const help = page.getByRole('dialog', { name: 'Bantuan & shortcut', exact: true });
      await checkLayout(page, help);
      await help.getByRole('heading').click();
      await expect(help).toBeVisible();
      await help.getByRole('button', { name: 'Tutup dialog' }).focus();
      await focusWithKey(page, help, help.getByRole('button', { name: 'Mulai panduan' }), 'Tab');
      await focusWithKey(
        page,
        help,
        help.getByRole('button', { name: 'Tutup dialog' }),
        'Shift+Tab',
      );
      await page.keyboard.press('Escape');
      await expect(help).toHaveCount(0);
      await expect(helpButton).toBeFocused();
      await helpButton.click();
      await help.getByRole('button', { name: 'Mulai panduan' }).click();
      const tour = page.locator('.driver-popover');
      for (let step = 1; step <= TOUR_STEPS; step++) {
        await expect(tour.locator('.driver-popover-progress-text')).toHaveText(
          `${step} dari ${TOUR_STEPS}`,
        );
        await checkTourLayout(page, tour);
        if (step === 1 || step === 5)
          await page.screenshot({
            path: `test-results/dialog-tour-${step}-${testInfo.project.name}-${viewport.width}-${dark ? 'dark' : 'light'}.png`,
          });
        await tour
          .getByRole('button', {
            name: step === TOUR_STEPS ? 'Mulai menyusun' : 'Berikutnya',
            exact: true,
          })
          .click();
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByLabel('Mode scan').selectOption('pdfjs');
      await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles({
        name: 'fields.pdf',
        mimeType: 'application/pdf',
        buffer: pdfFixture({ fieldCount: 20 }),
      });
      const review = page.getByRole('dialog', { name: 'Tinjau kandidat field', exact: true });
      await expect(review.getByLabel('Label field')).toHaveCount(20, { timeout: 30000 });
      await checkLayout(page, review);
      if (viewport.width <= 720) {
        const confidence = await review.locator('.candidate-confidence').first().boundingBox();
        const input = await review.getByLabel('Label field').first().boundingBox();
        expect(Math.abs(confidence.x - input.x)).toBeLessThan(1);
        await expect(review.locator('.candidate-confidence').first()).toHaveCSS(
          'white-space',
          'nowrap',
        );
      }
      await page.screenshot({
        path: `test-results/dialog-review-${testInfo.project.name}-${viewport.width}-${dark ? 'dark' : 'light'}.png`,
      });
      const list = review.locator('.candidate-list');
      expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await review.getByRole('button', { name: 'Tutup dialog' }).click();
      await expect(review).toHaveCount(0);
      await page.getByRole('button', { name: /Tinjau \(/ }).click();
      await expect(review).toBeVisible();
      await page.mouse.click(4, 4);
      await expect(review).toHaveCount(0);
    });
  }
