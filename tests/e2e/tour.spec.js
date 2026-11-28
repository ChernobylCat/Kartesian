// Onboarding tours (driver.js): the full tour on a first visit, "what's new" for
// visitors of the first tour, reopening from Help, and keeping the workspace untouched.
const { test, expect } = require('@playwright/test');
const { ONBOARDING_SEEN, skipOnboarding } = require('../support/onboarding.cjs');

const data = [
  {
    title: 'Formulir Tur',
    pages: [{ page_number: 1, items: [{ text: 'Isi tur', x: 30, y: 30, font_size: 10 }] }],
  },
];

async function seed(page, legacyTour = false) {
  await page.addInitScript(
    ({ value, legacyTour }) => {
      if (legacyTour) localStorage.setItem('kartesian_onboarding_complete_v1', 'true');
      if (!localStorage.getItem('overlay_print_pro_settings'))
        localStorage.setItem(
          'overlay_print_pro_settings',
          JSON.stringify({
            schemaVersion: 1,
            jsonInput: JSON.stringify(value),
            overlayDoc: 'none',
          }),
        );
    },
    { value: data, legacyTour },
  );
}

const popover = (page) => page.locator('.driver-popover');
const title = (page) => popover(page).locator('.driver-popover-title');
const progress = (page) => popover(page).locator('.driver-popover-progress-text');
const highlighted = (page) => page.locator('.driver-active-element');
const seenVersion = (page) =>
  page.evaluate((key) => localStorage.getItem(key), ONBOARDING_SEEN.key);

test('a first visit walks through the full tour, forward and back', async ({ page }) => {
  await seed(page);
  await page.goto('/editor/');
  await expect(title(page)).toHaveText('Selamat datang di Kartesian');
  await expect(progress(page)).toHaveText('1 dari 7');
  await expect(popover(page)).toHaveAttribute('role', 'dialog');
  await expect(popover(page).getByRole('button', { name: 'Lewati tur' })).toBeVisible();
  await expect(popover(page).getByRole('button', { name: 'Kembali' })).toBeHidden();
  await expect(popover(page).getByRole('button', { name: 'Berikutnya' })).toBeFocused();

  const steps = [
    ['Pilih ukuran kertas', '[data-tour="paper"]'],
    ['Pasang formulir sebagai panduan', '[data-tour="pdf"]'],
    ['Tambahkan isi', '[data-tour="add"]'],
    ['Atur posisinya', '.page-wrapper'],
    ['Isi banyak dokumen dari CSV', '[data-tour="merge"]'],
    ['Cetak atau ekspor', '[data-tour="output"]'],
  ];
  for (const [index, [heading, target]] of steps.entries()) {
    await popover(page).getByRole('button', { name: 'Berikutnya' }).click();
    await expect(title(page)).toHaveText(heading);
    await expect(progress(page)).toHaveText(`${index + 2} dari 7`);
    await expect(highlighted(page)).toHaveCount(1);
    expect(
      await highlighted(page).evaluate((node, selector) => node.matches(selector), target),
    ).toBe(true);
  }
  await expect(popover(page).getByRole('button', { name: 'Mulai menyusun' })).toBeVisible();
  await popover(page).getByRole('button', { name: 'Kembali' }).click();
  await expect(title(page)).toHaveText('Isi banyak dokumen dari CSV');
  await popover(page).getByRole('button', { name: 'Berikutnya' }).click();
  await expect(title(page)).toHaveText('Cetak atau ekspor');
  await popover(page).getByRole('button', { name: 'Mulai menyusun' }).click();
  await expect(popover(page)).toHaveCount(0);
  expect(await seenVersion(page)).toBe(ONBOARDING_SEEN.value);

  await page.reload();
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(popover(page)).toHaveCount(0);
});

