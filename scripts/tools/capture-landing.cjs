// Regenerates the landing page screenshots in assets/landing. Run after `pnpm run build` (`pnpm run capture:landing`).
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const { chromium } = require('@playwright/test');
const out = process.argv[2] || path.join(root, 'assets/landing');
const F = 'Arial, sans-serif';
const data = [
  {
    title: 'Formulir Registrasi',
    pages: [
      {
        page_number: 1,
        items: [
          {
            text: 'Budi Santoso, S.Kom.',
            x: 66,
            y: 69.4,
            font_size: 10,
            bold: true,
            color: '#1e3a8a',
            font_family: F,
          },
          {
            text: '3 2 7 1 0 2 1 9 9 4 0 8 0 0 0 1',
            x: 66.1,
            y: 76.9,
            font_size: 13,
            bold: true,
            color: '#0f172a',
            font_family: 'Courier New, Courier, monospace',
          },
          {
            text: 'Bandung, 14 Agustus 1994',
            x: 66,
            y: 84.3,
            font_size: 10,
            bold: false,
            color: '#1e3a8a',
            font_family: F,
          },
          {
            text: 'Jl. Merdeka No. 12, Bandung 40111',
            x: 66,
            y: 91.7,
            font_size: 10,
            bold: false,
            color: '#1e3a8a',
            font_family: F,
          },
          {
            text: '0812-3456-7890',
            x: 66,
            y: 99.1,
            font_size: 10,
            bold: false,
            color: '#1e3a8a',
            font_family: F,
          },
          {
            text: '{{instansi}}',
            x: 66,
            y: 106.5,
            font_size: 10,
            bold: true,
            color: '#047857',
            font_family: F,
          },
          {
            text: 'Budi Santoso',
            x: 37.5,
            y: 239.5,
            font_size: 10,
            bold: true,
            color: '#0f172a',
            font_family: F,
          },
        ],
      },
    ],
  },
];
(async () => {
  const server = await require('../build/serve-next.cjs').start(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const dark of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: 2,
        colorScheme: dark ? 'dark' : 'light',
      });
      const page = await context.newPage();
      await page.addInitScript(
        ([value, dark]) => {
          localStorage.setItem('kartesian_onboarding_complete_v1', 'true');
          localStorage.setItem('theme_preference', dark ? 'dark' : 'light');
          localStorage.setItem(
            'overlay_print_pro_settings',
            JSON.stringify({
              schemaVersion: 1,
              jsonInput: JSON.stringify(value),
              overlayDoc: 'doc_1',
              overlayOpacity: '100',
              dark,
            }),
          );
        },
        [data, dark],
      );
      await page.goto(`${base}/editor/`);
      await page.locator('.canvas-item').first().waitFor();
      await page.waitForTimeout(1500);
      await page.locator('.canvas-item').first().click();
      await page.mouse.move(5, 500);
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(out, `editor-${dark ? 'dark' : 'light'}.jpg`),
        type: 'jpeg',
        quality: 80,
        clip: { x: 600, y: 140, width: 720, height: 560 },
      });
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
    server.closeAllConnections();
  }
})();
