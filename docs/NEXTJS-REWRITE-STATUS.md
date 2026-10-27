# Status pelaksanaan rewrite Next.js

Tanggal: 25 Oktober 2026 (Asia/Jakarta).

Pembaruan 26 Oktober 2026: [perbaikan proporsi background dan pemetaan field PDF](BACKGROUND-ACCURACY-FIX.md), tervalidasi dengan 27 tes unit/komponen dan 33 tes browser terpilih. Preview sesi pembaruan memakai port 4175.

Pembaruan berikutnya: [perbaikan posisi dan responsivitas dialog bersama](DIALOG-STYLE-FIX.md), meliputi panduan awal, Bantuan & shortcut, dan review PDF.

Revamp berikutnya: [penggaris interaktif dan garis bantu](RULER-REVAMP.md), meliputi koordinat kursor, ukuran pilihan, snapping, keyboard, serta kontras tema gelap. Validasi mencakup 38 tes unit/komponen, 33 tes browser terpilih, dan 3 pemeriksaan ulang interaksi setelah penyesuaian kontras.

## Hasil implementasi

Kartesian kini memiliki aplikasi Next.js **16.4.3**, React/React DOM **19.3.1**, TypeScript strict, Zustand, Zod, dan Tailwind. `npm run build` menghasilkan static export produksi di `out/`; `npm start` menyajikannya di port 4174. Editor asli tetap tersedia dari server lama dan paket `/legacy/` dalam artefak produksi.

Implementasi mencakup model ber-ID stabil, codec legacy, asset registry, command dan history transaksi, JSON draft tervalidasi, UI React, canvas dengan virtualisasi halaman, pointer/resize/marquee, keyboard/formatting, PDF overlay, empat mode deteksi field, review kandidat, kalibrasi, print/export dari model lengkap, backup checksum, migrasi database, autosave serial, penguncian tab, PWA dan upgrade worker terkoordinasi.

PDF.js, Ace, guide bawaan, dan font disajikan lokal. Python detector tetap independen dengan kontrak HTTP existing. Tidak ada backend dokumen/cloud yang ditambahkan.

## Keputusan implementasi terhadap masterplan

