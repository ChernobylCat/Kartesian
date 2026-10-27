# Kartesian Next.js: development, data, and release

## Commands

- `npm ci`: install the exact lockfile. Use Node 24 as in CI.
- `npm run dev`: prepare local fonts/guide/worker assets, then start Next development on port 3000.
- `npm run build`: build legacy rollback assets, Next production static output, rollback app, offline precache, and CSP hashes.
- `npm start`: serve `out/` on `http://127.0.0.1:4174` with generated security headers. Set `PORT` to use another port.
- `npm run check`: lint, typecheck, unit/component, build, legacy browser suite, Next production browser suite, and Python helpers.
- `npm run test:next:e2e`: production suite against Chromium, Firefox, WebKit. Locally Chromium uses installed Edge. Set `PW_BROWSER=chromium` for one engine, or `CI=true` to use installed Playwright Chromium instead.
- `npm run build:legacy`: regenerate the original checked-in assets. `node tests/support/static-server.js` still serves the original app on port 4173.
- `npm run format:next`: format the new TypeScript/React/CSS and tests with the pinned Prettier version.
- `npm run benchmark`: measure D1–D4, drag frame intervals, and ten PDF open/delete heap samples against the production artifact using headless Edge locally (Chromium in CI). Service workers are blocked to isolate editor profiling; offline has separate browser tests.
- `.venv/Scripts/python.exe scripts/check-print.py` on Windows, or an activated Python elsewhere: compare the generated Next/legacy PDF fixtures using PyMuPDF. Run Chromium Next E2E first to create those PDFs.

PWA caching is enabled only in the production export. Development is intentionally network-driven. Test production when checking workers, lazy loading, offline, CSP, or output portability.

## Runtime boundaries

Next App Router statically renders the shell. The client creates one editor store and one persistence queue per mounted editor. Document schema, commands, geometry, and history live in `src/domain/document/`; browser storage, detector, PDF.js, and HTML serialization are adapters.

The internal model uses arrays with stable IDs and structural sharing rather than the masterplan's proposed dictionaries. Existing ordering and the maximum 5,000 items make this the smaller migration. IDs remain independent of array position. Image data is held in an asset registry and persisted as binary ArrayBuffer records with MIME types; reads also accept Blob records. This avoids browser-specific Blob cloning behavior. History holds document metadata only. Export codecs preserve the legacy wire format and unknown document fields. The schema keeps legacy omitted values and numeric-string normalization semantics.

The mature framework-independent PDF field parser remains shared `.mjs` source, behind a typed adapter. The detector server and its protocol remain unchanged. Changing those algorithms alongside the UI would make comparison and recovery more difficult.

Bundler decision: development and production explicitly use Next's supported Webpack mode. Turbopack 16.4.3 repeatedly failed to start its PostCSS evaluation worker on this Windows environment, both with a clean build cache and outside the sandbox. The first compilation exposed type errors before subsequent reproducible worker failures. Webpack is the compatibility fallback; changing back to Turbopack requires the same production/offline/PDF checks. This does not change the Next.js framework version or deployment model.

## Data and recovery

The rewrite reads legacy settings (`overlay_print_pro_settings`) and PDF data (`OverlayPrintProDB/pdf_overlays/active_pdf`), then writes `KartesianWorkspaceDB`. Migration writes atomically, reads back, and checks document/assets/settings/PDF bytes/candidates. Legacy records are retained. Storage failure opens recovery instead of saving an empty document.

Use **Backup workspace lengkap** before moving origin, browser, device, or deploying. It includes the original PDF, rendered pages, candidates, assets, calibration, model IDs, and a SHA-256 checksum. Import validates both checksum and schema. The legacy settings export remains available for compatible documents; it does not carry the original PDF bytes.

Origins include protocol, hostname, and port: `localhost:3000`, `127.0.0.1:4173`, and `127.0.0.1:4174` have independent storage. To import the original browser's PDF without changing origin, serve the production `out/` on its original port/hostname. Do not run the original and Next static server on the same port simultaneously. Alternatively use `/legacy/` on the new origin and import legacy settings/PDF there before opening `/` for its initial migration. If v2 already exists, import the complete workspace into v2; do not rely on automatic reimport.

