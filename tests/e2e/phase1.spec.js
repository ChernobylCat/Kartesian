// Phase 1 features: CSV data merge, form text layout, copy/paste, and print scope.
const { test, expect } = require('@playwright/test');
const { skipOnboarding } = require('../support/onboarding.cjs');

const data = [
  {
    title: 'Template',
    pages: [
      {
        page_number: 1,
        items: [
          { text: '{{nama}}', x: 20, y: 20, width: 60 },
          { text: '{{nominal|rupiah}}', x: 20, y: 40 },
          { text: '{{nik}}', x: 20, y: 60, width: 80 },
        ],
      },
    ],
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
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/editor/');
  await expect(page.locator('.canvas-item')).toHaveCount(3);
  await expect(page.getByText('Tersimpan di perangkat')).toBeVisible();
});

test('merges CSV rows into filled documents and undoes in one step', async ({ page }) => {
  await page.getByRole('button', { name: 'Gabung CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gabung data dari CSV' });
  await expect(dialog.getByText('{{nama}}, {{nominal}}, {{nik}}')).toBeVisible();
  await dialog.getByLabel('Pilih berkas CSV').setInputFiles({
    name: 'data.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Nama;Nominal;NIK;Kota\nBudi;1500000;3271;Bandung\nSiti;2.000;3272;Bogor\n',
    ),
  });
  await expect(dialog.getByText('2 baris · 4 kolom · pemisah ";"')).toBeVisible();
  await expect(dialog.getByText('Kolom yang tidak dipakai: Kota')).toBeVisible();
  await expect(dialog.locator('.merge-table')).toContainText('Rp 1.500.000');
  await dialog.getByRole('button', { name: 'Buat 2 dokumen' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Budi · Halaman 1')).toBeVisible();
  await expect(page.getByText('Siti · Halaman 1')).toBeVisible();
  await expect(page.locator('.canvas-item', { hasText: 'Rp 2.000' })).toHaveCount(1);
  await expect(page.locator('.canvas-item', { hasText: '{{' })).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Template · Halaman 1')).toBeVisible();
  await expect(page.locator('.canvas-item', { hasText: '{{nama}}' })).toHaveCount(1);
});

test('lays out comb fields identically on the canvas and in print', async ({ page }) => {
  await page.locator('.canvas-item', { hasText: '{{nik}}' }).click();
  await page.getByLabel('Kotak per karakter (0 = mati)').fill('7');
  await page.getByLabel('Kotak per karakter (0 = mati)').press('Enter');
  await expect(page.locator('.canvas-item .comb-cell')).toHaveCount(7);
  await expect(page.locator('.print-surface .comb-cell')).toHaveCount(7);
  const cells = await page
    .locator('.canvas-item .comb-cell')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
  expect(new Set(cells).size).toBe(1);
  await page.getByRole('button', { name: 'Rata tengah' }).click();
  await expect(page.locator('.print-surface .output-item').nth(2)).toHaveAttribute(
    'style',
    /text-align:center/,
  );
});

test('copies elements to another page and pastes with an offset on the same page', async ({
  page,
  browserName,
}) => {
  const item = page.locator('.canvas-item', { hasText: '{{nama}}' });
  await item.click();
  const copied = await page.evaluate(() => {
    const event = new ClipboardEvent('copy', {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    });
    document.activeElement.dispatchEvent(event);
    // Read back from the event: some engines give it their own DataTransfer.
    return event.clipboardData?.getData('text/plain') ?? '';
  });
  expect(JSON.parse(copied).format).toBe('kartesian/items');
  const paste = async () => {
    if (browserName !== 'firefox')
      return page.evaluate((text) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        document.body.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      }, copied);
    // Firefox ignores clipboardData on synthetic paste events, so use the real clipboard:
    // copy the text from a scratch field, then paste with the keyboard.
    await page.evaluate((text) => {
      const field = document.createElement('textarea');
      field.id = 'clipboard-scratch';
      field.value = text;
      document.body.append(field);
      field.select();
    }, copied);
    await page.keyboard.press('Control+c');
    await page.evaluate(() => {
      document.getElementById('clipboard-scratch').remove();
      document.body.focus();
    });
    await page.keyboard.press('Control+v');
  };
  await paste();
  await expect(page.locator('.canvas-item', { hasText: '{{nama}}' })).toHaveCount(2);
  const positions = await page
    .locator('.canvas-item', { hasText: '{{nama}}' })
    .evaluateAll((nodes) => nodes.map((node) => node.style.left));
  expect(positions).toEqual(['20mm', '25mm']);

  await page.getByRole('button', { name: 'Tambah halaman' }).click();
  await page
    .locator('.page-wrapper')
    .nth(1)
    .locator('.canvas-page')
    .click({ position: { x: 300, y: 500 } });
  await paste();
  await expect(
    page.locator('.page-wrapper').nth(1).locator('.canvas-item', { hasText: '{{nama}}' }),
  ).toHaveCount(1);
});

test('prints only the chosen documents and pages', async ({ page }) => {
  await page.getByRole('button', { name: 'Tambah halaman' }).click();
  await page.getByRole('button', { name: 'Tambah halaman' }).click();
  await expect(page.locator('.print-surface .output-page')).toHaveCount(3);
  await page.getByRole('button', { name: 'Pilih dokumen dan halaman untuk dicetak' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Halaman di setiap dokumen (kosongkan untuk semua)').fill('3-1');
  await expect(dialog.getByText(/Rentang halaman tidak valid/)).toBeVisible();
  await dialog.getByLabel('Halaman di setiap dokumen (kosongkan untuk semua)').fill('1, 3');
  await expect(dialog.getByText('2 halaman akan dicetak dan diekspor.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Terapkan' }).click();
  await expect(page.locator('#btnPrint')).toHaveText(/Cetak sebagian/);
  await expect(page.locator('.print-surface .output-page')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pilih dokumen dan halaman untuk dicetak' }).click();
  await page.getByRole('button', { name: 'Cetak semua' }).click();
  await expect(page.locator('.print-surface .output-page')).toHaveCount(3);
  await expect(page.locator('#btnPrint')).toHaveText(/^\s*Cetak\s*$/);
});
