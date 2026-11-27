# Audit dan refactor kode — 29 Oktober 2026

Audit memakai working tree yang sudah berisi perubahan sebelumnya, termasuk transisi `debtors` ke `documents`, recovery UI, dan showcase recording. Perubahan tersebut dipertahankan; file scratch/video tidak dihapus.

## Perbaikan

- **P1, startup storage:** kegagalan `repository.load()` kini diteruskan ke recovery, bukan memicu repair lalu migrasi otomatis. Kegagalan membaca tidak dianggap database kosong. Repair/reset eksplisit pada UI dipertahankan.
- **P2, command:** dokumen/halaman tujuan yang sudah hilang ditolak dengan pesan jelas. Page number harus integer 1–100 sebelum loop materialisasi; Infinity tidak dapat memicu loop tanpa akhir. `documentId` menjadi target utama, dengan fallback alias lama untuk kompatibilitas.
- **P2, persistensi:** struktur entry legacy divalidasi melalui schema yang sama dengan entry modern. Normalisasi menghasilkan salinan, bukan memutasi snapshot store/history. Save/backup memakai hasil normalisasi. Normalisasi ganda dalam load dihapus.
- **P2, lease tab:** pesan penolakan handover segera menyelesaikan promise dengan error. Request paralel dan request setelah close ditolak; close membersihkan request/timer. Lock yang baru dikirim setelah close tidak ditahan. Transfer bersamaan tidak menjalankan callback pemilik berulang kali.
- **P2, pointer:** commit memakai koordinat/modifier pointer-up terbaru dan mengabaikan pointer ID yang berbeda.
- **Dead code/ambiguity:** prop fallback `debtor` pada CanvasPage dihapus karena `docEntry` selalu wajib. Export `assetDigest` dihapus setelah pencarian caller tidak menemukan pemakaian. Pemeriksaan target command yang redundan disederhanakan. Alias data dan command legacy yang masih dipakai tetap tersedia.

## Verifikasi

Regression baru ada di `tests/unit/refactor-regressions.test.ts`: read error tanpa write, input snapshot immutable, validasi struktur legacy, target command invalid, penolakan handover, penutupan sesi dan lock terlambat.

Pemeriksaan unused TypeScript tidak menemukan laporan pada source aplikasi; hanya dua symbol pada `.next/dev/types/validator.ts` yang dihasilkan Next. File generated tersebut tidak diedit. Ini tidak membuktikan semua exported API tidak terpakai: alias kompatibilitas tidak dihapus hanya karena terlihat mirip.

Hasil final: build produksi, ESLint, TypeScript strict, format file yang berubah, dan `git diff --check` lulus. Unit/komponen **63/63**, browser **138/138** (Chromium/Edge, Firefox, WebKit, 7,4 menit), serta Python **9/9** lulus. Laporan browser lokal: `playwright-report/index.html`. Tidak dibuat commit atau deployment eksternal.

Audit/refactor ini tidak menjamin seluruh kombinasi input bebas bug. Cetak fisik, model OCR nyata, serta soak test panjang tidak dilakukan.