Autosave is debounced and serialized; status changes to saved only on transaction completion. Web Locks make additional tabs read-only. Handover saves before releasing ownership; IndexedDB compare-and-swap additionally rejects stale writers. Invalid JSON is a draft: the last valid model stays intact, print/export are disabled, and leaving the page prompts about unsaved input.

## Hosting and offline updates

Deploy the complete `out/` artifact. `_headers` is generated for hosts that support that format; otherwise map `security-headers.json` to equivalent server/CDN response headers. It includes hashes for build-time inline scripts, so regenerate it for every build. Do not reuse CSP hashes from a different release. No runtime Next server, Server Actions, or database backend is required.

The initial supported mount is the origin root `/`. Subpath hosting is not configured. Keep `/sw.js` at the root with `Cache-Control: no-cache`. Serve JS/MJS and WASM with their correct MIME types. Preserve older immutable Next chunks for seven days when replacing a deployment.

The production worker precaches output routes, lazy chunks, fonts, PDF resources, guides, and the legacy rollback copy. Offline cold start is available only after the first successful precache. A new worker waits; the update button asks every tab to save and acknowledge. Invalid drafts or unresponsive tabs veto activation. Cache cleanup only targets Kartesian cache names.

Canvas visibility uses one shared IntersectionObserver. Only visible pages and overscan mount editing controllers, subscriptions, and pointer/keyboard listeners; offscreen pages retain lightweight placeholders. The complete print surface is maintained separately.

The original worker is replaced at the same `/sw.js` URL. The `/legacy/` rollback copy disables its historical worker registration because that worker deletes unrelated caches on the origin; offline delivery remains the root worker's responsibility.

## PDF/OCR

Backgrounds use a centered proportional fit within the fixed 210 × 330 mm sheet in the editor, print, and standalone HTML. They are neither cropped nor stretched. The nine built-in PNGs are 1700 × 2600 px: their fitted size is 210 × 321.176 mm, with 4.412 mm of free space above and below. PNGs have no physical DPI metadata, so this does not establish the original PDF's physical dimensions.

See [background accuracy fix and verification](BACKGROUND-ACCURACY-FIX.md) for the 26 October 2026 correction, browser evidence, and alternate preview port instructions.

PDF detector candidates remain stored in the original full-sheet normalized coordinate system for compatibility with saved scans and the local detector. Candidate outlines, review coordinates, and applied placeholders use the same proportional transform as the background, based on the cached page image dimensions (including rotation). Applying a field does not transform stored candidates a second time. Existing document items keep their millimeter coordinates; layouts positioned against the old stretched background should be checked again. This intentionally corrects Next output only; the recovery copy under `/legacy/` retains its original behavior.

The PDF.js worker, CMaps, standard fonts, and WASM are copied from the installed PDF.js version. Digital PDF detection works locally without Python. Optional requests go from the user's browser directly to `http://127.0.0.1:8765`, never through a Next server proxy. Browser/local-network permissions and CORS must be checked for the deployment origin.

Keep the existing Python environment and `npm run detector:start`. PaddleOCR first-use model downloads and Python compatibility remain the same. Cancellation aborts rendering/fetch and ignores stale results; it does not promise to stop a CPU job already running in the Python server.

## Print and rollback

Print/export use all model pages, not virtualized screen nodes. Browser print waits for fonts/images. Standalone HTML embeds image/PDF/guide assets and the local Jakarta font when used. Print on F4, 100% scale, margin zero, headers/footers disabled, then calibrate printer offset.

The bundled `/legacy/` editor is available for recovery. It sees the original legacy snapshot, not edits saved only in v2. Export settings from Next to transfer supported document/calibration changes and reupload the original PDF when downgrading. Keep the full v2 backup as the authoritative recovery artifact. Never delete v2 during rollback.

Deployment, printer calibration, real PaddleOCR processing, and browser-specific local-network permission dialogs require their actual environment. Automated checks do not replace those acceptance steps. Record actual verification and remaining limits in `NEXTJS-REWRITE-STATUS.md`.
