/**
 * Static server for the production export in `out/`. Used by `pnpm start`, the
 * Playwright suite, and the Cloud Run container (see Dockerfile).
 *
 * Environment:
 * - PORT (default 4174): Cloud Run sets this.
 * - HOST (default 127.0.0.1): the container sets 0.0.0.0.
 *
 * Only Node built-ins are used, so the runtime image needs nothing but `out/` and
 * this file.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..', '..', 'out');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};
/** Formats worth compressing; images, fonts and video are already compressed. */
const COMPRESSIBLE = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.txt',
  '.xml',
  '.svg',
  '.wasm',
  '.webmanifest',
  '.bcmap',
  '.pfb',
]);
const MIN_COMPRESS_BYTES = 1024;
/** Next.js puts content-hashed files here, so they never change under the same URL. */
const IMMUTABLE_PREFIX = '/_next/static/';

/** Security headers written by scripts/build/build-offline.cjs; reloaded when rebuilt. */
let securityHeaders = { mtimeMs: -1, value: {} };
function getSecurityHeaders() {
  const file = path.join(root, 'security-headers.json');
  try {
    const { mtimeMs } = fs.statSync(file);
    if (mtimeMs !== securityHeaders.mtimeMs)
      securityHeaders = { mtimeMs, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    securityHeaders = { mtimeMs: -1, value: {} };
  }
  return securityHeaders.value;
}

/** Compressed bodies, cached per file version; `out/` is read-only at runtime. */
const compressed = new Map();
function compressedBody(file, stat, encoding) {
  const key = `${file}:${stat.mtimeMs}:${stat.size}:${encoding}`;
  let body = compressed.get(key);
  if (!body) {
    const raw = fs.readFileSync(file);
    body =
      encoding === 'br'
        ? zlib.brotliCompressSync(raw, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 },
          })
        : zlib.gzipSync(raw, { level: 9 });
    compressed.set(key, body);
  }
  return body;
}
function pickEncoding(header = '') {
  const accepted = header.split(',').map((part) => part.trim().split(';')[0]);
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  return undefined;
}

function cacheControl(pathname, file) {
  if (path.basename(file) === 'sw.js') return 'no-cache';
  if (pathname.startsWith(IMMUTABLE_PREFIX)) return 'public, max-age=31536000, immutable';
  // Pages and unhashed assets: always revalidate, answered with 304 when unchanged.
  return 'no-cache';
}

/** Resolves a URL path to a file inside `out/`, or undefined. */
function resolveFile(pathname) {
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) return { forbidden: true };
  try {
    let stat = fs.statSync(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = fs.statSync(file);
    }
    return stat.isFile() ? { file, stat } : {};
  } catch {
    return {};
  }
}

function start(port = Number(process.env.PORT || 4174), host = process.env.HOST || '127.0.0.1') {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const resolved = resolveFile(pathname);
    if (resolved.forbidden) {
      res.writeHead(403);
      res.end();
      return;
    }
    const headers = { ...getSecurityHeaders() };
    // Cloud Run terminates TLS and forwards the original scheme.
    if (req.headers['x-forwarded-proto'] === 'https')
      headers['Strict-Transport-Security'] = 'max-age=31536000';
    let { file, stat } = resolved;
    let status = 200;
    if (!file) {
      const notFound = resolveFile('/404.html');
      if (!notFound.file) {
        res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      ({ file, stat } = notFound);
      status = 404;
    }
    const extension = path.extname(file);
    const etag = `"${crypto
      .createHash('sha1')
      .update(`${stat.size}:${stat.mtimeMs}`)
      .digest('base64url')}"`;
    Object.assign(headers, {
      'Content-Type': types[extension] || 'application/octet-stream',
      'Cache-Control': status === 404 ? 'no-store' : cacheControl(pathname, file),
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString(),
    });
    const compressible = COMPRESSIBLE.has(extension) && stat.size >= MIN_COMPRESS_BYTES;
    if (compressible) headers.Vary = 'Accept-Encoding';
    if (status === 200 && req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const encoding = compressible ? pickEncoding(req.headers['accept-encoding']) : undefined;
    if (encoding) {
      const body = compressedBody(file, stat, encoding);
      res.writeHead(status, {
        ...headers,
        'Content-Encoding': encoding,
        'Content-Length': body.length,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(status, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const shown = host === '0.0.0.0' ? 'localhost' : host;
      console.log(`Kartesian: http://${shown}:${server.address().port}`);
      resolve(server);
    });
  });
}
module.exports = { start };
if (require.main === module)
  start().then((server) => {
    // Cloud Run sends SIGTERM before stopping an instance.
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => {
        server.close(() => process.exit(0));
        server.closeAllConnections();
      });
  });
