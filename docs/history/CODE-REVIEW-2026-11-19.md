# Review dan refactor kode — 19 November 2026

Review memakai working tree yang sudah berisi perubahan sebelumnya (lockfile terhapus, dokumen audit/signing, dsb.). Perubahan tersebut tidak disentuh. Dependensi dipasang dengan `npm install --no-package-lock`, jadi tidak ada lockfile baru.

## Defek yang diperbaiki

Setiap defek di bawah sudah direproduksi dengan logika lama sebelum diperbaiki.

| #   | Lokasi                                                                                  | Gejala                                                                                                                                                                                                                              | Perbaikan                                                             |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `geometry.move`, `commands` (duplicate, align hcenter/right/vcenter/bottom, distribute) | `round(clamp(...))` bisa membulatkan ke atas melewati batas. Elemen lebar 33,33 mm di tepi kanan: 176,67 → 176,7, sehingga ujungnya 210,03 mm. Schema menolak dan perintah gagal dengan pesan "Lebar elemen melewati batas kertas". | `roundWithin()` membulatkan ke grid 0,1 mm tanpa keluar dari rentang. |
| 2   | `field-detector.applyFieldCandidates`                                                   | x dan lebar dibulatkan terpisah: x 100,05 → 100,1, lebar 109,95 → 110, sehingga ujungnya 210,1 mm. Seluruh "Terapkan field" gagal.                                                                                                  | x dibulatkan dulu, lalu lebar di-clamp terhadap x yang sudah bulat.   |
| 3   | `CanvasWorkspace` double-click area kosong                                              | Bila tambah teks ditolak (mis. batas 1.000 elemen/halaman), kode tetap memilih item terakhir halaman dan membuka mode edit pada elemen lama.                                                                                        | Nilai balik `command()` diperiksa.                                    |
| 4   | `EditorClient` tombol "Unduh backup" pada banner read-only                              | Kegagalan `backupWorkspace` (mis. > 150 MB) menjadi unhandled rejection tanpa pesan.                                                                                                                                                | Kegagalan ditampilkan sebagai toast.                                  |
| 5   | `repairWorkspace`                                                                       | Hasil `assertWorkspace()` dibuang, sehingga workspace yang dikembalikan ke UI belum dinormalisasi.                                                                                                                                  | Hasil normalisasi yang disimpan dan dikembalikan.                     |
| 6   | 9 lokasi (`String(error)`)                                                              | Pesan ke pengguna berawalan "Error: …", tidak konsisten dengan tempat lain.                                                                                                                                                         | Helper `errorMessage()` di `src/application/error-message.ts`.        |

## Kode ambigu atau sulit dipahami yang dirapikan

- **Alias `documents`/`debtors`.** Model dibaca dengan `documents ?? debtors ?? []` di lebih dari 15 tempat. Sekarang semuanya lewat `documentEntries()`. `debtors` tetap ditulis sebagai mirror demi kompatibilitas data tersimpan, dan ditandai `@deprecated`.
- **Tiga nama untuk satu target command.** `add`/`addPage` menerima `documentId`, `docId`, dan `debtorId`, dan setiap pemanggil mengisi ketiganya. `addDebtor` identik dengan `addDocument`. Command tidak pernah dipersistensi, jadi alias dihapus dan `documentId` kini wajib di tipe (`AddTarget`).
- **`locate()`.** Fungsi ini mengembalikan objek yang sama dengan empat nama (`document`, `debtor`, `docEntry`, `entry`). Sekarang hanya `document`.
- **`execute()` 175 baris.** Semua jenis command bercampur dalam satu loop. Kini dipecah menjadi `findAddTarget`, `addItem`, `appendPage`, `transformEntry`, `itemTransform`, `applyPatch`, `duplicateItem`, `alignPatches`, dan `distributePatches`.
- **Id halaman virtual.** Format `${docId}-${index}` dulu di-parse manual dengan `startsWith`/`slice`. Kini ada di `src/features/editor/page-slots.ts` (`pageSlotKey`, `slotPageNumber`) beserta dokumentasinya.
- **Logika background.** Jumlah halaman background dan sumber gambar overlay diduplikasi tiga kali (canvas dua kali, export HTML sekali). Kini lewat `overlayPageCount()`/`overlaySource()`. `Array.from({ length: 1 })` di export kini memakai `SHOWCASE_GUIDE_PAGES`.
- **Default bold tersirat.** `bold === false ? 400 : 700` muncul di tiga file. Kini memakai `ITEM_DEFAULTS.bold` dan `isBold()`.
- **Kode mati.**
  - Ternary dengan dua cabang identik (`source instanceof Uint8Array ? source : source`).
  - `superRefine` di `legacySchema` yang tidak bisa terpicu.
  - `LIMITS.debtors` yang tidak terpakai.
- **`escape` membayangi global `escape()`.** Diganti nama menjadi `escapeHtml`.
- **Magic number diberi nama.**
  - Batas history (50 entri, 32 MB).
  - Grouping undo 400 ms dan autosave 500 ms.
  - Snap 1,5 mm dan ambang drag 0,3 mm.
  - Key localStorage legacy dan onboarding.
  - Jumlah langkah tour (dulu `3` dan `/4` ditulis manual).