| Area             | Keputusan dan alasan                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bundler          | Webpack yang didukung Next.js; Turbopack mengalami kegagalan proses evaluator PostCSS di Windows pada build berulang, termasuk clean cache dan luar sandbox              |
| Model internal   | Array ber-ID stabil dengan structural sharing; dictionary besar belum diperlukan untuk batas 5.000 item dan kontrak berurutan existing                                   |
| Aset gambar      | Registry terpisah dari history; persistensi biner ArrayBuffer + MIME, dengan dukungan baca record Blob untuk kompatibilitas browser                                      |
| PDF field parser | Algoritma `.mjs` yang independen framework tetap dipakai di balik adapter bertipe, mengurangi perubahan semantik detector saat UI berpindah                              |
| Output           | Surface cetak lengkap terpisah dari canvas virtual; HTML mandiri berasal dari snapshot model dan aset portable                                                           |
| Offline WebKit   | Pengujian mematikan server asal, bukan flag emulasi offline Playwright yang memiliki [bug dispatch service worker](https://github.com/microsoft/playwright/issues/42775) |
| Cutover          | Script build/start utama memakai Next; deployment eksternal dan penghapusan legacy belum dilakukan                                                                       |

## Bukti verifikasi

Hasil yang sudah terkonfirmasi:

- Build produksi Next.js/static export, paket legacy, precache 322 aset, dan header CSP berbasis hash: lulus.
- TypeScript strict dan lint: lulus.
- Unit/component/domain/contract: 19 tes lulus, termasuk backup tanpa aset yatim, restore lossless, serta anchor resize objek berotasi dan rasio dari pusat.
- Regression JavaScript legacy: lulus.
- Browser suite legacy: 30 tes lulus melalui Microsoft Edge lokal.
- Browser suite Next: run lengkap 48 tes lulus pada Chromium/Edge, Firefox, dan WebKit. Ini mencakup migrasi byte PDF, penghapusan PDF setelah reload, serta fault injection storage yang membuktikan rollback atomik dan backup tetap dapat diunduh. Setelah koreksi anchor resize berotasi, enam tes terarah (resize normal dan berotasi pada ketiga browser) juga lulus; suite kini mendefinisikan 51 kasus browser.
- Detector melalui `.venv/Scripts/python.exe`: 7 tes lulus tanpa skip, termasuk PyMuPDF nyata dan kontrak HTTP raw PDF. Interpreter `python` global tidak memiliki PyMuPDF dan melewati dua tes opsional.
- Audit dependency sesudah instalasi framework/toolchain dan formatter: tidak ada vulnerability.
- Screenshot desktop telah diperiksa: header, sidebar, canvas, kontrol PDF, dan tema tampil tanpa overlap pada viewport pengujian 1440 × 1000.

Artefak lokal pengujian: `playwright-report/next/`, screenshot `test-results/next-editor-*.png`, serta PDF `test-results/next-print.pdf` dan `test-results/legacy-print.pdf`. Direktori hasil tes diabaikan Git dan dapat dibersihkan oleh run Playwright berikutnya.

### Pengukuran yang telah dilakukan

- Dataset D2: 5 debitur × 10 halaman × 100 item = 5.000 item. Canvas layar memasang kurang dari tujuh halaman penuh, sementara surface cetak tetap berisi 50 halaman dan 5.000 item.
- Lima sampel command D2 setelah warm-up pada Node 24 di mesin ini: sekitar 13,7–17,5 ms pada run yang dicatat. Ini mengukur domain/store commit dan serialisasi JSON, bukan latensi pointer browser atau OCR.
- Fixture teks F4 menghasilkan satu halaman pada Next dan legacy. Pemeriksaan PDF menggunakan PyMuPDF menemukan selisih bounding box teks horizontal 0,1172 pt, sekitar 0,0413 mm; vertikal setara. Selisih berada di bawah target pembandingan 0,1 mm.
- Kedua PDF memiliki MediaBox yang sama, sekitar 209,889 × 329,861 mm akibat pembulatan ukuran halaman oleh browser. Ini bukan hasil kalibrasi printer fisik.
- Metrik font, posisi item, dan range teks relatif terhadap halaman juga dibandingkan di ketiga browser, dengan toleransi DOM 0,38 px.

Benchmark produksi final memakai Windows, Intel Core i3-1220P, RAM 24 GiB, Node 24.13.0 dan Edge 155.0.4283.62, viewport 1440 × 1000. Service worker diblokir untuk memisahkan profiling editor dari pekerjaan cache; offline diuji terpisah dengan server dihentikan. Angka berikut adalah hasil lokal, bukan jaminan di perangkat/jaringan lain.

| Dataset                              | Hasil run final                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| D1: satu halaman/100 item            | Cold ready 897 ms; p95 lima warm reload 1.132 ms                                                                                 |
| D2: 50 halaman/5.000 item            | Ready 1.475 ms; dua halaman canvas terpasang; frame interval p95 17,9 ms dari 122 sampel                                         |
| D3: PDF sintetis 50 halaman kosong   | Render + scan PDF.js 1.561 ms; dua halaman canvas terpasang; 50 halaman tetap tersedia untuk cetak                               |
| D4: 100 debitur × 100 halaman kosong | Ready 3.186 ms; dua canvas aktif dari 10.000 placeholder; 10.000 halaman pada surface cetak                                      |
| Sepuluh siklus PDF                   | Worker aktif dan object URL kembali nol setiap siklus; font face tetap dua; DOM 485–492 node; listener 364–365 tanpa pertumbuhan |

Ada outlier frame D2 **266,6 ms**, sehingga hasil p95 tidak berarti setiap frame lancar. Heap JS setelah GC naik sekitar **582 KB** selama sepuluh siklus, sementara counter DOM/listener/worker stabil; run ini belum membuktikan plateau heap atau meniadakan kebutuhan soak test lebih panjang. Surface cetak lengkap pada D4 menyumbang total sekitar 70 ribu node DOM, meskipun controller canvas layar dibatasi.

Bukti angka lengkap: [profil performa](benchmarks/next-performance-2026-10-25.json) dan [perbandingan PDF](benchmarks/print-comparison-2026-10-25.json). PDF D3 sintetis tidak mewakili semua PDF kompleks/scanned berukuran maksimum.

## Pemetaan fase

| Fase             | Status                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 Baseline      | Source/kontrak existing dipetakan, regression/browser legacy lulus, D1–D4 sintetis dan output diukur; corpus dokumen produksi masih perlu acceptance pengguna                                                                        |
| P1 Foundation    | App Router, TS, static export, CSS, PDF worker, Ace, offline dan fallback bundler selesai                                                                                                                                            |
| P2 Domain        | Schema/codec, stable ID, geometri, command, metadata legacy dan batas input selesai                                                                                                                                                  |
| P3 State/storage | Draft JSON, history, autosave, migrasi, backup/recovery dan handover tab selesai                                                                                                                                                     |
| P4 Editor        | Panel, toolbar, canvas, selection/marquee, resize, shortcut, tema, dialog/fullscreen dan panduan selesai                                                                                                                             |
| P5 PDF           | Overlay, persistensi byte PDF, scan/review, cancel/fallback dan adapter detector selesai; PaddleOCR nyata menunggu runtime kompatibel                                                                                                |
| P6 Output        | Print/export lengkap dan pembandingan otomatis selesai; cetak fisik belum diverifikasi                                                                                                                                               |
| P7 Hardening     | Pengujian lintas browser, cache/update, rollback storage, CSP, benchmark D1–D4, frame interval dan resource/heap sepuluh siklus tersedia; latensi pointer langsung, soak panjang, dan audit aksesibilitas menyeluruh belum dilakukan |
| P8 Cutover       | Artefak statis, legacy rollback copy, script dan runbook tersedia; deployment origin produksi serta observasi tujuh hari belum dilakukan                                                                                             |

## Penerimaan yang masih memerlukan lingkungan nyata

1. Cetak F4 pada printer target, gunakan skala 100%/margin nol, ukur dan kalibrasi offset. Uji juga menu Print bawaan browser.
2. Uji PaddleOCR dengan Python 3.10–3.12 dan model OCR terpasang. `.venv` yang tersedia memakai Python 3.14; rewrite tidak mengganti atau merusak environment tersebut.
3. Uji izin akses localhost dari origin HTTPS produksi, konfigurasi allowlist service, serta header di hosting/CDN yang dipilih.
4. Lengkapi corpus PDF besar/scanned produksi, pengukuran latensi pointer langsung, analisis outlier frame, soak heap lebih panjang, kuota storage nyata, serta pemeriksaan keyboard/accessibility pada perangkat pengguna. D4 sintetis dan rollback saat fault injection storage sudah diuji.
5. Lakukan rollout pada origin yang tepat, backup lengkap sebelum cutover, simpan artefak/chunk versi sebelumnya, dan observasi tujuh hari sebelum mempertimbangkan penghapusan legacy.

Rewrite lokal dan bukti otomatis tidak dengan sendirinya menyelesaikan acceptance perangkat keras atau deployment produksi. Ikuti [runbook operasional](NEXTJS-OPERATIONS.md) untuk menjalankan dan memindahkan instalasi tanpa kehilangan data.
