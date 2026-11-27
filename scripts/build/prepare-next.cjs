const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
function copy(source, target) {
  const from = path.join(root, source),
    to = path.join(root, target);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
copy('assets/icons', 'public/icons');
copy('assets/doc_1', 'public/assets/doc_1');
copy('assets/landing', 'public/assets/landing');
copy('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/vendor/pdf.worker.min.mjs');
for (const directory of ['cmaps', 'standard_fonts', 'wasm'])
  if (fs.existsSync(path.join(root, 'node_modules/pdfjs-dist', directory)))
    copy(`node_modules/pdfjs-dist/${directory}`, `public/vendor/${directory}`);
for (const file of ['ace.js', 'mode-json.js', 'theme-chrome.js', 'theme-tomorrow_night.js'])
  copy(`node_modules/ace-builds/src-min-noconflict/${file}`, `public/vendor/${file}`);
for (const weight of ['400', '700'])
  copy(
    `node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-${weight}-normal.woff2`,
    `public/fonts/plus-jakarta-sans-latin-${weight}-normal.woff2`,
  );
for (const [source, name] of [
  ['pdfjs-dist/LICENSE', 'PDFJS-LICENSE.txt'],
  ['ace-builds/LICENSE', 'ACE-LICENSE.txt'],
  ['@fontsource/plus-jakarta-sans/LICENSE', 'FONT-LICENSE.txt'],
])
  if (fs.existsSync(path.join(root, 'node_modules', source)))
    copy(`node_modules/${source}`, `public/vendor/${name}`);
console.log('Next assets prepared (PDF worker, fonts, guides, Ace).');
