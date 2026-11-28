const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { skipOnboarding } = require('../../tests/support/onboarding.cjs');

const rootDir = path.resolve(__dirname, '..', '..');
const videosDir = path.join(rootDir, 'videos');
const publicAssetsDir = path.join(rootDir, 'public', 'assets');

if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}
if (!fs.existsSync(publicAssetsDir)) {
  fs.mkdirSync(publicAssetsDir, { recursive: true });
}

// Initial showcase dataset (clean Indonesian financial/notarial F4 layout)
const showcaseDataset = [
  {
    title: 'Formulir Dokumen Perjanjian',
    pages: [
      {
        page_number: 1,
        items: [
          {
            id: 'item-title-1',
            text: 'SURAT PERNYATAAN DOKUMEN RESMI',
            x: 35,
            y: 42,
            font_size: 13,
            bold: true,
            underline: false,
            color: '#0f172a',
            font_family: 'Arial, sans-serif'
          },
          {
            id: 'item-nama-1',
            text: 'Budi Santoso, S.Kom.',
            x: 68,
            y: 62.5,
            font_size: 10,
            bold: true,
            color: '#1e3a8a',
            font_family: 'Arial, sans-serif'
          },
          {
            id: 'item-nik-1',
            text: '3 2 7 1 0 2 1 9 9 4 0 8 0 0 0 1',
            x: 68,
            y: 72,
            font_size: 9.5,
            bold: true,
            color: '#0f172a',
            font_family: 'Courier New, Courier, monospace'
          },
          {
            id: 'item-nominal-1',
            text: 'Rp 250.000.000,- (Dua Ratus Lima Puluh Juta Rupiah)',
            x: 68,
            y: 91,
            font_size: 9.5,
            bold: false,
            color: '#047857',
            font_family: 'Arial, sans-serif'
          }
        ]
      }
    ]
  }
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveSmooth(page, targetX, targetY, steps = 18) {
  const current = page._mousePos || { x: 960, y: 540 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Ease-out cubic formula
    const ease = 1 - Math.pow(1 - t, 3);
    const curX = current.x + (targetX - current.x) * ease;
    const curY = current.y + (targetY - current.y) * ease;
    await page.mouse.move(curX, curY);
    await page.evaluate(({ x, y }) => window.__updateShowcaseCursor && window.__updateShowcaseCursor(x, y, false), { x: curX, y: curY });
    await sleep(14);
  }
  page._mousePos = { x: targetX, y: targetY };
}

async function clickSmooth(page, targetX, targetY) {
  await moveSmooth(page, targetX, targetY, 16);
  await sleep(100);
  await page.evaluate(({ x, y }) => window.__updateShowcaseCursor && window.__updateShowcaseCursor(x, y, true), { x: targetX, y: targetY });
  await page.mouse.down();
  await sleep(120);
  await page.mouse.up();
  await page.evaluate(({ x, y }) => window.__updateShowcaseCursor && window.__updateShowcaseCursor(x, y, false), { x: targetX, y: targetY });
  await sleep(180);
}

async function clickLocatorSmooth(page, locator) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const box = await locator.boundingBox({ timeout: 4000 });
    if (box) {
      await clickSmooth(page, box.x + box.width / 2, box.y + box.height / 2);
    }
  } catch (e) {
    console.warn('⚠️ Gagal klik locator:', e.message);
  }
}

async function dragSmooth(page, startX, startY, endX, endY, steps = 24) {
  await moveSmooth(page, startX, startY, 15);
  await sleep(120);
  await page.evaluate(({ x, y }) => window.__updateShowcaseCursor && window.__updateShowcaseCursor(x, y, true), { x: startX, y: startY });
  await page.mouse.down();
  await sleep(100);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * (2 - t);
    const curX = startX + (endX - startX) * ease;
    const curY = startY + (endY - startY) * ease;
    await page.mouse.move(curX, curY);
    await page.evaluate(({ x, y }) => window.__updateShowcaseCursor && window.__updateShowcaseCursor(x, y, true), { x: curX, y: curY });
    await sleep(18);
  }

  await sleep(100);
  await page.mouse.up();
  await page.evaluate(({ x, y }) => window.__updateShowcaseCursor && window.__updateShowcaseCursor(x, y, false), { x: endX, y: endY });
  page._mousePos = { x: endX, y: endY };
  await sleep(200);
}

async function showBadge(page, icon, title, subtitle = '') {
  await page.evaluate(({ icon, title, subtitle }) => {
    if (window.__setShowcaseCaption) {
      window.__setShowcaseCaption(icon, title, subtitle);
    }
  }, { icon, title, subtitle });
  await sleep(400);
}

