const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const validTextFixture = fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'valid-text.json'), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kartesian_onboarding_complete_v1', 'true'));
});

function createMinimalPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream'
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n`;
  source += '0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => {
    source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  source += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
}

async function openReadyApp(page) {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#jsonValidationStatus')).toContainText('Format JSON & Skema Valid');
  await expect(page.locator('.print-page')).toHaveCount(9);
  return response;
}

async function loadDocument(page, json) {
  await page.locator('#importFile').setInputFiles({
    name: 'document-fixture-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 1,
      jsonInput: json,
      overlayDoc: 'none'
    }))
  });
  await expect(page.locator('.toast-success')).toContainText('Pengaturan berhasil diimpor');
  await expect(page.locator('.print-page')).toHaveCount(1);
}

async function setEditorText(page, value) {
  const textarea = page.locator('#jsonInput');
  if (await textarea.isVisible()) {
    await textarea.fill(value);
    return;
  }
  await page.evaluate(nextValue => {
    window.ace.edit('jsonInputEditor').setValue(nextValue, -1);
  }, value);
}

test('panel properti, multi-select, alignment, shortcut, dan context menu bekerja', async ({ page }) => {
  await openReadyApp(page);
  const items = page.locator('.print-page').first().locator('.data-item');
  await items.nth(0).click();
  await expect(page.locator('#propertyPanel')).toBeVisible();
  await page.locator('[data-property="rotation"]').fill('15');
  await page.locator('[data-property="rotation"]').press('Enter');
  await expect(items.nth(0)).toHaveCSS('transform', /matrix/);

  await items.nth(0).click();
  await items.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#propertySelectionSummary')).toContainText('2 elemen');
  await page.getByTitle('Rata kiri').click();
  const positions = await items.evaluateAll(nodes => nodes.slice(0, 2).map(node => node.style.left));
  expect(positions[0]).toBe(positions[1]);

  await page.keyboard.press('Alt+l');
  await expect(page.locator('.locked-item')).toHaveCount(2);
  await items.nth(0).click({ button: 'right' });
  await expect(page.locator('#canvasContextMenu')).toBeVisible();
  await page.getByRole('menuitem', { name: /Duplikasi/ }).click();
  await expect(page.locator('.print-page').first().locator('.data-item')).toHaveCount(5);
});

test('marquee box memilih banyak elemen dengan contain, intersect, add, dan toggle', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, JSON.stringify([{
    debitur: 'Marquee Fixture',
    pages: [{
      page_number: 1,
      items: [
        { text: 'Satu', x: 40, y: 80, width: 22, height: 8, font_size: 10 },
        { text: 'Dua', x: 80, y: 80, width: 22, height: 8, font_size: 10 },
        { text: 'Tiga', x: 140, y: 130, width: 22, height: 8, font_size: 10 }
      ]
    }]
  }]));

  const items = page.locator('.print-page').first().locator('.data-item');
  await items.first().scrollIntoViewIfNeeded();
  let boxes = await items.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));

  await page.mouse.move(boxes[0].left - 10, boxes[0].top - 10);
  await page.mouse.down();
  await page.mouse.move(boxes[1].right + 10, boxes[1].bottom + 10, { steps: 6 });
  const marquee = page.locator('.marquee-selection-box');
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveAttribute('data-selection-mode', 'contain');
  await expect(marquee).toHaveAttribute('data-selection-operation', 'replace');
  await expect(page.locator('.marquee-candidate')).toHaveCount(2);
  await page.mouse.up();
  await expect(page.locator('.selected-item')).toHaveCount(2);
  await expect(page.locator('#propertySelectionSummary')).toContainText('2 elemen');

  await items.nth(2).scrollIntoViewIfNeeded();
  boxes = await items.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));
  await page.keyboard.down('Shift');
  await page.mouse.move(boxes[2].left - 10, boxes[2].top - 10);
  await page.mouse.down();
  await page.mouse.move(boxes[2].right + 10, boxes[2].bottom + 10, { steps: 5 });
  await expect(marquee).toHaveAttribute('data-selection-operation', 'add');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.selected-item')).toHaveCount(3);

  await items.first().scrollIntoViewIfNeeded();
  boxes = await items.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));
  await page.keyboard.down('Control');
  await page.mouse.move(boxes[0].left - 10, boxes[0].top - 10);
  await page.mouse.down();
  await page.mouse.move(boxes[0].right + 10, boxes[0].bottom + 10, { steps: 5 });
  await expect(marquee).toHaveAttribute('data-selection-operation', 'toggle');
  await expect(page.locator('.marquee-remove-candidate')).toHaveCount(1);
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('.selected-item')).toHaveCount(2);

  await page.mouse.move(boxes[0].right + 10, boxes[0].bottom + 6);
  await page.mouse.down();
  await page.mouse.move((boxes[0].left + boxes[0].right) / 2, (boxes[0].top + boxes[0].bottom) / 2, { steps: 5 });
  await expect(marquee).toHaveAttribute('data-selection-mode', 'intersect');
  await expect(page.locator('.marquee-candidate')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.selected-item')).toHaveCount(1);
  await expect(page.locator('.selected-item')).toContainText('Satu');
});

test('tur onboarding dapat dijalankan dan diselesaikan', async ({ page }) => {
  await openReadyApp(page);
  await page.locator('#btnStartOnboarding').click();
  await expect(page.locator('#onboardingCard')).toBeVisible();
  await expect(page.locator('#onboardingProgress')).toHaveText('1 / 5');
  for (let index = 0; index < 5; index++) await page.locator('#btnOnboardingNext').click();
  await expect(page.locator('#onboardingCard')).toBeHidden();
});

test('PWA memiliki manifest dan service worker siap untuk offline', async ({ page, context, browserName }) => {
  await openReadyApp(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.ready.then(() => true))).toBe(true);
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('./manifest.webmanifest');
  if (browserName === 'webkit') {
    expect(await page.evaluate(() => caches.keys().then(keys => keys.some(key => key.startsWith('kartesian-'))))).toBe(true);
    return;
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.admin-panel')).toBeVisible();
  await context.setOffline(false);
});

test('memuat UI, Tailwind, editor, dan preview awal', async ({ page }) => {
  const response = await openReadyApp(page);

  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers()['x-content-type-options']).toBe('nosniff');

  await expect(page.locator('.admin-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: '1. Render Preview' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '2. Cetak ke Printer' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /3\. Export ke HTML/ })).toBeEnabled();

  const stylesheetState = await page.evaluate(() => ({
    loaded: [...document.styleSheets].some(sheet => sheet.href?.endsWith('/assets/app.css')),
    panelDisplay: getComputedStyle(document.querySelector('.admin-panel')).display,
    layoutDirection: getComputedStyle(document.querySelector('.layout-split')).flexDirection
  }));

  expect(stylesheetState).toEqual({
    loaded: true,
    panelDisplay: 'block',
    layoutDirection: 'row'
  });
});

test('opsi cetak menggunakan kartu toggle yang aksesibel dan responsif', async ({ page }) => {
  await openReadyApp(page);
  const options = page.getByRole('group', { name: 'Opsi pratinjau dan pencetakan' });
  await expect(options).toBeVisible();
  await expect(options.locator('.print-option-card')).toHaveCount(4);

  const snapping = page.getByRole('checkbox', { name: 'Aktifkan Snapping Magnetik' });
  await expect(snapping).toBeChecked();
  const card = snapping.locator('..');
  const activeBackground = await card.evaluate(element => getComputedStyle(element).backgroundColor);
  await card.click();
  await expect(snapping).not.toBeChecked();
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).backgroundColor))
    .not.toBe(activeBackground);
  await snapping.focus();
  await expect(snapping).toBeFocused();
});

test('editor memvalidasi input live dan pulih setelah JSON diperbaiki', async ({ page }) => {
  await openReadyApp(page);

  expect(await page.evaluate(() => Boolean(window.ace?.edit))).toBe(true);
  await expect(page.locator('#jsonInputEditor')).toBeVisible();
  await setEditorText(page, '[{');
  await expect(page.locator('#jsonValidationStatus')).toContainText('Kesalahan');
  await expect(page.getByRole('button', { name: '2. Cetak ke Printer' })).toBeDisabled();
  await expect(page.locator('#printContainer')).toHaveClass(/preview-invalid/);

  await setEditorText(page, validTextFixture);
  await expect(page.locator('#jsonValidationStatus')).toContainText('Format JSON & Skema Valid');
  await expect(page.getByRole('button', { name: '2. Cetak ke Printer' })).toBeEnabled();
  await expect(page.getByText('Fixture Text', { exact: true })).toBeVisible();
});

test('overlay controller merender ulang panduan dan menormalisasi opacity', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);
  await expect(page.locator('.print-page')).toHaveCount(1);

  await page.locator('#overlayDocSelect').selectOption('doc_1');
  await expect(page.locator('.print-page')).toHaveCount(9);
  const firstOverlay = page.locator('.page-overlay-guide').first();
  await expect(firstOverlay).toHaveAttribute('src', /assets\/doc_1/);

  const opacity = page.locator('#overlayOpacity');
  await opacity.evaluate(element => {
    element.value = '52';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(opacity).toHaveValue('50');
  await expect(page.locator('#opacityVal')).toHaveText('50%');
  await expect.poll(() => firstOverlay.evaluate(element => element.style.opacity)).toBe('0.5');

  await page.getByRole('checkbox', { name: 'Aktif di Layar' }).uncheck();
  await expect(firstOverlay).toBeHidden();
  await page.locator('#overlayDocSelect').selectOption('none');
  await expect(page.locator('.print-page')).toHaveCount(1);
});

test('PDF lokal dirender, disimpan, dan dipulihkan setelah reload', async ({ page }) => {
  await openReadyApp(page);

  await page.locator('#pdfUploadInput').setInputFiles({
    name: 'minimal.pdf',
    mimeType: 'application/pdf',
    buffer: createMinimalPdf()
  });
  await expect(page.locator('#overlayDocSelect')).toHaveValue('uploaded_pdf', { timeout: 15_000 });
  await expect(page.locator('.page-overlay-guide').first()).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('overlay_print_pro_settings');
    return raw ? JSON.parse(raw).overlayDoc : null;
  })).toBe('uploaded_pdf');

  await page.reload();
  await expect(page.locator('#jsonValidationStatus')).toContainText('Peringatan Kecocokan Halaman');
  await expect(page.locator('#overlayDocSelect')).toHaveValue('uploaded_pdf');
  await expect(page.locator('.page-overlay-guide').first()).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
});

test('menyimpan preferensi tema gelap setelah reload', async ({ page }) => {
  await openReadyApp(page);

  await page.getByRole('button', { name: 'Ganti Tema Gelap/Terang' }).click();
  await expect(page.locator('body')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme_preference'))).toBe('dark');

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Ganti Tema Gelap/Terang' })).toContainText('Mode Terang');
});

test('settings controller menyimpan offset dan flag kalibrasi setelah reload', async ({ page }) => {
  await openReadyApp(page);

  await page.locator('#offsetX').fill('2.5');
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'pending');
  await page.locator('#offsetY').fill('-1.5');
  await page.getByRole('checkbox', { name: 'Sembunyikan Marker Kalibrasi pada pratinjau layar' }).check();
  await expect.poll(() => page.evaluate(() => ({
    x: document.documentElement.style.getPropertyValue('--offset-x'),
    y: document.documentElement.style.getPropertyValue('--offset-y')
  }))).toEqual({ x: '2.5mm', y: '-1.5mm' });
  await expect(page.locator('#printContainer')).toHaveClass(/hide-cal-on-preview/);

  await expect.poll(() => page.evaluate(() => localStorage.getItem('overlay_print_pro_settings')))
    .not.toBeNull();
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-state', 'saved');
  await expect(page.locator('#saveStatus')).toHaveText('Tersimpan lokal');
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('#jsonValidationStatus')).toContainText('Format JSON & Skema Valid');
  await expect(page.locator('#offsetX')).toHaveValue('2.5');
  await expect(page.locator('#offsetY')).toHaveValue('-1.5');
  await expect(page.getByRole('checkbox', { name: 'Sembunyikan Marker Kalibrasi pada pratinjau layar' })).toBeChecked();
  await expect(page.locator('#printContainer')).toHaveClass(/hide-cal-on-preview/);
});

test('offset kalibrasi tidak menggeser elemen teks pada canvas preview', async ({ page }) => {
  await openReadyApp(page);

  const textItem = page.locator('.data-item.text-item').first();
  const before = await textItem.boundingBox();
  expect(before).not.toBeNull();

  await page.locator('#offsetX').fill('12.5');
  await page.locator('#offsetY').fill('-8.5');
  await expect.poll(() => page.evaluate(() => ({
    x: document.documentElement.style.getPropertyValue('--offset-x'),
    y: document.documentElement.style.getPropertyValue('--offset-y')
  }))).toEqual({ x: '12.5mm', y: '-8.5mm' });

  const after = await textItem.boundingBox();
  expect(after).not.toBeNull();
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
});

test('fullscreen editor dan modal bantuan dapat dikendalikan dengan keyboard', async ({ page }) => {
  await openReadyApp(page);

  await page.getByRole('button', { name: 'Fullscreen' }).click();
  const editor = page.locator('#editorContainer');
  await expect(editor).toHaveClass(/fullscreen/);

  const [editorBox, viewport] = await Promise.all([
    editor.boundingBox(),
    page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  ]);
  expect(Math.round(editorBox.width)).toBe(viewport.width);
  expect(Math.round(editorBox.height)).toBe(viewport.height);

  await page.keyboard.press('Escape');
  await expect(editor).not.toHaveClass(/fullscreen/);
  await expect(page.locator('.input-area > #editorContainer')).toHaveCount(1);

  const helpButton = page.getByRole('button', { name: 'Panduan Fitur Lengkap' });
  await helpButton.click();
  const helpDialog = page.getByRole('dialog', { name: 'Panduan Fitur & Pintasan Keyboard' });
  await expect(helpDialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('heading', { name: 'Panduan Fitur & Pintasan Keyboard' })).toBeVisible();
  await expect(page.locator('.help-modal')).toContainText('🛠️ Fitur & Cara Penggunaan');
  await expect(page.locator('.help-modal')).toContainText('⌨️ Pintasan Keyboard');
  await expect(page.locator('.help-modal')).toContainText('⚙️ Penyelaras & Kalibrasi');
  const closeHelp = page.getByRole('button', { name: 'Tutup' });
  await expect(closeHelp).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeHelp).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect(helpButton).toBeFocused();
});

test('tambah teks, undo, dan redo memperbarui preview', async ({ page }) => {
  await openReadyApp(page);
  const items = page.locator('.data-item');
  const initialCount = await items.count();

  page.once('dialog', dialog => dialog.accept('1'));
  await page.getByRole('button', { name: /Tambah Teks/ }).click();
  await expect(items).toHaveCount(initialCount + 1);

  const undo = page.getByRole('button', { name: 'Undo perubahan' });
  const redo = page.getByRole('button', { name: 'Redo perubahan' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(items).toHaveCount(initialCount);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(items).toHaveCount(initialCount + 1);
});

test('inline editing, drag, dan resize menyimpan perubahan visual', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);
  await page.getByRole('checkbox', { name: 'Aktifkan Snapping Magnetik' }).uncheck();

  let item = page.locator('.data-item').first();
  let text = item.locator('.text-content');
  await text.dblclick();
  await expect(item).toHaveClass(/editing/);
  await text.fill('Teks Hasil Edit');
  await text.press('Enter');
  item = page.locator('.data-item').first();
  await expect(item.locator('.text-content')).toHaveText('Teks Hasil Edit');

  const positionBefore = await item.evaluate(element => ({ left: element.style.left, top: element.style.top }));
  await item.scrollIntoViewIfNeeded();
  await item.hover({ position: { x: 2, y: 2 } });
  const itemBox = await item.boundingBox();
  await page.mouse.move(itemBox.x + 2, itemBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(itemBox.x + 42, itemBox.y + 32, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => item.evaluate(element => ({ left: element.style.left, top: element.style.top })))
    .not.toEqual(positionBefore);

  const sizeBefore = await item.evaluate(element => ({
    width: element.offsetWidth,
    height: element.offsetHeight,
    fontSize: parseFloat(getComputedStyle(element).fontSize)
  }));
  await item.hover();
  await expect(item.locator('.resize-handle')).toHaveCount(8);
  const resizeHandle = item.locator('.resize-se');
  const handleBox = await resizeHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 12, handleBox.y + handleBox.height / 2 + 14, { steps: 4 });
  await page.mouse.up();
  const sizeAfter = await item.evaluate(element => ({
    width: element.offsetWidth,
    height: element.offsetHeight,
    fontSize: parseFloat(getComputedStyle(element).fontSize)
  }));
  expect(sizeAfter.width).toBeGreaterThan(sizeBefore.width);
  expect(sizeAfter.height).toBeGreaterThan(sizeBefore.height);
  expect(sizeAfter.fontSize).toBe(sizeBefore.fontSize);
  const storedSize = await page.evaluate(() => {
    const data = JSON.parse(window.ace.edit('jsonInputEditor').getValue());
    const storedItem = data[0].pages[0].items[0];
    return { width: storedItem.width, height: storedItem.height };
  });
  expect(storedSize.width).toBeGreaterThan(0);
  expect(storedSize.height).toBeGreaterThan(0);
});

test('delapan arah resize mendukung sisi, sudut, rasio, pusat, dan rotasi', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);
  let item = page.locator('.data-item').first();
  await item.click();
  await expect(item.locator('.resize-handle')).toHaveCount(8);
  expect(await item.locator('.resize-handle').evaluateAll(handles => handles.map(handle => handle.dataset.resizeDirection).sort()))
    .toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);

  await page.locator('[data-property="rotation"]').fill('30');
  await page.locator('[data-property="rotation"]').press('Enter');
  item = page.locator('.data-item').first();
  const before = await item.evaluate(element => ({ left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight }));
  const sideHandle = item.locator('.resize-e');
  await sideHandle.hover();
  const sideBox = await sideHandle.boundingBox();
  await page.mouse.down();
  await page.mouse.move(sideBox.x + sideBox.width / 2 + 18, sideBox.y + sideBox.height / 2, { steps: 5 });
  await page.mouse.up();
  const afterSide = await item.evaluate(element => ({ left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight }));
  expect(afterSide.width).not.toBe(before.width);
  expect({ left: afterSide.left, top: afterSide.top }).not.toEqual({ left: before.left, top: before.top });

  const ratioBefore = afterSide.width / afterSide.height;
  const cornerHandle = item.locator('.resize-se');
  await cornerHandle.hover();
  const cornerBox = await cornerHandle.boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(cornerBox.x + cornerBox.width / 2 + 20, cornerBox.y + cornerBox.height / 2 + 12, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const afterRatio = await item.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight }));
  expect(Math.abs(afterRatio.width / afterRatio.height - ratioBefore) / ratioBefore).toBeLessThan(0.05);

  const centerBefore = await item.evaluate(element => ({
    x: element.offsetLeft + element.offsetWidth / 2,
    y: element.offsetTop + element.offsetHeight / 2
  }));
  const centerHandle = item.locator('.resize-e');
  await centerHandle.hover();
  const centerHandleBox = await centerHandle.boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(centerHandleBox.x + centerHandleBox.width / 2 + 12, centerHandleBox.y + centerHandleBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const centerAfter = await item.evaluate(element => ({
    x: element.offsetLeft + element.offsetWidth / 2,
    y: element.offsetTop + element.offsetHeight / 2
  }));
  expect(Math.abs(centerAfter.x - centerBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(centerAfter.y - centerBefore.y)).toBeLessThanOrEqual(1);
});

test('selection dan keyboard nudge memperbarui elemen lalu dapat dibersihkan', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);

  const item = page.locator('.data-item').first();
  await expect(item).toHaveAttribute('tabindex', '0');
  await expect(item).toHaveAttribute('role', 'group');
  await item.focus();
  await expect(item).toHaveClass(/selected-item/);
  await expect(page.locator('#textFormatToolbar')).toHaveClass(/show/);

  const leftBefore = await item.evaluate(element => parseFloat(element.style.left));
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => item.evaluate(element => parseFloat(element.style.left)))
    .toBeCloseTo(leftBefore + 0.1, 5);

  await page.keyboard.press('Control+z');
  await expect.poll(() => item.evaluate(element => parseFloat(element.style.left)))
    .toBeCloseTo(leftBefore, 5);
  await page.keyboard.press('Control+y');
  await expect.poll(() => item.evaluate(element => parseFloat(element.style.left)))
    .toBeCloseTo(leftBefore + 0.1, 5);

  await item.click();
  await page.locator('.print-page').click({ position: { x: 500, y: 900 } });
  await expect(item).not.toHaveClass(/selected-item/);
  await expect(page.locator('#textFormatToolbar')).not.toHaveClass(/show/);
});

test('floating toolbar menyinkronkan properti presisi elemen teks', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);
  let item = page.locator('.data-item').first();
  await item.click();

  const toolbar = page.locator('#textFormatToolbar');
  await expect(toolbar).toHaveClass(/show/);
  const toggle = page.getByRole('button', { name: 'Tampilkan properti presisi' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#toolbarQuickProperties')).toBeVisible();
  await expect(page.locator('#toolbarPropX')).toHaveValue('20');
  await expect(page.locator('#toolbarPropY')).toHaveValue('30');
  await expect(page.locator('#toolbarPropFontSize')).toHaveValue('10');

  await page.locator('#toolbarPropX').fill('25.5');
  await page.locator('#toolbarPropX').press('Enter');
  item = page.locator('.data-item').first();
  await expect(item).toHaveCSS('left', /px/);
  await expect(page.locator('#toolbarPropX')).toHaveValue('25.5');
  await expect(page.locator('#propertyPanel [data-property="x"]')).toHaveValue('25.5');

  await page.locator('#toolbarPropRotation').fill('20');
  await page.locator('#toolbarPropRotation').press('Enter');
  await expect(page.locator('#propertyPanel [data-property="rotation"]')).toHaveValue('20');
  await expect(toolbar).toHaveClass(/show/);
  await expect(page.locator('#toolbarQuickProperties')).toBeVisible();

  await page.locator('#btnToolbarLock').click();
  await expect(item).toHaveClass(/locked-item/);
  await expect(page.locator('#btnToolbarLock')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#propertyPanel [data-property="locked"]')).toBeChecked();
});

test('live formatting mem-patch elemen tanpa full render lalu commit secara debounce', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);

  const item = page.locator('.data-item').first();
  await item.click();
  await item.evaluate(element => { element.dataset.performanceIdentity = 'preserved'; });
  await page.locator('#textColorPicker').evaluate(input => {
    ['#334455', '#778899', '#abcdef'].forEach(value => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  await expect(page.locator('#saveStatus')).toHaveText('Mengedit…');
  await expect(item).toHaveCSS('color', 'rgb(171, 205, 239)');
  expect(await page.locator('#jsonInput').evaluate(element => {
    return JSON.parse(element.value)[0].pages[0].items[0].color;
  })).toBe('#112233');

  await expect.poll(() => page.locator('#jsonInput').evaluate(element => {
    return JSON.parse(element.value)[0].pages[0].items[0].color;
  })).toBe('#abcdef');
  await expect(item).toHaveAttribute('data-performance-identity', 'preserved');
  await expect(page.locator('#propertyPanel [data-property="color"]')).toHaveValue('#abcdef');

  await page.keyboard.press('Control+z');
  await expect.poll(() => page.locator('#jsonInput').evaluate(element => {
    return JSON.parse(element.value)[0].pages[0].items[0].color;
  })).toBe('#112233');
  await page.keyboard.press('Control+y');
  await expect.poll(() => page.locator('#jsonInput').evaluate(element => {
    return JSON.parse(element.value)[0].pages[0].items[0].color;
  })).toBe('#abcdef');

  await item.click();
  await item.evaluate(element => { element.dataset.performanceIdentity = 'property-preserved'; });
  await page.locator('#propertyPanel [data-property="x"]').fill('27.5');
  await page.locator('#propertyPanel [data-property="x"]').press('Enter');
  await expect(item).toHaveAttribute('data-performance-identity', 'property-preserved');
  await expect(page.locator('#propertyPanel [data-property="x"]')).toHaveValue('27.5');
  await expect(page.locator('#toolbarPropX')).toHaveValue('27.5');
});

test('format, clone, dan delete item menggunakan canvas command layer', async ({ page }) => {
  await openReadyApp(page);
  await loadDocument(page, validTextFixture);

  let items = page.locator('.data-item');
  await items.first().click();
  await page.getByRole('button', { name: 'Tebal (B)' }).click();
  await expect.poll(() => page.locator('#jsonInput').evaluate(element => {
    return JSON.parse(element.value)[0].pages[0].items[0].bold;
  })).toBe(false);
  await expect(items.first()).toHaveCSS('font-weight', '400');

  await page.getByRole('button', { name: 'Miring (I)' }).click();
  await page.getByRole('button', { name: 'Garis Bawah (U)' }).click();
  await page.getByLabel('Warna teks', { exact: true }).fill('#00aa55');
  await page.getByLabel('Warna sorotan', { exact: true }).fill('#ffee00');
  await expect(items.first()).toHaveCSS('font-style', 'italic');
  await expect(items.first()).toHaveCSS('text-decoration-line', 'underline');
  await expect(items.first()).toHaveCSS('color', 'rgb(0, 170, 85)');
  await expect(items.first()).toHaveCSS('background-color', 'rgb(255, 238, 0)');
  await expect.poll(() => page.locator('#jsonInput').evaluate(element => {
    const item = JSON.parse(element.value)[0].pages[0].items[0];
    return { italic: item.italic, underline: item.underline, color: item.color, bg_color: item.bg_color };
  })).toEqual({ italic: true, underline: true, color: '#00aa55', bg_color: '#ffee00' });

  const toolbar = page.locator('#textFormatToolbar');
  await expect(toolbar).toHaveClass(/show/);
  await expect(items.first().getByRole('button', { name: 'Duplikasi elemen' })).toBeHidden();
  await expect(items.first().getByRole('button', { name: 'Hapus elemen' })).toBeHidden();

  const toolbarBox = await toolbar.boundingBox();
  const itemBox = await items.first().boundingBox();
  expect(toolbarBox.y + toolbarBox.height <= itemBox.y || toolbarBox.y >= itemBox.y + itemBox.height).toBe(true);
  await expect(toolbar).toHaveCSS('position', 'fixed');
  await expect(toolbar).toHaveCSS('z-index', '9000');

  const toolbarDuplicateButton = page.getByRole('button', { name: 'Duplikasi elemen terpilih' });
  const hitTarget = await toolbarDuplicateButton.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button')?.id;
  });
  expect(hitTarget).toBe('btnToolbarDuplicate');
  await toolbarDuplicateButton.click();
  await expect(items).toHaveCount(2);
  await expect(page.getByText('1 elemen diduplikasi.', { exact: true })).toBeVisible();

  items = page.locator('.data-item');
  const toolbarDeleteButton = page.getByRole('button', { name: 'Hapus elemen terpilih' });
  await toolbarDeleteButton.click();
  const confirmDialog = page.getByRole('dialog', { name: 'Konfirmasi' });
  await expect(confirmDialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByRole('button', { name: 'Batal' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmDialog).toHaveCount(0);
  await expect(items).toHaveCount(2);
  await expect(toolbar).toHaveClass(/show/);

  await toolbarDeleteButton.click();
  await expect(page.getByRole('heading', { name: 'Konfirmasi' })).toBeVisible();
  await page.getByRole('button', { name: 'Konfirmasi' }).click();
  await expect(items).toHaveCount(1);
});

test('renderer memperlakukan markup pada teks sebagai teks biasa', async ({ page }) => {
  await openReadyApp(page);
  const hostileText = '<img src=x onerror="window.__rendererInjected=true">';
  await loadDocument(page, JSON.stringify([{
    debitur: 'Security Fixture',
    pages: [{
      page_number: 1,
      items: [{ text: hostileText, x: 20, y: 30 }]
    }]
  }]));

  await expect(page.locator('.data-item .text-content')).toHaveText(hostileText);
  await expect(page.locator('.data-item img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rendererInjected)).toBeUndefined();
});

test('pengaturan dapat diekspor dan diimpor kembali', async ({ page }) => {
  await openReadyApp(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ekspor data pengaturan kalibrasi ke file JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('calibration-settings.json');

  const importedSettings = {
    schemaVersion: 1,
    jsonInput: validTextFixture,
    overlayDoc: 'none',
    overlayToggle: false,
    overlayOpacity: 65,
    offsetX: 1.5,
    offsetY: -2,
    hideCalCheck: true,
    hideCalPreviewCheck: false,
    printOverlayCheck: false,
    enableSnapCheck: false
  };

  await page.locator('#importFile').setInputFiles({
    name: 'fixture-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedSettings))
  });

  await expect(page.locator('.toast-success')).toContainText('Pengaturan berhasil diimpor');
  await expect(page.locator('#offsetX')).toHaveValue('1.5');
  await expect(page.locator('#offsetY')).toHaveValue('-2');
  await expect(page.locator('.print-page')).toHaveCount(1);
  await expect(page.locator('.data-item .text-content')).toHaveText('Fixture Text');
});

test('export HTML menghasilkan dokumen mandiri dengan seluruh halaman', async ({ page }) => {
  await openReadyApp(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /3\. Export ke HTML/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('DAFFA_NABIL_HARTONO_export.html');

  const downloadedPath = await download.path();
  const exportedHtml = fs.readFileSync(downloadedPath, 'utf8');
  expect(exportedHtml).toMatch(/^<!DOCTYPE html>/);
  expect(exportedHtml).toContain('<title>Export - DAFFA_NABIL_HARTONO</title>');
  expect(exportedHtml.match(/<div class="print-page">/g)).toHaveLength(9);
  expect(exportedHtml).toContain('@page { size:210mm 330mm; margin:0; }');
  expect(exportedHtml).not.toContain('data-canvas-action');
});

test('aturan print menyembunyikan panel aplikasi dan mempertahankan halaman', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.__kartesianPrintCalled = true;
    };
  });
  await openReadyApp(page);

  await page.getByRole('button', { name: '2. Cetak ke Printer' }).click();
  expect(await page.evaluate(() => window.__kartesianPrintCalled)).toBe(true);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.admin-panel')).toBeHidden();
  const printStyle = await page.locator('.print-page').first().evaluate(element => ({
    width: getComputedStyle(element).width,
    height: getComputedStyle(element).height,
    boxShadow: getComputedStyle(element).boxShadow
  }));
  expect(parseFloat(printStyle.width)).toBeCloseTo(210 * 96 / 25.4, 0);
  expect(parseFloat(printStyle.height)).toBeCloseTo(330 * 96 / 25.4, 0);
  expect(printStyle.boxShadow).toBe('none');
});

test('landmark, status, toolbar, dan reduced motion memiliki kontrak aksesibilitas', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openReadyApp(page);

  await expect(page.getByRole('main', { name: 'Editor Bidik Koordinat' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pratinjau halaman cetak' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Pemformatan teks terpilih' })).toBeAttached();
  await expect(page.locator('#pdfUploadStatus')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#toastContainer')).toHaveAttribute('aria-label', 'Notifikasi');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const transitionDuration = await page.locator('.btn').first().evaluate(
    element => getComputedStyle(element).transitionDuration
  );
  expect(parseFloat(transitionDuration)).toBeLessThanOrEqual(0.01);
  expect(pageErrors).toEqual([]);
});

test('baseline visual panel aplikasi tetap stabil', async ({ page }) => {
  test.skip(Boolean(process.env.CI), 'Baseline visual diverifikasi lokal pada Windows/Edge.');
  await openReadyApp(page);
  await expect(page.locator('.admin-panel')).toHaveScreenshot('admin-panel-light.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01
  });
});
