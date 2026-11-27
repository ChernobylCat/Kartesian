const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..', '..');
const assetsDir = path.join(root, 'assets', 'doc_1');
const publicDir = path.join(root, 'public', 'assets', 'doc_1');

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: 210mm 330mm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 210mm;
      height: 330mm;
      margin: 0;
      padding: 16mm 18mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      position: relative;
      font-size: 11pt;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2.5px solid #0f172a;
      padding-bottom: 4mm;
      margin-bottom: 5mm;
      position: relative;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3mm;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 3mm;
    }
    .logo-badge {
      width: 11mm;
      height: 11mm;
      background: #0f172a;
      color: #ffffff;
      border-radius: 2.5mm;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16pt;
      letter-spacing: -1px;
    }
    .brand-text h1 {
      font-size: 14pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #0f172a;
      text-transform: uppercase;
    }
    .brand-text p {
      font-size: 8pt;
      color: #64748b;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .doc-meta {
      text-align: right;
      font-size: 8.5pt;
      color: #334155;
      line-height: 1.4;
    }
    .doc-meta strong {
      color: #0f172a;
    }
    .badge-showcase {
      display: inline-block;
      background: #e2e8f0;
      color: #0f172a;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 1mm 2.5mm;
      border-radius: 1.5mm;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 1mm;
    }
    .doc-title-block {
      text-align: center;
      margin-top: 3mm;
      margin-bottom: 2mm;
    }
    .doc-title-block h2 {
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: 0.3px;
      color: #0f172a;
      text-transform: uppercase;
    }
    .doc-title-block p {
      font-size: 9pt;
      color: #475569;
      font-style: italic;
    }

    .section {
      margin-bottom: 4.5mm;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #0f172a;
      background: #f1f5f9;
      padding: 1.5mm 3mm;
      border-left: 3px solid #0f172a;
      margin-bottom: 2.5mm;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 46mm 1fr;
      row-gap: 2.2mm;
      font-size: 9pt;
      align-items: center;
      padding: 0 1mm;
    }
    .form-label {
      font-weight: 600;
      color: #334155;
    }
    .form-value {
      color: #0f172a;
      border-bottom: 1px dotted #94a3b8;
      min-height: 5.5mm;
      display: flex;
      align-items: center;
      padding-left: 2mm;
    }
    .nik-boxes {
      display: flex;
      gap: 1mm;
    }
    .nik-box {
      width: 4.5mm;
      height: 5.5mm;
      border: 1px solid #64748b;
      border-radius: 0.5mm;
      background: #fafafa;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-top: 1mm;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 1.8mm 2.5mm;
      text-align: left;
    }
    table.data-table th {
      background: #f8fafc;
      font-weight: 700;
      color: #1e293b;
    }
    table.data-table td.center {
      text-align: center;
    }

    .terms-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 1.5mm;
      padding: 2.5mm 3.5mm;
      font-size: 8pt;
      color: #475569;
      line-height: 1.45;
    }
    .terms-box ol {
      padding-left: 4.5mm;
    }
    .terms-box li {
      margin-bottom: 1mm;
    }

    .signature-area {
      display: grid;
      grid-template-columns: 1fr 40mm 1fr;
      gap: 4mm;
      margin-top: 6mm;
      text-align: center;
      font-size: 8.5pt;
    }
    .sign-box-title {
      font-weight: 600;
      color: #334155;
      margin-bottom: 2mm;
    }
    .sign-space {
      height: 22mm;
    }
    .sign-name {
      border-top: 1px solid #0f172a;
      padding-top: 1.5mm;
      font-weight: 700;
      color: #0f172a;
    }
    .materai-box {
      height: 22mm;
      border: 1.5px dashed #94a3b8;
      border-radius: 1.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 7.5pt;
      font-weight: 600;
      color: #64748b;
      background: #fdfdfd;
      gap: 1mm;
    }
    .paraf-box {
      position: absolute;
      right: 18mm;
      bottom: 12mm;
      border: 1px solid #94a3b8;
      padding: 1.5mm 3mm;
      font-size: 7.5pt;
      color: #64748b;
      border-radius: 1mm;
    }

    .footer {
      position: absolute;
      left: 18mm;
      right: 18mm;
      bottom: 6mm;
      border-top: 1px solid #cbd5e1;
      padding-top: 2mm;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #64748b;
    }
    .cal-corner {
      position: absolute;
      font-size: 6.5pt;
      font-family: monospace;
      color: #ef4444;
      opacity: 0.6;
    }
    .cal-tl { top: 10mm; left: 10mm; }
    .cal-tr { top: 10mm; right: 10mm; }
    .cal-bl { bottom: 10mm; left: 10mm; }
    .cal-br { bottom: 10mm; right: 10mm; }
  </style>
