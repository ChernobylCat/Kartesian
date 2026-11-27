const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', 'out');
const walk = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
const files = walk(root).filter(
  (file) => !['sw.js', '_headers'].includes(path.basename(file)) && !file.endsWith('.map'),
);
const urls = [
  '/',
  ...files.map(
    (file) =>
      '/' +
      file
        .slice(root.length + 1)
        .split(path.sep)
        .map(encodeURIComponent)
        .join('/'),
  ),
];
const hash = crypto.createHash('sha256');
files.forEach((file) => hash.update(fs.readFileSync(file)));
const version = hash.digest('hex').slice(0, 16);
const worker = `const CACHE = 'kartesian-next-${version}';
const URLS = ${JSON.stringify(urls)};
let activation = null;
self.addEventListener('install',event => event.waitUntil(caches.open(CACHE).then(async cache => {
  for(let i=0;i<URLS.length;i+=20) await cache.addAll(URLS.slice(i,i+20));
})));
self.addEventListener('activate',event => event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>(name.startsWith('kartesian-next-')||/^kartesian-v\\d+$/.test(name))&&name!==CACHE).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));
async function cancelUpdate(){if(!activation)return;clearTimeout(activation.timer);activation=null;const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});clients.forEach(client=>client.postMessage({type:'CANCEL_UPDATE'}));}
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE') event.waitUntil((async()=>{
    if(activation)return;
    const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});
    const token=crypto.randomUUID(); activation={token,ids:new Set(clients.map(client=>client.id)),timer:setTimeout(cancelUpdate,15000)};
    if(!clients.length){await self.skipWaiting();return;}
    clients.forEach(client=>client.postMessage({type:'PREPARE_UPDATE',token}));
  })());
  if(event.data?.type==='UPDATE_ACK') event.waitUntil((async()=>{
    if(!activation||event.data.token!==activation.token||!activation.ids.has(event.source?.id))return;
    if(!event.data.ok){await cancelUpdate();return;}
    activation.ids.delete(event.source.id);
    if(!activation.ids.size){clearTimeout(activation.timer);activation=null;await self.skipWaiting();}
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'){
      const route=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
      const cached=await cache.match(route)||await cache.match(url.pathname);
      if(cached)return cached;
      try{return await fetch(event.request);}catch{return await cache.match('/404.html')||Response.error();}
    }
    const cached=await cache.match(url.pathname);return cached||fetch(event.request);
  })());
});`;
fs.writeFileSync(path.join(root, 'sw.js'), worker);
const scriptHashes = new Set();
files
  .filter((file) => file.endsWith('.html'))
  .forEach((file) => {
    for (const match of fs
      .readFileSync(file, 'utf8')
      .matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
      if (!/\bsrc\s*=/.test(match[1]) && match[2])
        scriptHashes.add(
          `'sha256-${crypto.createHash('sha256').update(match[2]).digest('base64')}'`,
        );
  });
const csp = `default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' ${[...scriptHashes].join(' ')}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:8765 http://localhost:8765 http://127.0.0.1:18765; worker-src 'self' blob:; frame-ancestors 'none'`;
fs.writeFileSync(
  path.join(root, '_headers'),
  `/*\n  Content-Security-Policy: ${csp}\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/sw.js\n  Cache-Control: no-cache\n`,
);
fs.writeFileSync(
  path.join(root, 'security-headers.json'),
  JSON.stringify(
    {
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
    null,
    2,
  ),
);
console.log(`Offline cache ${version}: ${urls.length} assets; CSP hashes generated.`);
