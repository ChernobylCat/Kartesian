const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'out', 'legacy');
fs.mkdirSync(target, { recursive: true });
for (const file of ['index.html', 'manifest.webmanifest'])
  fs.copyFileSync(path.join(root, file), path.join(target, file));
fs.cpSync(path.join(root, 'assets'), path.join(target, 'assets'), { recursive: true });
function copySource(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) copySource(path.join(directory, entry.name), name);
    else if (/\.(mjs|js|css)$/.test(entry.name)) {
      const to = path.join(target, 'src', name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(directory, entry.name), to);
    }
  }
}
copySource(path.join(root, 'src'));
// The historical worker deletes every cache on the origin. The rollback copy
// deliberately delegates offline caching to the root Next worker instead.
fs.writeFileSync(
  path.join(target, 'src', 'pwa', 'register.mjs'),
  'export async function registerServiceWorker() { return null; }\n',
);
console.log('Legacy rollback application packaged at /legacy/.');
