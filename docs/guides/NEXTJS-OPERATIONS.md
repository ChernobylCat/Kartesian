# Kartesian Next.js: development, data, and release

## Commands

- `pnpm install --frozen-lockfile`: install the exact lockfile (pnpm version pinned in `package.json` → `packageManager`; run `corepack enable` once to get it). Use Node 24 as in CI.
- `pnpm run dev`: prepare local fonts/guide/worker assets, then start Next development on port 3000.
- `pnpm run build`: prepare local assets, build the Next production static export, offline precache, and CSP hashes.
- `pnpm start`: serve `out/` on `http://127.0.0.1:4174` with generated security headers, brotli/gzip and cache headers. Set `PORT` and `HOST` to change the address (the container uses `0.0.0.0:8080`; see [DEPLOY-CLOUD-RUN.md](DEPLOY-CLOUD-RUN.md)).
- Routes: `/` is the static Indonesian landing page, `/en/` the English one, and `/editor/` is the editor. The PWA manifest launches `/editor/`; installs made before the move still open `/`, which redirects to `/editor/` when it runs in standalone mode. Landing screenshots live in `assets/landing/` and are regenerated with `pnpm run capture:landing` after a build.
- Languages: the editor is available in Indonesian (default) and English, switched with the ID/EN control in the header and remembered per device (`kartesian_locale` in localStorage). Links from a landing page pass `?lang=`. All UI text and error messages live in `src/i18n/messages/id.ts` (reference) and `en.ts`; the TypeScript type makes a missing English key a build error, and `tests/unit/i18n.test.ts` checks that both use the same `{placeholders}`. Landing copy lives in `src/features/landing/content.ts`.
- `pnpm run check`: lint, typecheck, unit/component, build, the Next production browser suite, and Python helpers.
- `pnpm run test:e2e`: production suite against Chromium, Firefox, WebKit. Locally Chromium uses installed Edge. Set `PW_BROWSER=chromium` for one engine, or `CI=true` to use installed Playwright Chromium instead.
- `pnpm run format:src`: format the TypeScript/React/CSS sources, tests and scripts with the pinned Prettier version.
- `pnpm run benchmark`: measure D1–D4, drag frame intervals, and ten PDF open/delete heap samples against the production artifact using headless Edge locally (Chromium in CI). Service workers are blocked to isolate editor profiling; offline has separate browser tests.
- `scripts/check-print.py` (removed; still in git history up to commit `6cb21b9`) was a historical comparison tool; it requires both Next and archived legacy PDFs to be supplied. The current build does not generate a legacy application or its PDF.

PWA caching is enabled only in the production export. Development is intentionally network-driven. Test production when checking workers, lazy loading, offline, CSP, or output portability.

## Runtime boundaries

Next App Router statically renders the shell. The client creates one editor store and one persistence queue per mounted editor. Document schema, commands, geometry, and history live in `src/domain/document/`; browser storage, detector, PDF.js, and HTML serialization are adapters.

The internal model uses arrays with stable IDs and structural sharing rather than the masterplan's proposed dictionaries. Existing ordering and the maximum 5,000 items make this the smaller migration. IDs remain independent of array position. Image data is held in an asset registry and persisted as binary ArrayBuffer records with MIME types; reads also accept Blob records. This avoids browser-specific Blob cloning behavior. History holds document metadata only. Export codecs preserve the legacy wire format and unknown document fields. The schema keeps legacy omitted values and numeric-string normalization semantics.

The framework-independent PDF field parser is native TypeScript in `src/infrastructure/pdf/field-detector.ts`. The optional Python detector uses the same HTTP protocol. Application legacy source is archived separately, not shipped in `out/`.

Bundler decision: development and production explicitly use Next's supported Webpack mode. Turbopack 16.4.3 repeatedly failed to start its PostCSS evaluation worker on this Windows environment, both with a clean build cache and outside the sandbox. The first compilation exposed type errors before subsequent reproducible worker failures. Webpack is the compatibility fallback; changing back to Turbopack requires the same production/offline/PDF checks. This does not change the Next.js framework version or deployment model.

## Data and recovery

The rewrite reads legacy settings (`overlay_print_pro_settings`) and PDF data (`OverlayPrintProDB/pdf_overlays/active_pdf`), then writes `KartesianWorkspaceDB`. Migration writes atomically, reads back, and checks document/assets/settings/PDF bytes/candidates. Legacy records are retained. Storage failure opens recovery instead of saving an empty document.

Use **Backup workspace lengkap** before moving origin, browser, device, or deploying. It includes the original PDF, rendered pages, candidates, assets, calibration, model IDs, and a SHA-256 checksum. Import validates both checksum and schema. The legacy settings export remains available for compatible documents; it does not carry the original PDF bytes.