test("visitors of the first tour see what's new instead", async ({ page }) => {
  await seed(page, true);
  await page.goto('/editor/?lang=en');
  await expect(title(page)).toHaveText("What's new in Kartesian");
  await expect(progress(page)).toHaveText('1 of 6');
  for (const target of ['elements', 'merge', 'workspaces', 'layers', 'output']) {
    await popover(page).getByRole('button', { name: 'Next' }).click();
    await expect(highlighted(page)).toHaveAttribute('data-tour', target);
  }
  await popover(page).getByRole('button', { name: 'Done' }).click();
  await expect(popover(page)).toHaveCount(0);
  expect(await seenVersion(page)).toBe(ONBOARDING_SEEN.value);
});

test('Escape, skip and close end a tour, and Help reopens both tours', async ({ page }) => {
  await seed(page);
  await page.goto('/editor/');
  await expect(title(page)).toHaveText('Selamat datang di Kartesian');
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  expect(await seenVersion(page)).toBe(ONBOARDING_SEEN.value);

  const help = page.getByRole('dialog', { name: 'Bantuan & shortcut' });
  await page.getByRole('button', { name: 'Bantuan', exact: true }).click();
  await help.getByRole('button', { name: 'Mulai panduan' }).click();
  await expect(help).toHaveCount(0);
  await expect(title(page)).toHaveText('Selamat datang di Kartesian');
  await popover(page).getByRole('button', { name: 'Lewati tur' }).click();
  await expect(popover(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Bantuan', exact: true }).click();
  await help.getByRole('button', { name: 'Lihat yang baru' }).click();
  await expect(title(page)).toHaveText('Yang baru di Kartesian');
  await popover(page).getByRole('button', { name: 'Tutup tur' }).click();
  await expect(popover(page)).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/driver-active/);
});

test('keys and clicks during a tour leave the workspace untouched', async ({ page }) => {
  // driver.js ignores keys pressed while a step is still animating in.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipOnboarding(page);
  await seed(page);
  await page.goto('/editor/');
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  const item = page.locator('.canvas-item');
  await item.click();
  await expect(item).toHaveClass(/selected/);
  // The tour scrolls the page, so compare the element's own position, not its box.
  const before = await item.getAttribute('style');

  await page.getByRole('button', { name: 'Bantuan', exact: true }).click();
  await page.getByRole('button', { name: 'Mulai panduan' }).click();
  await expect(title(page)).toHaveText('Selamat datang di Kartesian');
  // Arrow keys step through the tour instead of nudging the selected element. A step
  // takes keys once it is ready, which is when focus lands on its Next button.
  const press = async (key, heading) => {
    await expect(popover(page).locator('.driver-popover-next-btn')).toBeFocused();
    await page.keyboard.press(key);
    await expect(title(page)).toHaveText(heading);
  };
  await press('ArrowRight', 'Pilih ukuran kertas');
  await press('ArrowRight', 'Pasang formulir sebagai panduan');
  await press('ArrowLeft', 'Pilih ukuran kertas');
  await press('ArrowRight', 'Pasang formulir sebagai panduan');
  await press('ArrowRight', 'Tambahkan isi');
  // Cut and paste shortcuts stand down while the tour is open.
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Control+v');
  // The highlighted "Text" button does not respond to clicks.
  const add = await page.locator('#btnAddText').boundingBox();
  await page.mouse.click(add.x + add.width / 2, add.y + add.height / 2);
  await expect(title(page)).toHaveText('Tambahkan isi');
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);

  await expect(item).toHaveCount(1);
  expect(await item.getAttribute('style')).toBe(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('a read-only second tab does not start the tour', async ({ page, context }) => {
  await seed(page);
  await page.goto('/editor/');
  await expect(title(page)).toHaveText('Selamat datang di Kartesian');
  const second = await context.newPage();
  await second.goto('/editor/');
  await expect(second.getByText(/Workspace hanya-baca/)).toBeVisible();
  await second.waitForTimeout(500);
  await expect(popover(second)).toHaveCount(0);
  await second.close();
});