async function hideBadge(page) {
  await page.evaluate(() => {
    if (window.__hideShowcaseCaption) {
      window.__hideShowcaseCaption();
    }
  });
  await sleep(250);
}

async function run() {
  console.log('🎬 Memulai proses perekaman video presentasi showcase Kartesian...');
  
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: videosDir,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  page._mousePos = { x: 960, y: 540 };

  // Set initial workspace state with sample document
  await skipOnboarding(page);
  await page.addInitScript((docData) => {
    try {
      localStorage.setItem('overlay_print_pro_settings', JSON.stringify({
        schemaVersion: 1,
        jsonInput: JSON.stringify(docData),
        overlayDoc: 'none',
        dark: true,
      }));
    } catch (e) {
      console.error(e);
    }
  }, showcaseDataset);

  console.log('📍 Membuka Kartesian di http://localhost:3000/editor/...');
  await page.goto('http://localhost:3000/editor/', { waitUntil: 'networkidle' });

  // Handle StrictMode initial lock recovery if shown
  const retryBtn = page.getByRole('button', { name: 'Coba lagi' });
  if (await retryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('🔄 Menghubungkan sesi workspace lokal...');
    await retryBtn.click();
    await sleep(1500);
  }

  await page.waitForSelector('h1:has-text("Kartesian")', { timeout: 15000 });

  // Inject professional cursor and badge overlays
  await page.evaluate(() => {
    // 1. Sleek Virtual Cursor
    const cursor = document.createElement('div');
    cursor.id = '__playwright_cursor';
    cursor.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.9);
      border: 2.5px solid #ffffff;
      box-shadow: 0 0 16px rgba(59, 130, 246, 0.7), 0 3px 8px rgba(0,0,0,0.4);
      pointer-events: none;
      z-index: 9999999;
      transform: translate(-50%, -50%);
      transition: width 0.12s ease, height 0.12s ease, background 0.12s ease, transform 0.08s ease;
    `;
    document.body.appendChild(cursor);

    // 2. Showcase Presentation Banner (Bottom Center)
    const badge = document.createElement('div');
    badge.id = '__showcase_badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(30, 41, 59, 0.94));
      backdrop-filter: blur(16px);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.16);
      padding: 12px 28px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 14px 35px -6px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.1);
      z-index: 9999998;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0;
      transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    document.body.appendChild(badge);

    window.__updateShowcaseCursor = (x, y, clicking = false) => {
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
      if (clicking) {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.78)';
        cursor.style.background = 'rgba(239, 68, 68, 0.95)';
        cursor.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.8), 0 2px 6px rgba(0,0,0,0.5)';
      } else {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.background = 'rgba(59, 130, 246, 0.9)';
        cursor.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.7), 0 3px 8px rgba(0,0,0,0.4)';
      }
    };

    window.__setShowcaseCaption = (icon, title, subtitle) => {
      badge.innerHTML = `
        <span style="font-size: 22px; line-height: 1;">${icon}</span>
        <div style="display: flex; flex-direction: column; text-align: left;">
          <span style="font-size: 14px; font-weight: 700; letter-spacing: 0.3px;">${title}</span>
          ${subtitle ? `<span style="font-size: 11.5px; color: #94a3b8; font-weight: 500;">${subtitle}</span>` : ''}
        </div>
      `;
      badge.style.opacity = '1';
      badge.style.transform = 'translateX(-50%) translateY(0)';
    };

    window.__hideShowcaseCaption = () => {
      badge.style.opacity = '0';
      badge.style.transform = 'translateX(-50%) translateY(16px)';
    };
  });

  // Set zoom to 75% for optimal full-page overview on 1080p
  const zoomSelect = page.locator('#canvasZoom');
  if (await zoomSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    await zoomSelect.selectOption('0.75');
  }

  // Initial cursor position
  await moveSmooth(page, 960, 540, 10);
  await sleep(800);

  // ==========================================
  // SCENE 1: Introduction & High-Precision Canvas
  // ==========================================
  console.log('🎥 Scene 1: Introduction & Workspace Overview');
  await showBadge(page, '⚡', 'Kartesian · High-Precision Coordinate Editor', 'Visual Layout & Print Alignment Engine untuk Kertas F4 & Dokumen PDF');
  await moveSmooth(page, 200, 32, 20); // Hover brand
  await sleep(1500);

  // ==========================================
  // SCENE 2: Dark / Light Mode Switch
  // ==========================================
  console.log('🎥 Scene 2: Theme Switching');
  await showBadge(page, '🌓', 'Dark & Light Theme Mode', 'Pengalaman visual modern dengan transisi palet warna yang halus');
  const themeBtn = page.getByRole('button', { name: 'Ganti tema' });
  if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, themeBtn);
    await sleep(1200);
    await clickLocatorSmooth(page, themeBtn);
    await sleep(1000);
  }

  // ==========================================
  // SCENE 3: Background Showcase PDF Overlay
  // ==========================================
  console.log('🎥 Scene 3: PDF / Form Overlay & Transparency Control');
  await showBadge(page, '📄', 'Panduan Template Formulir & PDF Overlay', 'Posisikan teks presisi di atas formulir fisik tanpa distorsi rasio');
  
  const bgSelect = page.getByRole('combobox', { name: 'Background' });
  if (await bgSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, bgSelect);
    await sleep(300);
    await bgSelect.selectOption('doc_1');
    await sleep(1500);
  }

  // Slider Opacity
  const opacitySlider = page.getByLabel('Opacity panduan');
  if (await opacitySlider.isVisible({ timeout: 3000 }).catch(() => false)) {
    const sliderBox = await opacitySlider.boundingBox();
    if (sliderBox) {
      // Drag slider to 80%
      await dragSmooth(page, sliderBox.x + sliderBox.width * 0.35, sliderBox.y + sliderBox.height / 2, sliderBox.x + sliderBox.width * 0.8, sliderBox.y + sliderBox.height / 2, 16);
      await sleep(1000);
      // Drag slider back to 45%
      await dragSmooth(page, sliderBox.x + sliderBox.width * 0.8, sliderBox.y + sliderBox.height / 2, sliderBox.x + sliderBox.width * 0.45, sliderBox.y + sliderBox.height / 2, 16);
      await sleep(1000);
    }
  }

  // ==========================================
  // SCENE 4: Interactive Rulers & Dynamic Guides
  // ==========================================
  console.log('🎥 Scene 4: Interactive Canvas Rulers');
  await showBadge(page, '📏', 'Penggaris Interaktif & Penunjuk Metrik Milimeter', 'Pelacakan koordinat kursor real-time dan panduan garis bantu');
  
  const canvasPage = page.locator('.canvas-page').first();
  const pageBox = await canvasPage.boundingBox();
  if (pageBox) {
    // Smoothly glide cursor across the canvas to show ruler crosshairs tracking
    await moveSmooth(page, pageBox.x + 80, pageBox.y + 120, 20);
    await sleep(600);
    await moveSmooth(page, pageBox.x + 350, pageBox.y + 220, 25);
    await sleep(600);
    await moveSmooth(page, pageBox.x + 220, pageBox.y + 400, 25);
    await sleep(800);
  }

  // ==========================================
  // SCENE 5: Adding Elements & Magnetic Snapping
  // ==========================================
  console.log('🎥 Scene 5: Adding & Dragging Elements');
  await showBadge(page, '🧲', 'Drag-and-Drop dengan Magnetic Snapping', 'Menempel otomatis pada garis bantu dan elemen lain untuk kerapian maksimal');
  
  const btnAddText = page.locator('#btnAddText');
  if (await btnAddText.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, btnAddText);
    await sleep(1000);
  }

  // Locate the newly added element
  const items = page.locator('.canvas-item');
  const count = await items.count();
  if (count > 0) {
    const newItem = items.nth(count - 1);
    const newItemBox = await newItem.boundingBox();

    if (newItemBox && pageBox) {
      // Drag new item to signature section on the form
      await dragSmooth(
        page,
        newItemBox.x + newItemBox.width / 2,
        newItemBox.y + newItemBox.height / 2,
        pageBox.x + pageBox.width * 0.65,
        pageBox.y + pageBox.height * 0.72,
        28
      );
      await sleep(1000);
    }
  }

  // ==========================================
  // SCENE 6: Floating Formatting Toolbar & Properties
  // ==========================================
  console.log('🎥 Scene 6: Floating Formatting Toolbar');
  await showBadge(page, '🎨', 'Toolbar Format Kontekstual & Handle 8-Arah', 'Pengaturan tipografi instan: Bold, Italic, Warna, dan Ukuran Huruf');
  
  // Click on the title item
  const titleItem = page.locator('.canvas-item').filter({ hasText: 'SURAT PERNYATAAN' }).first();
  if (await titleItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, titleItem);
    await sleep(800);

    // Toggle Italic on floating toolbar
    const italicBtn = page.getByRole('button', { name: 'Miring' });
    if (await italicBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clickLocatorSmooth(page, italicBtn);
      await sleep(800);
      await clickLocatorSmooth(page, italicBtn);
      await sleep(600);
    }
  }

  // Select nominal item
  const nominalItem = page.locator('.canvas-item').filter({ hasText: 'Rp 250.000.000' }).first();
  if (await nominalItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, nominalItem);
    await sleep(1000);
  }

  // ==========================================
  // SCENE 7: Printer Calibration & Offset Compensation
  // ==========================================
  console.log('🎥 Scene 7: Hardware Printer Calibration');
  await showBadge(page, '⚙️', 'Kalibrasi Offset Printer Fisik', 'Kompensasi pergeseran hardware (X/Y mm) untuk akurasi cetak sempurna');
  
  const settingsSummary = page.getByText('Cetak, kalibrasi & penyimpanan');
  if (await settingsSummary.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, settingsSummary);
    await sleep(1000);
  }

  const offsetXField = page.getByLabel('Offset X · mm');
  if (await offsetXField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await clickLocatorSmooth(page, offsetXField);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1.5', { delay: 100 });
    await sleep(800);
  }

  const offsetYField = page.getByLabel('Offset Y · mm');
  if (await offsetYField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await clickLocatorSmooth(page, offsetYField);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('-2.0', { delay: 100 });
    await sleep(1000);
  }

  // ==========================================
  // SCENE 8: Bi-directional JSON Schema & Standalone Export
  // ==========================================
  console.log('🎥 Scene 8: JSON Data Sync & Standalone Export');
  await showBadge(page, '💾', 'Sinkronisasi JSON Dua Arah & Ekspor Standalone', 'Data tersimpan lokal, ekspor cetak PDF dan HTML portabel tanpa dependensi');

  const jsonSummary = page.getByText('Data JSON');
  if (await jsonSummary.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickLocatorSmooth(page, jsonSummary);
    await sleep(1200);
  }

  // Hover over Export and Print buttons
  const exportBtn = page.getByRole('button', { name: 'Ekspor HTML' });
  if (await exportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const btnBox = await exportBtn.boundingBox();
    if (btnBox) {
      await moveSmooth(page, btnBox.x + 30, btnBox.y + 15, 18);
      await sleep(800);
    }
  }

  const printBtn = page.locator('#btnPrint');
  if (await printBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const printBox = await printBtn.boundingBox();
    if (printBox) {
      await moveSmooth(page, printBox.x + 30, printBox.y + 15, 18);
      await sleep(800);
    }
  }

  // ==========================================
  // SCENE 9: Grand Finale / Outro
  // ==========================================
  console.log('🎥 Scene 9: Outro Wrap-Up');
  await showBadge(page, '🚀', 'Kartesian · Modern, Cepat, dan Siap Produksi', 'Next.js 16 · React 19 · TypeScript · Zustand · Tailwind CSS v4');
  await moveSmooth(page, 960, 540, 20);
  await sleep(2500);

  await hideBadge(page);
  await sleep(1000);

  console.log('💾 Menyelesaikan dan menyimpan video...');
  await page.close();
  await context.close();
  await browser.close();

  // Find recorded video in videosDir
  const videoFiles = fs.readdirSync(videosDir).filter(f => f.endsWith('.webm'));
  if (videoFiles.length > 0) {
    // Sort by modification time descending
    videoFiles.sort((a, b) => {
      return fs.statSync(path.join(videosDir, b)).mtimeMs - fs.statSync(path.join(videosDir, a)).mtimeMs;
    });

    const newestVideo = videoFiles[0];
    const sourceVideoPath = path.join(videosDir, newestVideo);
    const targetVideoPath = path.join(videosDir, 'kartesian-showcase.webm');
    const publicVideoPath = path.join(publicAssetsDir, 'kartesian-showcase.webm');

    fs.copyFileSync(sourceVideoPath, targetVideoPath);
    fs.copyFileSync(sourceVideoPath, publicVideoPath);

    console.log(`\n🎉 SUKSES! Video showcase berhasil direkam dan disimpan di:`);
    console.log(`   - File Project: ${targetVideoPath}`);
    console.log(`   - Public Web:   ${publicVideoPath}`);
    console.log(`   - Ukuran File:  ${(fs.statSync(targetVideoPath).size / (1024 * 1024)).toFixed(2)} MB`);
  }
}

run().catch((err) => {
  console.error('❌ Error recording showcase:', err);
  process.exit(1);
});
