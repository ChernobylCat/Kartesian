const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'out');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};
function start(port = Number(process.env.PORT || 4174)) {
  const headers = JSON.parse(fs.readFileSync(path.join(root, 'security-headers.json'), 'utf8'));
  const server = http.createServer((req, res) => {
    let relative;
    try {
      relative = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    let file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      ...headers,
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': path.basename(file) === 'sw.js' ? 'no-cache' : 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`Kartesian Next.js: http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}
module.exports = { start };
if (require.main === module)
  start().then((server) => {
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => {
        server.close(() => process.exit(0));
        server.closeAllConnections();
      });
  });
