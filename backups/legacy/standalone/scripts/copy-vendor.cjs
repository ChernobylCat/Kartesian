const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const vendorDirectory = path.join(projectRoot, 'assets', 'vendor');
const files = [
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['node_modules/ace-builds/src-min-noconflict/ace.js', 'ace.js'],
  ['node_modules/ace-builds/src-min-noconflict/mode-json.js', 'mode-json.js'],
  ['node_modules/ace-builds/src-min-noconflict/theme-chrome.js', 'theme-chrome.js'],
  ['node_modules/ace-builds/src-min-noconflict/theme-tomorrow_night.js', 'theme-tomorrow_night.js'],
  ['node_modules/lucide/dist/umd/lucide.min.js', 'lucide.min.js'],
  ['node_modules/driver.js/dist/driver.js.mjs', 'driver.mjs'],
  ['node_modules/driver.js/dist/driver.css', 'driver.css'],
  ['node_modules/ace-builds/LICENSE', 'ACE-LICENSE.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'PDFJS-LICENSE.txt'],
  ['node_modules/lucide/LICENSE', 'LUCIDE-LICENSE.txt'],
  ['node_modules/driver.js/license', 'DRIVERJS-LICENSE.txt'],
];

fs.mkdirSync(vendorDirectory, { recursive: true });
files.forEach(([source, target]) => {
  const sourcePath = path.join(projectRoot, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Vendor source tidak ditemukan: ${source}`);
  fs.copyFileSync(sourcePath, path.join(vendorDirectory, target));
});

console.log(`Vendor assets: ${files.length} files copied`);