## Duplikasi yang dihapus

- `load()`/`loadRaw()` memakai transaksi baca yang sama → `readRecords()`.
- Hitungan aset terreferensi di `save` dan `backupWorkspace` → `referencedAssetIds()`.
- `undo`/`redo` identik → `travel()`.
- Tiga aksi recovery (repair/reset/restore) dengan pola lease, repository, dan error yang sama → `withExclusiveRepository()` + `recover()`.
- `repairWorkspace` dipecah menjadi `repairFromStored()`, `repairFromLegacy()`, dan `freshWorkspace()`.
- Schema angka yang menerima string numerik → `numericInput` dipakai bersama oleh schema dokumen dan settings.
- Halaman/dokumen kosong → `emptyPage()`/`emptyDocumentEntry()`.
- Pembersihan preview gesture → `clearPreview()`.

## Temuan yang sengaja tidak diubah

- **`demo` identik dengan dokumen reset.** Akibatnya tombol "Contoh" dan "Reset" melakukan hal yang sama (sejak commit `d310b63`). Perlu keputusan apakah data contoh akan diisi lagi. Sudah diberi catatan di kode.
- **Repair tanpa fallback.** Jika record tersimpan ada tetapi itemnya tidak valid, `repairWorkspace` gagal dan tidak beralih ke data legacy. Fallback otomatis berarti membuang data IndexedDB, jadi perilaku ini dibiarkan.
- **`PrintSurface` merender ulang HTML seluruh dokumen pada setiap revisi.** Ini masalah performa untuk dokumen besar, bukan kebenaran.
- **`field-detector.ts` punya `round`/`clamp` sendiri.** Modul ini mandiri dan teruji, jadi tidak disatukan.
- **Dugaan ID item berubah saat edit JSON karena urutan key.** Sudah diuji dan tidak terbukti (zod mempertahankan urutan input), jadi tidak diubah.

## Istilah "debitur" diganti istilah umum

Kode, UI, test, dan dokumentasi aktif kini memakai **dokumen** (`documents`, `title`), bukan debitur.

- **Model.**
  - `DocumentModel` kini hanya `{ id, documents }`.
  - Tipe `Debtor`, mirror `debtors`, field `debitur` per entry, dan helper `documentEntries()` dihapus. Pemanggil langsung membaca `.documents`.
- **Nama dokumen di JSON.** `TITLE_KEYS = ['title', 'name', 'debitur']` di `schema.ts` menjadi satu-satunya daftar key nama.
  - Key pertama yang ada menjadi nama, dan key lain disimpan di `extra`.
  - Dokumen baru selalu memakai `title`.
  - File lama yang memakai `debitur` tetap terbaca dan diekspor ulang dengan key yang sama.
- **Penyimpanan.** Build sampai commit `6cb21b9` hanya membaca `document.debtors`.
  - `toStoredDocument()` tetap menulis salinan di key tersebut ke IndexedDB dan backup, supaya rollback aman.
  - `assertWorkspace()` membaca record yang hanya punya key itu, lalu membuang salinannya dari model runtime.
  - Key lama hanya disebut di `LEGACY_DOCUMENTS_KEY` dan `TITLE_KEYS`.
- **Sengaja tidak diubah:**
  - Kata `debitur`/`kreditur` di regex deteksi field (`field-detector.ts`, `detector.py`). Ini kosakata yang memang tercetak di formulir, dan menghapusnya akan menurunkan kualitas deteksi.
  - Dokumen audit bertanggal sebelum hari ini, karena isinya catatan historis.

Test baru `tests/unit/document-naming.test.ts` mencakup:

- import dan ekspor JSON dengan key lama
- record yang hanya punya key daftar lama
- fallback judul dari salinan per entry
- salinan rollback yang hanya ada di data tersimpan

## Verifikasi

Regression baru: `tests/unit/code-review-2026-11-19.test.ts` (12 test). Isinya mencakup overflow pembulatan (duplicate, move, align, kandidat field), identitas item setelah edit JSON, materialisasi halaman, kesetaraan referensi entry yang tidak berubah, `isBold`, `errorMessage`, page slot, dan helper overlay.

Hasil: TypeScript strict, ESLint, dan unit/komponen **75/75** lulus. E2E Chromium **46/46** lulus. Firefox dan WebKit tidak dijalankan.

Catatan build: dengan Next.js 16.4.3, `next build` berhasil compile tetapi lalu gagal dengan `SecurityFatalError` karena versi tersebut terkena advisory keamanan. Akibatnya `sw.js` tidak terbentuk dan 2 test service worker gagal. `next` dan `eslint-config-next` kemudian dinaikkan ke **16.4.6** (rilis `latest`, masih satu jalur minor). Dengan versi ini, `npm run build` lulus penuh termasuk cache offline, dan seluruh pemeriksaan di atas lulus ulang: lint, typecheck, unit 75/75, dan E2E Chromium 46/46.
