const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backupDir = path.join(root, 'backups', 'legacy');
const stagingDir = path.join(backupDir, 'standalone');

console.log('--- Starting Legacy Backup ---');

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

function copyFile(relPath) {
  const src = path.join(root, relPath);
  const dest = path.join(stagingDir, relPath);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: ${relPath} not found.`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(relPath) {
  const src = path.join(root, relPath);
  const dest = path.join(stagingDir, relPath);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: directory ${relPath} not found.`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

// 1. Root files
copyFile('index.html');
copyFile('manifest.webmanifest');
copyFile('sw.js');
copyFile('playwright.config.js');

// 2. Assets
copyFile('assets/app.css');
copyDir('assets/vendor');

// 3. Source files
copyFile('src/config.mjs');
copyFile('src/app.mjs');
copyFile('src/input.css');
copyDir('src/app');
copyDir('src/canvas');
copyDir('src/core');
copyDir('src/editor');
copyDir('src/export');
copyDir('src/overlay');
copyDir('src/pdf');
copyDir('src/pwa');
copyDir('src/settings');
copyDir('src/state');
copyDir('src/storage');
copyDir('src/ui');

// 4. Scripts
copyFile('scripts/build-legacy.cjs');
copyFile('scripts/copy-vendor.cjs');

// 5. Tests
copyFile('tests/regression.test.js');
copyDir('tests/e2e');
copyFile('tests/support/static-server.js');
copyFile('tests/support/global-setup.js');

// 6. Runbook
const runbook = `# Kartesian Legacy Standalone Archive
Tanggal Backup: 27 Oktober 2026

Arsip ini berisi seluruh kode sumber, aset vendor, dan pengujian untuk implementasi asli Kartesian (Vanilla JS Single Page Application) sebelum peniadaan legacy codebase.

## Cara Menjalankan Versi Legacy
Aplikasi ini murni statis tanpa ketergantungan build. Anda dapat menjalankannya dengan server web statis apa pun:

### Opsi 1: Menggunakan npx serve
\`\`\`bash
npx serve -l 4173 .
\`\`\`
Buka peramban di http://127.0.0.1:4173

### Opsi 2: Menggunakan Python
\`\`\`bash
python -m http.server 4173
\`\`\`
Buka peramban di http://127.0.0.1:4173

### Opsi 3: Menggunakan Node static-server bawaan
\`\`\`bash
node tests/support/static-server.js
\`\`\`

## Struktur Berkas
- index.html: Entry point aplikasi utama.
- assets/vendor/: Library bawaan (PDF.js, Ace editor, Driver.js).
- assets/app.css: Stylesheet Tailwind terkompilasi.
- src/: Logika aplikasi modular (.mjs).
- tests/: Tes regresi dan tes browser Playwright.
`;
fs.writeFileSync(path.join(stagingDir, 'README-LEGACY.md'), runbook);
fs.writeFileSync(path.join(backupDir, 'README-LEGACY.md'), runbook);

console.log('Creating archive tarball / zip...');
try {
  // Use powershell Compress-Archive or tar
  const archivePath = path.join(backupDir, 'legacy-v1-archive.tar.gz');
  execSync(`tar -czf "${archivePath}" -C "${backupDir}" standalone`, { stdio: 'inherit' });
  console.log(`Created tarball at: ${archivePath}`);
} catch {
  try {
    const zipPath = path.join(backupDir, 'legacy-v1-archive.zip');
    execSync(`powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
    console.log(`Created zip at: ${zipPath}`);
  } catch (err) {
    console.warn('Could not compress, but staging directory is intact:', err.message);
  }
}

console.log('Legacy backup completed successfully at:', backupDir);