Origins include protocol, hostname, and port: `localhost:3000`, `127.0.0.1:4173`, and `127.0.0.1:4174` have independent storage. For automatic legacy migration, serve `out/` on the original port/hostname and open it in the original browser profile. If v2 already exists, import a complete workspace backup; automatic migration does not replace it. For legacy settings-only files, import settings and upload the original PDF separately. The current build has no `/legacy/` route.

Autosave is debounced and serialized; status changes to saved only on transaction completion. Web Locks make additional tabs read-only. Handover finishes focused edits and freezes mutations before saving, then releases ownership. Failed saves unfreeze the owner and veto handover. IndexedDB compare-and-swap additionally rejects stale writers. Invalid JSON is a draft: the last valid model stays intact, print/export are disabled, and leaving the page prompts about unsaved input.

## Hosting and offline updates

Deploy the complete `out/` artifact. `_headers` is generated for hosts that support that format; otherwise map `security-headers.json` to equivalent server/CDN response headers. It includes hashes for build-time inline scripts, so regenerate it for every build. Do not reuse CSP hashes from a different release. No runtime Next server, Server Actions, or database backend is required.

The initial supported mount is the origin root `/`. Subpath hosting is not configured. Keep `/sw.js` at the root with `Cache-Control: no-cache`. Serve JS/MJS and WASM with their correct MIME types. Preserve older immutable Next chunks for seven days when replacing a deployment.

The production worker precaches output routes, lazy chunks, fonts, PDF resources, and the built-in guide. Offline cold start is available only after the first successful precache. A new worker waits; the update button asks every tab to finish edits, freeze mutations, save and acknowledge. Invalid drafts, failed saves or unresponsive tabs veto activation; cancelled updates unfreeze editing. Cache cleanup only targets Kartesian cache names.

Canvas visibility uses one shared IntersectionObserver. Only visible pages and overscan mount editing controllers, subscriptions, and pointer/keyboard listeners; offscreen pages retain lightweight placeholders. The complete print surface is maintained separately.

The original worker is replaced at the same `/sw.js` URL. The production artifact contains only the current Next application.

## PDF/OCR

Backgrounds use a centered proportional fit within the workspace sheet (F4 210 × 330 mm by default, see `src/domain/document/paper.ts`) in the editor, print, and standalone HTML. Detector candidates are stored in a fixed 210 × 330 detector space (`DETECTOR_SPACE`) and mapped onto the sheet when shown or applied. The current built-in showcase is one 1700 × 2600 px PNG: its fitted size is 210 × 321.176 mm, with 4.412 mm of free space above and below. PNG pixel size alone does not establish a source PDF's physical dimensions.

See [background accuracy fix and verification](../history/BACKGROUND-ACCURACY-FIX.md) for the 26 October 2026 correction, browser evidence, and alternate preview port instructions.

PDF detector candidates remain stored in the original full-sheet normalized coordinate system for compatibility with saved scans and the local detector. Candidate outlines, review coordinates, and applied placeholders use the same proportional transform as the background, based on the cached page image dimensions (including rotation). Applying a field does not transform stored candidates a second time. Existing document items keep their millimeter coordinates; layouts positioned against the old stretched background should be checked again. PyMuPDF transforms unrotated extraction rectangles into visual page coordinates before normalizing; OCR coordinates already follow the rendered pixmap.

The PDF.js worker, CMaps, standard fonts, and WASM are copied from the installed PDF.js version. Digital PDF detection works locally without Python. Optional requests go from the user's browser directly to `http://127.0.0.1:8765`, never through a Next server proxy. Browser/local-network permissions and CORS must be checked for the deployment origin.

Keep the existing Python environment and `pnpm run detector:start`. PaddleOCR first-use model downloads and Python compatibility remain the same. Cancellation aborts rendering/fetch and ignores stale results; it does not promise to stop a CPU job already running in the Python server.

## Print and rollback

Print/export use all model pages, not virtualized screen nodes. Browser print waits for fonts/images. Standalone HTML embeds image/PDF/guide assets and the local Jakarta font when used. Print on F4, 100% scale, margin zero, headers/footers disabled, then calibrate printer offset.

Recovery offers retry, raw legacy settings download, and complete workspace backup restore. Raw settings do not contain PDF/image backup data. Restore a complete backup to recover those assets. If no backup is available, preserve the browser profile and original files while investigating storage permissions; do not clear site data. The pre-rewrite legacy source is not part of this repository, and there is no bundled legacy editor. Never delete v2 during rollback.

Deployment, printer calibration, real PaddleOCR processing, and browser-specific local-network permission dialogs require their actual environment. Automated checks do not replace those acceptance steps. Record actual verification and remaining limits in `NEXTJS-REWRITE-STATUS.md`.