</head>
<body>
  <div class="cal-corner cal-tl">+ 10mm</div>
  <div class="cal-corner cal-tr">10mm +</div>
  <div class="cal-corner cal-bl">+ 10mm</div>
  <div class="cal-corner cal-br">10mm +</div>

  <div class="header">
    <div class="header-top">
      <div class="brand">
        <div class="logo-badge">K</div>
        <div class="brand-text">
          <h1>Kartesian Document Studio</h1>
          <p>Precision Overlay Positioning & Calibration Engine</p>
        </div>
      </div>
      <div class="doc-meta">
        <div>No: <strong>KRT/2026/SHOWCASE-01</strong></div>
        <div>Satuan: <strong>milimeter (mm)</strong></div>
        <div class="badge-showcase">Template Showcase</div>
      </div>
    </div>
    <div class="doc-title-block">
      <h2>Formulir Registrasi & Pengesahan Layanan</h2>
      <p>Dokumen Resmi Showcase untuk Pengujian Cetak Overlay & Pemetaan Koordinat</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">I. Identitas Pemohon / Pihak Pertama</div>
    <div class="form-grid">
      <div class="form-label">Nama Lengkap</div>
      <div class="form-value"></div>

      <div class="form-label">Nomor Induk Kependudukan</div>
      <div class="form-value" style="border-bottom:none; padding-left:0;">
        <div class="nik-boxes">
          <div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div>
          <div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div>
          <div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div>
          <div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div><div class="nik-box"></div>
        </div>
      </div>

      <div class="form-label">Tempat / Tanggal Lahir</div>
      <div class="form-value"></div>

      <div class="form-label">Alamat Lengkap Domisili</div>
      <div class="form-value"></div>

      <div class="form-label">Nomor Telepon / WhatsApp</div>
      <div class="form-value"></div>

      <div class="form-label">Instansi / Unit Kerja</div>
      <div class="form-value"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">II. Spesifikasi Komponen Cetak & Penempatan Koordinat</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 8mm;" class="center">No</th>
          <th style="width: 45mm;">Komponen Formulir</th>
          <th>Rentang Koordinat</th>
          <th>Toleransi Kalibrasi</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="center">1</td>
          <td>Bidang Teks Data Pemohon</td>
          <td>X: 64.0 mm — 192.0 mm, Y: 56.0 mm — 100.0 mm</td>
          <td>± 0.2 mm (High Precision)</td>
        </tr>
        <tr>
          <td class="center">2</td>
          <td>Tabel Rincian Layanan</td>
          <td>X: 18.0 mm — 192.0 mm, Y: 110.0 mm — 160.0 mm</td>
          <td>± 0.5 mm (Grid Alignment)</td>
        </tr>
        <tr>
          <td class="center">3</td>
          <td>Area Tempel Materai</td>
          <td>X: 85.0 mm — 125.0 mm, Y: 240.0 mm — 262.0 mm</td>
          <td>Kotak 40 × 22 mm</td>
        </tr>
        <tr>
          <td class="center">4</td>
          <td>Pengesahan Tanda Tangan</td>
          <td>X: 18.0 mm (Kiri) & X: 140.0 mm (Kanan)</td>
          <td>Garis Batas Bawah 272.0 mm</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">III. Pernyataan & Ketentuan Demonstrasi</div>
    <div class="terms-box">
      <ol>
        <li>Template ini dirancang khusus untuk mendemonstrasikan kapabilitas percetakan presisi Kartesian; panduan diskalakan proporsional ke ukuran kertas yang dipilih.</li>
        <li>Teks dan gambar dapat ditumpangkan (overlay) secara dinamis menggunakan koordinat milimeter tanpa menggeser tata letak formulir dasar.</li>
        <li>Semua elemen dan data yang diposisikan melalui Kartesian disimpan secara privat dan langsung pada media penyimpanan lokal browser Anda.</li>
      </ol>
    </div>
  </div>

  <div class="signature-area">
    <div>
      <div class="sign-box-title">Pemohon / Pihak Pertama</div>
      <div class="sign-space"></div>
      <div class="sign-name">( .................................................... )</div>
    </div>
    <div>
      <div class="materai-box">
        <span>MATERAI</span>
        <span>TEMPEL</span>
        <span style="font-size: 6.5pt; color: #94a3b8;">Rp 10.000</span>
      </div>
    </div>
    <div>
      <div class="sign-box-title">Petugas Verifikator</div>
      <div class="sign-space"></div>
      <div class="sign-name">( .................................................... )</div>
    </div>
  </div>

  <div class="paraf-box">
    Paraf Petugas: [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]
  </div>

  <div class="footer">
    <span>Kartesian Precision Overlay · Formulir Showcase Resmi</span>
    <span>Koordinat dalam milimeter · Halaman 1 dari 1</span>
  </div>
</body>
</html>`;

async function main() {
  console.log('Generating showcase PDF and PNG...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1700, height: 2600 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  // 1. Generate PDF (exact 210mm x 330mm)
  const pdfPathAssets = path.join(assetsDir, 'showcase.pdf');
  const pdfPathPublic = path.join(publicDir, 'showcase.pdf');
  const pdfBuffer = await page.pdf({
    width: '210mm',
    height: '330mm',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  fs.writeFileSync(pdfPathAssets, pdfBuffer);
  fs.writeFileSync(pdfPathPublic, pdfBuffer);
  console.log('Wrote showcase.pdf to assets and public.');

  // 2. Generate PNG screenshot (exact 1700 x 2600 px)
  // Scale body to fill the 1700x2600 viewport proportionally so it does not render shrunken in top-left
  await page.evaluate(() => {
    document.body.style.transform = 'scale(2.141865, 2.084596)';
    document.body.style.transformOrigin = '0 0';
  });
  const pngPath1 = path.join(assetsDir, 'showcase-1.png');
  const pngPathPublic1 = path.join(publicDir, 'showcase-1.png');
  const pngBuffer = await page.screenshot({ type: 'png' });
  fs.writeFileSync(pngPath1, pngBuffer);
  fs.writeFileSync(pngPathPublic1, pngBuffer);
  console.log('Wrote showcase-1.png to assets and public (1700x2600).');

  await browser.close();
  console.log('Showcase generation complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
