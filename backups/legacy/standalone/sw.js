const CACHE_NAME = 'kartesian-v13';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/icons/app-icon.svg',
  './assets/icons/maskable-icon.svg',
  './assets/vendor/ace.js',
  './assets/vendor/lucide.min.js',
  './assets/vendor/pdf.min.mjs',
  './assets/vendor/pdf.worker.min.mjs',
  './assets/vendor/driver.mjs',
  './assets/vendor/driver.css',
  './src/theme-bootstrap.js',
  './src/app.mjs',
  './src/config.mjs',
  './src/app/bootstrap.mjs',
  './src/canvas/commands.mjs',
  './src/canvas/interactions.mjs',
  './src/canvas/format-transaction.mjs',
  './src/canvas/keyboard-controller.mjs',
  './src/canvas/renderer.mjs',
  './src/core/document-schema.mjs',
  './src/core/settings-schema.mjs',
  './src/core/utils.mjs',
  './src/editor/adapter.mjs',
  './src/editor/controller.mjs',
  './src/export/html-export.mjs',
  './src/overlay/controller.mjs',
  './src/pdf/field-detector.mjs',
  './src/pdf/local-field-service.mjs',
  './src/settings/controller.mjs',
  './src/state/history.mjs',
  './src/storage/pdf-storage.mjs',
  './src/storage/settings-storage.mjs',
  './src/ui/app-shell.mjs',
  './src/ui/dialog.mjs',
  './src/ui/feedback.mjs',
  './src/ui/format-toolbar.mjs',
  './src/ui/property-panel.mjs',
  './src/ui/context-menu.mjs',
  './src/ui/field-review.mjs',
  './src/ui/onboarding.mjs',
  './src/pwa/register.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin)
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok)
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (cached) =>
              cached ||
              (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined),
          ),
      ),
  );
});
