# Masterplan Rewrite Kartesian ke Next.js

Tanggal: 25 Oktober 2026 (Asia/Jakarta). Dokumen perencanaan awal; hasil pelaksanaan dan batas verifikasi dicatat pada [status rewrite](NEXTJS-REWRITE-STATUS.md).

## 1. Sasaran dan keputusan utama

Rewrite Kartesian menjadi aplikasi Next.js App Router dengan TypeScript strict, React, dan domain editor yang independen dari framework. Rilis pertama wajib mencapai kesetaraan fitur aplikasi saat ini, menjaga data pengguna, presisi koordinat, pencetakan F4, ekspor HTML mandiri, dan penggunaan offline.

Baseline framework adalah **Next.js 16.4.3**, ditandai sebagai latest stable oleh [rilis resmi](https://github.com/vercel/next.js/releases/tag/v16.4.3) saat diperiksa pada tanggal dokumen. Sebelum bootstrap, verifikasi kembali stable terbaru dan peer dependencies; pin versi aktual beserta lockfile. Jangan memakai tag `latest` mengambang dalam manifest atau memilih canary untuk rilis ini.

Keputusan arsitektur:

1. Satu aplikasi Next.js di root repository; service Python tetap di `services/`. Tidak perlu monorepo tooling tambahan.
2. App Router untuk shell/routing; editor dan data dokumen berjalan di browser.
3. Target awal `output: 'export'`, menghasilkan `out/` untuk hosting statis. Next.js mendukung jalur ini, dengan batasan fitur server runtime. [Static export](https://nextjs.org/docs/app/guides/static-exports)
4. Penyimpanan lokal menjadi sumber data persisten; tidak ada upload cloud implisit.
5. React mengelola UI dan item canvas; preview drag/resize memiliki lapisan sementara yang terpisah dari properti yang dikelola React.
6. Command dokumen menjadi satu jalur perubahan model, history, dan autosave.
7. Python detector dan kontrak HTTP-nya dipertahankan pada rewrite frontend. Evaluasi FastAPI menjadi pekerjaan terpisah setelah parity.
8. Rewrite dilakukan berdampingan dalam source dan artefak build terpisah. Jangan menghapus implementasi lama sebelum seluruh gate rilis terpenuhi.

Asumsi kerja: UI berbahasa Indonesia, alur pengguna tetap dikenali, penggunaan utama desktop, dan scope pertama tidak mencakup akun, kolaborasi realtime, billing, atau backend dokumen terpusat. Penambahan kebutuhan tersebut memerlukan fase lanjutan, bukan perubahan tersembunyi pada scope parity.

## 2. Bukti kondisi awal

| Area          | Implementasi saat ini                                        | Implikasi rewrite                                                                      |
| ------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Bootstrap     | `src/app.mjs`, `src/app/bootstrap.mjs`                       | Pisahkan composition root, use case, state, dan lifecycle browser                      |
| UI            | `index.html`, controller di `src/ui/`                        | Pecah menjadi komponen React, pertahankan perilaku aksesibilitas                       |
| Canvas        | `src/canvas/`                                                | Gunakan kembali aturan geometri dan command yang sudah benar melalui port TypeScript   |
| Model         | JSON array dokumen, pages, items                             | Pertahankan kontrak eksternal; model internal boleh menggunakan ID dan asset reference |
| Validasi      | `src/core/document-schema.mjs`, `settings-schema.mjs`        | Port aturan, default, error, dan batas dengan fixture pembanding                       |
| State/history | State aplikasi dan snapshot string undo/redo                 | Model objek tervalidasi, selection berbasis ID, transaksi history                      |
| Rendering     | DOM absolut dalam mm; render penuh memakai `replaceChildren` | Render selektif dan halaman aktif; jalur cetak merender semua halaman                  |
| PDF           | PDF.js, overlay controller, service fallback Python          | Lazy-load, worker terpaket lokal, pembatalan dan batas memori                          |
| Storage       | Settings di localStorage, PDF di IndexedDB                   | Migrasi non-destruktif dan terverifikasi                                               |
| Export        | Serialisasi halaman DOM menjadi HTML mandiri                 | Export dari snapshot model dan aset, bebas dari DOM editor yang tervirtualisasi        |
| Offline       | `sw.js` dengan cache `kartesian-v13` dan daftar aset manual  | Manifest aset build, aktivasi versi terkoordinasi, migrasi worker lama                 |
| Quality       | Regression JS, Playwright, unit Python, CI tiga browser      | Pertahankan cakupan perilaku; ganti assertion struktur source secara bertahap          |

Pemeriksaan awal pada 25 Oktober 2026:

- `npm.cmd run test:unit`: PASS (`Kartesian regression checks: PASS`).
- `python -m unittest discover -s services/pdf-field-detector -p test_*.py`: 7 tes, OK, 2 skipped karena PyMuPDF tidak tersedia pada interpreter yang dipakai.
- E2E, build produksi, benchmark, OCR nyata, dan cetak fisik belum dijalankan untuk dokumen perencanaan ini. Statusnya wajib diukur pada fase P0.
- Belum ada dependensi Next.js/React/TypeScript di manifest saat pemeriksaan.

## 3. Stack target dan kebijakan dependensi

| Kebutuhan            | Pilihan                                                                | Aturan penggunaan                                                                              |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Framework            | Next.js stable terbaru, App Router                                     | Baseline terverifikasi 16.4.3; pin patch aktual saat bootstrap                                 |
| UI runtime           | React/React DOM stabil yang kompatibel dengan Next terpilih            | Verifikasi peer deps dan samakan versi React/React DOM                                         |
| Runtime developer/CI | Node.js 24, npm                                                        | Selaraskan lokal dan CI; pertahankan `package-lock.json`                                       |
| Bahasa               | TypeScript stable kompatibel, `strict`                                 | Tambahkan `noUncheckedIndexedAccess`; tidak menyebar `any` untuk menghindari port              |
| Styling              | Tailwind CSS 4, CSS khusus geometri/cetak                              | Pertahankan satuan mm/pt dan font; jangan ubah layout cetak dengan utility UI                  |
| State editor         | Zustand vanilla store + React selector                                 | Store per instance editor, bukan singleton pada server; pisahkan state persisten dan sementara |
| Validasi runtime     | Zod 4                                                                  | Infer tipe dari schema; pertahankan semantik validator lama dengan contract test               |
| PDF                  | PDF.js versi existing lebih dahulu                                     | Upgrade PDF.js terpisah setelah parity; library dan worker harus seversi                       |
| Editor JSON          | Ace existing melalui adapter client-only                               | Pertahankan textarea fallback; penggantian editor bukan syarat rewrite                         |
| Ikon/UI kecil        | `lucide-react`; komponen lokal                                         | Migrasikan kebutuhan yang ada; jangan menambah suite UI besar tanpa manfaat nyata              |
| Storage              | IndexedDB native di balik adapter; localStorage untuk preferensi kecil | Repository transaksi dokumen dan aset, error quota/recovery eksplisit                          |
| Unit/component test  | Vitest, React Testing Library                                          | Vite hanya sebagai infrastruktur tes; build aplikasi tetap Next.js                             |
| E2E                  | Playwright existing                                                    | Chromium, Firefox, WebKit; tambah pengujian offline dan upgrade antarversi                     |
| Offline              | Service worker khusus + manifest precache hasil build                  | Pertahankan Turbopack bila spike kompatibilitas lulus                                          |
| Python               | Service existing dan requirements existing                             | Tidak memindahkan PyMuPDF/PaddleOCR ke Route Handler Next.js                                   |

Alasan pilihan state: selection, history, model, dan panel memerlukan subscription terarah. Gunakan [Zustand](https://github.com/pmndrs/zustand) sebagai adapter UI; domain tetap tidak mengimpor Zustand. [Zod](https://zod.dev/) menyediakan validasi runtime dan inferensi tipe. [Vitest](https://vitest.dev/guide/) dipakai untuk tes modul TypeScript dan komponen.

Lakukan spike P1 sebelum mengunci paket integrasi. Jika mempertimbangkan Serwist, dokumentasi Next.js saat diperiksa menyebut integrasinya memerlukan konfigurasi webpack; jangan menganggapnya otomatis kompatibel dengan Turbopack. Alternatif default adalah worker khusus dengan generator manifest build. [Panduan PWA Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)

## 4. Batas arsitektur dan struktur folder

```text
src/
  app/
    layout.tsx                       # Metadata, font lokal, shell statis
    page.tsx                         # Host editor pada route utama
    manifest.ts                      # Metadata PWA build-time
    error.tsx
    not-found.tsx
  components/ui/                     # Button, dialog, toast, input bersama
  features/editor/
    EditorClient.tsx                 # Boundary client dan composition root
    components/                      # Toolbar, sidebar, canvas, JSON panel
    hooks/                           # Lifecycle, pointer, keyboard, selectors
    store/                           # Zustand, selection dan state sesi
  features/pdf/                      # Overlay, scan, review kandidat
  features/settings/                 # Kalibrasi, tema, import/export settings
  features/print/                    # PrintSurface dan orkestrasi print
  domain/document/
    model.ts                         # Dokumen, page, text/image item, stable ID
    schema.ts                        # Aturan model internal
    commands.ts                      # Mutasi immutable dan inverse transaction
    geometry.ts                      # mm/px/pt, bounds, snapping, alignment
    history.ts                       # Undo/redo berbatas memori
  application/
    editor-session.ts                # Command -> state -> save scheduling
    import-document.ts               # Validasi dan replace atomik
    prepare-output.ts                # Snapshot print/export konsisten
    ports.ts                         # Kontrak storage/detector yang dibutuhkan
  infrastructure/
    storage/                         # IndexedDB, preferensi, migrasi legacy
    pdf/                             # PDF.js dan localhost detector adapter
    serialization/                   # Codec JSON/settings legacy dan internal
    export/                          # Generator HTML mandiri dan aset portable
  styles/
    globals.css
    canvas.css
    print.css
  workers/                           # Pekerjaan berat sesuai hasil profiling
public/
  icons/
  fonts/
  pdf/                               # Guide bawaan yang saat ini tersedia
  vendor/                            # Worker/aset yang perlu URL stabil
scripts/                             # Precache generator, build/test utilities
services/pdf-field-detector/          # Python tetap independen
tests/
  fixtures/                          # Legacy, migrasi, PDF, data skala besar
  unit/
  component/
  contracts/
  e2e/
  performance/
docs/
```

Aturan dependensi: UI memanggil use case; use case memakai domain dan capability storage/detector; adapter implementasinya dirakit di `EditorClient`. Domain tidak mengimpor React, Next.js, DOM, storage browser, atau network. Interface hanya dibuat untuk batas yang benar-benar diganti/diuji, bukan untuk setiap fungsi.

App Router shell dapat dirender saat build. Akses `window`, IndexedDB, FileReader, Ace, dan PDF.js yang membutuhkan browser dilakukan setelah boundary client aktif. `'use client'` sendiri tidak meniadakan prerender. Bila perlu `dynamic(..., { ssr: false })`, deklarasikan pada Client Component, bukan Server Component. [Lazy loading Next.js](https://nextjs.org/docs/app/guides/lazy-loading)

Hydration awal memakai placeholder yang deterministik. Setelah storage dimuat, editor berpindah ke ready. Kegagalan baca tidak boleh memicu autosave dokumen kosong menimpa data lama. Provider store dibuat per sesi editor dan effect harus aman terhadap mount/unmount berulang pada development.

Route awal tetap `/`. Navigasi dokumen baru menggunakan state lokal atau query yang diproses client; jangan membuat dynamic route ID arbitrer yang memerlukan server pada static export. Tidak memakai Server Actions, API mutation route, atau runtime cookies untuk fungsi inti rilis pertama. Headers keamanan didefinisikan pada hosting statis, bukan mengandalkan `next.config` headers yang tidak diterapkan oleh output statis.

## 5. Model dokumen, JSON, command, dan history

Model internal yang diusulkan:

```text
WorkspaceEnvelope { schemaVersion: 2, document, assets, calibration, revision }
Document           { id, entryOrder, entriesById }
DocumentEntry      { id, name, pageOrder, pagesById }
Page               { id, pageNumber, itemOrder, itemsById }
Item               { id, type, xMm, yMm, rotation, zIndex, locked, ... }
ImageItem          { ..., assetId }
Asset              { id, mimeType, byteLength, blob }
```

Ini schema internal baru; tidak mengubah format JSON pengguna secara diam-diam. Codec legacy tetap menerima array `{title|name|debitur, pages:[{page_number, items}]}` dan representasi gambar `text: data:image/...`. Ekspor legacy default tetap kompatibel. Format workspace v2 disediakan sebagai backup baru untuk data yang memerlukan metadata/aset tambahan.

- ID dibuat saat import/create, dipertahankan saat edit, dan dibuat ulang pada duplicate. Selection menggunakan ID, bukan indeks array atau node DOM.
- JSON panel menampilkan format kompatibel. Draft teks adalah state terpisah: `rawText`, hasil parse, dan error. Draft invalid tidak merusak model terakhir yang valid; print/export dinonaktifkan sampai draft kembali valid, sesuai perilaku existing.
- Perubahan dari canvas memperbarui model lalu serialisasi panel secara terjadwal; perubahan JSON valid menjadi satu transaksi replace document. Gunakan source/revision token untuk menghindari loop sinkronisasi.
- Rekonsiliasi ID setelah edit JSON mempertahankan ID hanya untuk item yang cocok tanpa ambiguitas; kasus reorder/duplikasi ambigu membersihkan selection dengan aman. Jangan bergantung pada tebakan indeks untuk selection lama.
- Command mencakup add, duplicate, delete, patch properties, move, resize, reorder, align/distribute, apply PDF fields, dan replace document.
- Satu drag/resize, satu batch formatting, atau satu apply kandidat = satu transaksi undo. Batal mengembalikan preview tanpa menulis history.
- History awal dibatasi 50 transaksi seperti existing, ditambah budget awal 32 MiB untuk metadata/patch yang akan divalidasi pada P0/P3. Blob aset tidak disalin ke history; referensi aset tetap hidup selama masih dirujuk dokumen/history.
- Large replace/import boleh memakai snapshot terstruktur terbatas. Jangan memaksakan inverse patch jika lebih rumit atau lebih boros dari snapshot untuk operasi tersebut.
- Autosave menggunakan revisi, debounce awal 500 ms, dan antrean single writer agar save lama tidak menimpa revisi baru. Status saved hanya setelah transaksi commit.
- Print/export melakukan flush transaksi pending dan mengambil satu snapshot immutable; hasil output tidak berubah jika sesi editor terus berubah.
- Tetapkan kebijakan multi-tab: deteksi sesi editor lain melalui BroadcastChannel; tab kedua readonly sampai mengambil alih setelah save tab aktif selesai. Tab aktif yang tersuspensi harus memeriksa ownership/revision sebelum menulis.

## 6. Strategi canvas dan output presisi

Kanvas tetap DOM absolut dengan ukuran fisik **210 x 330 mm**, font dalam pt, posisi/ukuran dalam mm. Hindari mengganti engine ke bitmap/canvas library pada fase parity karena dapat mengubah teks cetak, metrik font, dan ekspor.

Pointer dipetakan dari bounding rectangle aktual halaman ke satuan mm, mempertimbangkan scroll dan zoom. Aturan rotasi, delapan handle, Shift aspect ratio, Alt resize dari tengah, lock, snapping, dan bounds dipertahankan melalui contract test.

Selama gesture, simpan data pointer pada ref dan jadwalkan preview via requestAnimationFrame. Preview menggunakan lapisan/CSS variable khusus yang tidak sekaligus ditulis React. Saat gesture selesai, commit satu command, lalu lepas preview setelah model terbaru terpasang. Pointer cancel, Escape, kehilangan capture, dan unmount wajib membersihkan preview/listener.

React berlangganan hanya ke item/page yang diperlukan. Mount halaman sekitar viewport dengan placeholder berukuran tetap; batasi canvas PDF aktif dan dispose resource/object URL. Keputusan virtualisasi per item menunggu profiling; jangan menambah kompleksitas sebelum dibutuhkan.

Print dan export memiliki jalur lengkap:

1. Flush draft/formatting valid, ambil snapshot revisi.
2. Render seluruh halaman yang dipilih pada `PrintSurface` tanpa virtualisasi, termasuk PDF-only pages yang didukung existing.
3. Tunggu font, decode gambar, dan overlay siap; tampilkan error jika ada aset gagal.
4. Gunakan stylesheet cetak tersendiri, `@page` F4, margin nol, offset kalibrasi, dan kontrol overlay/marker terpisah.
5. Jalankan `window.print()` dari alur yang diuji; tangani Ctrl/Cmd+P melalui persiapan output. Karena beforeprint tidak menjamin await, sediakan surface siap cetak atau snapshot siap sebelumnya serta uji menu Print browser secara manual.
6. Lepas resource setelah output selesai tanpa menghapus draft pengguna. Jangan menganggap event afterprint berarti kertas benar-benar tercetak.

HTML mandiri dihasilkan dari snapshot dan portable assets dengan escaping/allowlist, tanpa dependency Next.js, tanpa node kontrol editor, dan tanpa harus mengunjungi halaman yang belum ter-mount. CSS cetak/font/overlay yang diperlukan harus ikut terkemas; tidak meminta CDN. Browser print dan standalone HTML export adalah dua fitur berbeda dan keduanya wajib parity.

## 7. PDF, detector lokal, dan resource lifecycle

- Lazy-load PDF.js, Ace, onboarding, dan dialog berat. Paketkan worker PDF.js dari versi yang sama sebagai aset lokal dengan URL yang valid pada root maupun hosting subpath yang didukung.
- Pertahankan mode auto, PDF.js saja, PyMuPDF, dan PaddleOCR. Auto mengirim hanya halaman unresolved ke service lokal; OCR fallback mengikuti kontrak existing.
- Pertahankan `GET /health` dan `POST /v1/detect` dengan body raw `application/pdf`, query pages/ocr/mode, serta normalisasi/deduplikasi kandidat.
- Timeout awal tetap 2 detik untuk health dan 120 detik untuk scan. Pembatalan client menghentikan fetch/UI dan mengabaikan hasil usang; tidak menjanjikan job Python otomatis berhenti jika server belum mendukung cancellation.
- Kandidat low confidence tetap unchecked; apply ke halaman yang sesuai untuk semua dokumen sebagai satu undo; kegagalan scan tidak menghapus kandidat lama.
- Upload PDF baru membatalkan task lama dan menaikkan generation token. Hasil scan/render/save dari generasi lama tidak boleh masuk ke dokumen baru.
- Simpan byte PDF asli, fileName, kandidat, dan metadata; thumbnail/render cache boleh dibangun ulang. Batasi concurrency render awal dua halaman dan sesuaikan berdasar profiling/memori.
- Service tetap bind localhost. Fetch localhost berasal dari browser pengguna; proxy server Next.js akan merujuk localhost mesin server sehingga bukan pengganti yang benar.
- Uji origin localhost dan deployment HTTPS dengan service lokal di setiap browser target: CORS, CSP, izin akses jaringan lokal, dan kebijakan secure context dapat berbeda. Jika service tidak dapat diakses, PDF.js tetap berfungsi dan UI menjelaskan statusnya.
- Font dan worker tidak boleh diunduh diam-diam dari CDN saat offline. Download model OCR pertama kali tetap dijelaskan sebagai kebutuhan service Python.

## 8. Migrasi storage dan kompatibilitas data

Kontrak legacy yang telah ditemukan:

| Data                   | Lokasi existing                                                                  |
| ---------------------- | -------------------------------------------------------------------------------- |
| Settings/document JSON | localStorage `overlay_print_pro_settings`, schema settings versi 1               |
| Tema                   | localStorage `theme_preference`                                                  |
| PDF                    | IndexedDB `OverlayPrintProDB` versi 1, store `pdf_overlays`, record `active_pdf` |
| Payload PDF            | pages, candidates, pdfData atau fallback pdfBlob, fileName, timestamp            |
| Onboarding             | Key milik modul onboarding; inventarisasi literal pada P0                        |

Gunakan database v2 terpisah (usulan `KartesianWorkspaceDB`) agar aplikasi lama tidak menerima record dengan schema baru. `schemaVersion: 2` pada envelope tidak berarti otomatis menaikkan versi database legacy.

Alur migrasi:

1. Baca legacy tanpa menulis/menghapus; kumpulkan settings, PDF, dan preferensi.
2. Validasi, normalisasi satuan, buat ID, pindahkan gambar ke asset record, dan pertahankan semua field yang didukung. Input invalid membuka recovery, bukan reset otomatis.
3. Tulis dokumen/aset/metadata migrasi dalam transaksi v2. Perubahan localStorage dan IndexedDB tidak dianggap satu transaksi atomik; penanda final berada bersama data v2.
4. Baca kembali dan bandingkan jumlah dokumen/page/item, isi teks, geometri, kalibrasi, hash aset, PDF bytes, dan kandidat. Baru tandai migrasi selesai dan aktifkan autosave.
5. Migrasi idempotent: retry tidak menduplikasi data, interrupted migration tidak dianggap selesai, dan versi masa depan yang tidak dikenal ditolak secara aman.
6. Storage quota, akses ditolak, private mode, DB blocked oleh tab lain, serta crash saat migrasi memiliki jalur recovery dan backup unduhan.
7. Legacy tetap utuh selama masa transisi. Tidak ada dual-write otomatis karena berisiko konflik dan kehilangan data.

Data browser terikat origin termasuk port: `localhost`, `127.0.0.1`, port 3000, dan port 4173 tidak saling berbagi storage. Uji migration pada origin yang sama. Untuk berpindah origin, sediakan backup workspace portabel pada legacy atau bridge migrasi yang memuat settings **dan byte PDF/aset**; ekspor settings lama saja belum cukup membuktikan semua PDF ikut berpindah.

Backup v2 harus mempunyai version manifest dan validasi ukuran/checksum. Dukungan import legacy dijaga; kompatibilitas adalah kesetaraan makna, bukan kesamaan whitespace JSON. Unknown fields harus diberi kebijakan eksplisit pada codec dan fixture, bukan diam-diam dibuang jika memuat data pengguna.

## 9. Offline, hosting, dan upgrade service worker

Output awal adalah artefak statis untuk deployment pada origin yang sama dengan aplikasi lama bila memungkinkan. Build ID mengikat HTML, route payload, JS/CSS chunks, worker PDF, font, guide, dan manifest precache. Generator menginventarisasi artefak hasil build, bukan hardcode nama chunk.

Implementasi worker harus lolos spike berikut sebelum UI rewrite diperluas:

- App yang sudah pernah dimuat dapat cold-start offline, termasuk lazy chunks Ace/PDF, guide dan font. First visit tanpa cache tidak dijanjikan bekerja offline.
- Aset dengan hash menggunakan cache-first; navigation memakai strategi versi yang menjaga HTML dan chunk konsisten. Jangan melakukan fallback HTML untuk permintaan JS/worker yang hilang.
- App Router route payload/client navigation diuji dari output produksi; jangan meng-cache respons berbeda secara membabi buta pada key URL sama.
- Endpoint localhost detector dan dokumen/aset pengguna tidak dimasukkan ke cache jaringan umum. Data pengguna berada pada repository lokal.
- Worker baru staged terlebih dahulu. Aktivasi/reload dilakukan setelah draft/transaksi tersimpan atau pengguna menyelesaikan alur simpan; jangan memakai skipWaiting yang merebut sesi editor aktif tanpa koordinasi.
- Hapus hanya cache milik Kartesian sesuai prefix/version setelah aman, bukan seluruh cache origin. Uji cache v13 lama yang saat ini dapat mengintersep HTML/aset Next.js.
- Pertahankan URL registration/scope lama pada cutover atau kirim worker transisi di URL lama; jangan mengandalkan worker baru yang belum pernah didownload pengguna.
- Hosting menyimpan chunk versi sebelumnya selama masa transisi yang ditetapkan, usulan tujuh hari, dan menyediakan rollback artefak versi lengkap.

Static export memerlukan konfigurasi headers dari web server/CDN. CSP harus diuji terhadap inline bootstrap Next.js, style geometri, worker/blob, image data, dan localhost detector. Untuk static hosting, evaluasi build-generated script hashes atau kebijakan inline minimum yang terdokumentasi; jangan menganggap nonce per request tersedia tanpa server. Tidak melonggarkan eval pada produksi hanya untuk mengakomodasi library lama.

Default origin root; dukungan `basePath`/subpath harus dinyatakan dan diuji sebelum mengklaim parity hosting. Self-hosted Node atau platform server Next.js menjadi opsi fase cloud, dengan ADR perubahan output/deployment dan pengujian ulang offline.

## 10. Matriks kesetaraan fitur

| ID  | Kelompok              | Kriteria penerimaan                                                           | Fase  |
| --- | --------------------- | ----------------------------------------------------------------------------- | ----- |
| F01 | JSON dan schema       | Import valid, error invalid, recovery, limit dan default kompatibel           | P2–P3 |
| F02 | Model halaman/dokumen | Urutan, penamaan, multi-dokumen, PDF-only pages tetap benar                   | P2–P5 |
| F03 | Teks/gambar           | Add, edit inline, duplicate/delete, safe source dan upload limit              | P3–P4 |
| F04 | Pointer               | Drag, delapan resize handle, Shift, Alt, rotation, bounds, lock               | P4    |
| F05 | Selection             | Single, modifier keys, marquee dua arah, Escape, multi-selection              | P4    |
| F06 | Tata letak            | Snap guides, align/distribute, z-index, ukuran dan koordinat numerik          | P4    |
| F07 | Formatting            | Bold/italic/underline, font, color/highlight, toolbar/panel sinkron           | P4    |
| F08 | History               | Undo/redo semua command dan batch, preview cancel, clear redo sesuai existing | P3–P4 |
| F09 | PDF overlay           | Guide bawaan/upload, opacity, persist/reload, screen/print toggle             | P5    |
| F10 | Deteksi field         | Empat mode, review/rename/dismiss, confidence, apply sekali undo              | P5    |
| F11 | Settings              | Autosave, kalibrasi, import/export legacy dan backup workspace baru           | P3–P6 |
| F12 | Output                | Print F4 semua halaman dan HTML mandiri, overlay/marker terpisah              | P6    |
| F13 | UI/accessibility      | Tema, fullscreen, onboarding, dialog focus, shortcut dan context menu         | P4–P7 |
| F14 | PWA                   | Install, offline cold start setelah precache, update aman, upgrade v13        | P1–P7 |
| F15 | Compatibility         | Migrasi localStorage/IndexedDB, origin berbeda, quota/recovery, rollback      | P3–P8 |

Batas awal dipertahankan: 100 dokumen, 100 halaman per dokumen, 1.000 item per halaman, 5.000 total item; gambar 2 MiB, settings import 5 MiB, PDF 25 MiB/50 halaman, render PDF maksimal 20 juta piksel. Batas ini harus diuji secara independen dan kombinasi yang sah; batas maksimum struktur bukan janji bahwa seluruh kombinasi ekstrem ringan pada semua perangkat. Format backup baru memiliki limit tersendiri yang ditetapkan setelah pengukuran aset, bukan memakai limit settings JSON secara sembarang.

## 11. Fase implementasi dan gate

Status awal seluruh fase: belum dimulai, kecuali pembacaan source dan tes awal yang dicatat pada bagian 2. Setiap fase menghasilkan PR yang bisa ditinjau dan artefak uji; PR dibagi lebih kecil bila perlu.

| Fase                | Hasil konkret                                                                      | Dependensi | Gate keluar                                                                      | Estimasi hari kerja |
| ------------------- | ---------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- | ------------------: |
| P0 Baseline         | Inventaris F01–F15, fixtures, screenshot, legacy build, benchmark, contoh cetak    | Tidak ada  | Semua gap baseline tercatat; sample golden disepakati                            |                 2–3 |
| P1 Foundation/spike | Next App Router, TS, CSS terisolasi, PDF/Ace spike, static build dan SW prototype  | P0         | Production export berjalan; offline lazy chunks; print dan hydration spike lolos |                 3–4 |
| P2 Domain           | Schema/codec TS, stable ID, geometri, command, contract tests legacy               | P0, P1     | Fixtures lama setara; batas/invalid aman; domain bebas browser/framework         |                 3–5 |
| P3 State/storage    | Editor session, JSON draft, history, autosave, migration, backup/recovery          | P2         | Reload/retry/crash/quota/multi-tab dan import lama lolos                         |                 4–6 |
| P4 Editor UI/canvas | Panel, toolbar, pointer, selection, keyboard, dialog, tema/onboarding              | P3         | F03–F08 dan UI terkait lolos E2E tiga browser                                    |                 6–9 |
| P5 PDF/detector     | Overlay, persist PDF, scan/review, fallback/cancel, engine integration             | P3, P4     | Fixture digital/scanned, service mati, timeout, hasil usang teruji               |                 3–5 |
| P6 Print/export     | PrintSurface, font/assets readiness, F4, portable HTML, kalibrasi                  | P4, P5     | Golden PDF/dimensi dan verifikasi cetak fisik lolos                              |                 3–5 |
| P7 Hardening        | Profiling, virtualisasi sesuai kebutuhan, security, accessibility, offline upgrade | P4–P6      | Seluruh quality gate dan budget performa yang disepakati lulus                   |                 4–6 |
| P8 Cutover          | Preview release, migrasi origin/cache, backup, dokumentasi, rollback drill         | P7         | Checklist release lengkap, rollback dan data recovery teruji                     |                 2–3 |

Total estimasi **30–46 hari kerja**, ditambah contingency sekitar 20% menjadi **36–56 hari kerja** untuk satu engineer berpengalaman dengan waktu QA/cetak yang tersedia. Ini perkiraan perencanaan, bukan komitmen durasi; kalibrasi ulang setelah P0/P1. Risiko offline upgrade, PDF worker, dan cetak sengaja diuji lebih awal meskipun implementasi lengkapnya ada pada fase berikutnya.

Urutan PR yang disarankan:

- R01 baseline fixtures dan daftar kontrak.
- R02 Next foundation dengan script/build terpisah dan spike kompatibilitas.
- R03 domain/schema/codec/geometri.
- R04 command/history dan editor session.
- R05 persistence/migration/backup dan JSON panel.
- R06 shell/panel/dialog/settings.
- R07 canvas/pointer/selection/keyboard/formatting.
- R08 PDF overlay/detector/review.
- R09 print/export lengkap.
- R10 performa/offline/security/accessibility.
- R11 cutover/rollback/docs; hapus legacy pada PR lanjutan setelah masa stabil.

Pengembangan memakai branch `codex/nextjs-rewrite` saat implementasi benar-benar dimulai. Repo lama tetap runnable selama transisi. Source Next dapat memakai `src/app/` berdampingan dengan `src/app.mjs` dan modul `.mjs`; isolasikan Tailwind source scan/CSS agar build legacy tidak berubah tanpa sengaja. Jalankan dua build dari workdir/artefak terpisah untuk menghindari benturan aset. Script legacy tidak diubah maknanya sampai cutover.

## 12. Strategi pengujian dan target performa

Quality gate target: lint + TypeScript + unit/contract + component + production build + static serve E2E + Python helper/integration yang tersedia. Lint dijalankan sebagai langkah eksplisit; jangan mengandalkan build untuk menjalankannya. `npm run check` menjadi entry point setelah cutover; sebelum itu tambahkan script `*:next` dan tetap jalankan gate legacy.

Migrasikan source-text assertions menjadi tes perilaku secara bertahap. Tidak perlu mempertahankan nama fungsi/struktur file lama jika kontrak eksternal dan perilakunya terjaga. Tidak menambahkan tes yang hanya memeriksa bahwa implementasi baru memanggil dirinya sendiri.

| Lapisan        | Bukti wajib                                                                          |
| -------------- | ------------------------------------------------------------------------------------ |
| Unit/domain    | Konversi mm/px/pt, rotasi/bounds, align/distribute, command/inverse, schema/limits   |
| Contract       | Legacy JSON/settings round trip, normalized values, detector HTTP dan kandidat       |
| Component      | Invalid JSON, focus dialog, toolbar/state sync, save error/status                    |
| E2E produksi   | Alur edit/import/undo/reload/print/export di Chromium, Firefox, WebKit               |
| Storage        | Legacy->v2, retry, abort, blocked DB, quota, orphan asset, multi-tab                 |
| PDF            | Digital/scan, empat mode, worker gagal, timeout, cancel, 25 MiB/50 page limits       |
| Output         | Semua halaman tercetak meski virtualisasi aktif, gambar/font siap, export offline    |
| Offline/update | Cold-start, seluruh fitur lazy, worker v13->baru, pending draft, rollback            |
| Security       | Escaping, data URL allowlist, invalid import, CSP produksi, no document network leak |
| Manual         | Printer nyata, browser print menu, instalasi PWA/izin localhost dan input perangkat  |

Dataset benchmark awal:

- D1: 1 dokumen, 1 halaman, 100 item teks.
- D2: 5 dokumen x 10 halaman x 100 item = 5.000 item, tanpa PDF.
- D3: PDF 50 halaman dengan item overlay, plus corpus gambar mendekati limit upload.
- D4: stress struktur halaman banyak dengan sedikit item untuk memastikan virtualisasi tidak membuat semua DOM/PDF canvas sekaligus.

Target awal berikut adalah **budget yang diusulkan, belum hasil ukur**. P0 menetapkan mesin referensi, versi browser, cold/warm run, dan minimal lima pengulangan; perubahan budget harus dijelaskan.

- D1: editor siap interaksi <= 2 detik warm load pada mesin referensi; waktu PDF/OCR tidak disembunyikan dalam angka ini.
- Gesture D1/D2: p95 frame interval <= 20 ms pada display 60 Hz ketika drag halaman aktif; p95 respons pointer-to-preview <= 50 ms, ukur terpisah.
- Command property sederhana D2: p95 commit ke tampilan <= 100 ms, tanpa full-document JSON stringify pada setiap pointer move.
- D2: aktifkan hanya halaman viewport + overscan, awalnya maksimal enam halaman penuh; jika satu halaman sangat padat tetap profilkan item-nya.
- Sepuluh siklus open/close PDF dan undo/redo: tidak ada pertumbuhan monoton task/listener/object URL; ukur heap setelah GC pada tooling yang mendukung dan laporkan variasi, bukan menjanjikan semua browser punya metrik sama.
- Print geometry: automated tolerance awal <= 0,1 mm untuk posisi/ukuran pada PDF Chromium golden dengan font tetap. Cetak fisik dievaluasi terpisah, usulan <= 0,5 mm setelah kalibrasi dan scale 100%, lalu dikonfirmasi terhadap printer target pada P0.
- Tidak ada regresi > 10% pada metrik baseline yang sama tanpa keputusan terdokumentasi. Bundle budget ditetapkan dari spike P1; initial bundle tidak memuat Ace/PDF.js sebelum diperlukan.

PDF output otomatis Chromium tidak membuktikan kesamaan print pipeline Firefox/WebKit atau printer nyata. Pisahkan bukti DOM/visual lintas browser, PDF golden, dan lembar cetak fisik.

## 13. Risiko, mitigasi, dan release/rollback

| Risiko                                            | Mitigasi dan bukti                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Next/React hydration mengakses API browser        | Boundary client, dynamic client-only, deterministic loading; build produksi tanpa error    |
| Rerender React mengganggu pointer/inline edit     | Temporary preview layer, stable ID/keys, satu commit gesture; profiling dan cancel test    |
| Perubahan font/CSS menggeser cetak                | Font lokal dan print CSS tersendiri; golden posisi dan cetak fisik                         |
| Virtualisasi menghilangkan halaman output         | Print/export dari snapshot lengkap, bukan DOM viewport                                     |
| Schema baru kehilangan data/aset                  | Backup, codec kontrak, read-back verification, legacy tidak dihapus                        |
| Service worker lama menyajikan versi campuran     | Worker transisi di URL lama, versioned manifest, staged activation, upgrade E2E            |
| Local detector tidak terjangkau dari hosting baru | Uji browser/HTTPS/permissions, konfigurasi origin, fallback PDF.js                         |
| OCR memakan resource besar                        | Tetap pada Python, limit concurrency; antrean worker hanya jika menjadi service pusat      |
| Package integration tidak cocok Turbopack         | Spike awal, pin kompatibel; webpack hanya lewat ADR bila diperlukan                        |
| Rollback UI membuka data lama                     | Simpan workspace v2 terbaru dan codec downgrade eksplisit; jangan menimpa legacy diam-diam |

Release dilakukan setelah F01–F15 selesai, semua gate wajib lulus, migrasi bisa dipulihkan, dan minimal satu alur cetak fisik tervalidasi. Preview/staging memakai artefak terpisah dan salinan fixture; jika origin berubah, uji backup/restore penuh termasuk PDF terlebih dahulu.

Usulan masa observasi: tujuh hari sejak cutover sebelum mempertimbangkan pembersihan legacy. Simpan artefak legacy, versi Next sebelumnya, serta cache/chunk yang dibutuhkan sesuai retensi. Pantau error melalui log lokal yang bisa diekspor; telemetry eksternal tidak mengirim isi dokumen tanpa scope terpisah.

Pemicu rollback: kehilangan data, drift cetak di atas toleransi yang diterima, offline tidak dapat membuka workspace, atau blocker editor yang belum ada workaround aman.

Prosedur rollback:

1. Hentikan aktivasi versi baru dan sediakan backup workspace terbaru jika editor masih dapat dibuka.
2. Deploy ulang artefak legacy/versi baik dengan worker rollback yang disengaja; uji tab aktif dan browser offline.
3. Pertahankan database v2. Legacy otomatis hanya melihat snapshot sebelum migrasi; jangan mengklaim edit baru ikut pulih otomatis.
4. Gunakan codec downgrade/backup portabel untuk membawa edit pascamigrasi ke format legacy jika kompatibel, termasuk restore PDF melalui bridge. Bila ada data yang tidak dapat direpresentasikan, tampilkan daftar dan pertahankan backup v2.
5. Buktikan dokumen, aset, kalibrasi, dan output sesudah restore; hentikan auto-migration sampai perbaikan tersedia.

Pembersihan legacy/source/cache/data hanya setelah stabilitas terverifikasi dan kebutuhan rollback selesai; penghapusan data pengguna tidak menjadi bagian otomatis rewrite.

## 14. Perluasan setelah parity

Tambahkan hanya jika kebutuhan produk sudah jelas:

- Document library/multi-workspace dan template manager di atas repository lokal yang sama.
- Akun, sinkronisasi cloud, PostgreSQL dan object storage melalui adapter baru; revisi konflik/offline queue membutuhkan desain tersendiri.
- Mode server Next.js untuk autentikasi/BFF; ubah output/deployment secara sadar dan pertahankan editor lokal.
- FastAPI untuk menata API detector; job queue/worker OCR untuk service terpusat berdasarkan beban nyata. Tidak menjalankan OCR berat dalam request serverless Next.js.
- Kolaborasi realtime/CRDT membutuhkan kontrak history dan konflik baru; stable ID saat ini membantu tetapi tidak otomatis membuat model kolaboratif.

## 15. Pekerjaan pertama saat eksekusi dimulai

- [ ] Rekam commit baseline dan hasil gate legacy penuh; simpan screenshot/fixture/golden output.
- [ ] Inventaris semua storage key, aset guide/font, shortcut, serta kasus cetak pada F01–F15.
- [ ] Ukur D1–D4 dan tetapkan printer/perangkat/browser referensi.
- [ ] Verifikasi latest stable Next.js, React peers, versi TS/test tools dan dukungan Node 24; catat versi yang dipin.
- [ ] Scaffold Next secara non-destruktif dan isolasikan script/CSS/output legacy.
- [ ] Buktikan static export + PDF worker + Ace + client hydration + print + offline lazy chunk pada build produksi.
- [ ] Putuskan hasil spike P1 sebelum mulai migrasi state dan UI dalam jumlah besar.

Saat masterplan ini disusun, belum ada bootstrap framework, instalasi dependensi, migrasi data pengguna, atau deployment. Pelaksanaan berikutnya dilaporkan terpisah pada [status rewrite](NEXTJS-REWRITE-STATUS.md), dengan keputusan dan verifikasi aktual.
