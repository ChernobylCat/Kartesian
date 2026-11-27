const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kartesian_onboarding_complete_v1', 'true'));
});

test('Indonesian landing page leads to the Indonesian editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Data jatuh tepat di kolomnya.' }),
  ).toBeVisible();
  const ctas = page.getByRole('link', { name: 'Buka editor' });
  await expect(ctas).toHaveCount(3);
  for (const href of await ctas.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  ))
    expect(href).toBe('/editor/?lang=id');
  await ctas.first().click();
  await expect(page).toHaveURL(/\/editor\/\?lang=id$/);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
});

test('English landing page and editor, with the choice remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Every value lands in its box.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open the editor' }).first().click();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Document canvas' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'EN', exact: true, pressed: true })).toBeVisible();

  // Opening the editor without ?lang keeps the saved language.
  await page.goto('/editor/');
  await expect(page.getByText('Saved on this device')).toBeVisible();

  await page.getByRole('button', { name: 'ID', exact: true }).click();
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Canvas dokumen' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
});

test('English error messages and number formatting in the editor', async ({ page }) => {
  await page.goto('/editor/?lang=en');
  await expect(page.getByText('Saved on this device')).toBeVisible();
  const paper = page.getByLabel('Paper size', { exact: true });
  await paper.selectOption('custom');
  await page.getByLabel('Paper width · mm').fill('20');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Each side of the paper must be 50–500 mm.')).toBeVisible();
  await paper.selectOption('legal');
  await expect(
    page.getByText('Legal · 215.9 × 355.6 mm · Click a ruler to add a guide'),
  ).toBeVisible();
});

test('landing pages have no horizontal overflow on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ['/', '/en/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});

test('manifest launches installed apps straight into the editor', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/editor/');
});
