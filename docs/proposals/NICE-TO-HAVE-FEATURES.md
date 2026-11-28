# Kurasi fitur _nice to have_ — 19 November 2026

Daftar ini disusun dari celah yang benar-benar ada di kode saat ini, bukan dari daftar fitur umum editor. Setiap fitur sudah dicek belum ada di `src/`.

Patokan prioritas:

1. **Melengkapi alur yang sudah ada** lebih dulu daripada membuka alur baru.
2. **Tetap local-first.** Tidak ada fitur di daftar ini yang mengirim data pengguna ke server.
3. **Kompatibel ke belakang.** Field baru di JSON bersifat opsional, jadi dokumen lama tetap valid dan build lama tetap bisa membacanya.

Ukuran usaha: **S** ≈ 1–2 hari, **M** ≈ 3–5 hari, **L** ≈ 1–2 minggu (termasuk test dan terjemahan ID/EN).

## Status implementasi — 23 November 2026

Fitur 1–12 sudah dibangun, lengkap dengan unit test dan test E2E (`tests/e2e/phase1.spec.js`, `phase2.spec.js`, `phase3.spec.js`). Fitur 13 dibatalkan. Penyimpangan dari usulan awal:

| #   | Status     | Catatan                                                                                                                                                                                                                             |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Selesai    | Format nilai: `upper`, `lower`, `title`, `number`, `rupiah`, `words` (terbilang/English), `date:<pola>`. Hasil merge mengganti semua dokumen secara default (bisa dibatalkan dengan undo), atau ditambahkan bila opsinya dimatikan. |
| 2   | Selesai    | Perkecil agar muat mengukur teks dengan metrik font browser.                                                                                                                                                                        |
| 3   | Selesai    | Lewat clipboard sistem, jadi juga bisa antar tab.                                                                                                                                                                                   |
| 4   | Selesai    | Pilihan berlaku **selama sesi saja**, tidak disimpan per workspace, supaya format settings tidak berubah.                                                                                                                           |
| 5   | Selesai    | —                                                                                                                                                                                                                                   |
| 6   | Selesai    | Urutan diubah dengan tombol naik/turun, bukan drag. Menyembunyikan elemen hanya berlaku di layar dan selama sesi.                                                                                                                   |
| 7   | Selesai    | Grid 1, 2, 5, 10 mm; snap menarik sudut kiri-atas elemen ke garis grid. Pilihan grid disimpan per perangkat.                                                                                                                        |
| 8   | Selesai    | Duplikat dari elemen yang dikelompokkan membentuk grup baru.                                                                                                                                                                        |
| 9   | Selesai    | Disimpan di database terpisah `KartesianLibraryDB` (database utama tidak diubah, jadi rollback tetap aman). Template berisi salinan lengkap workspace.                                                                              |
| 10  | Selesai    | Default tetap milimeter untuk semua ukuran kertas; satuan dipilih manual dan disimpan per perangkat.                                                                                                                                |
| 11  | Selesai    | Code 128 dan EAN-13 ditulis sendiri dan diverifikasi terhadap `python-barcode`; QR memakai `qrcode-generator` (MIT).                                                                                                                |
| 12  | Selesai    | Memakai `pdf-lib` (MIT) dengan font standar PDF: Helvetica, Times, Courier. Georgia, Verdana, dan Plus Jakarta Sans disubstitusi; karakter di luar font standar menjadi `?`. Cetak browser tetap memakai font editor yang persis.   |
| 13  | Dibatalkan | Dicoret atas keputusan pemilik proyek (28 November 2026). Aplikasi tetap dua bahasa: Indonesia dan Inggris.                                                                                                                         |

## Ringkasan

| #   | Fitur                                                                          | Nilai           | Usaha        | Tahap |
| --- | ------------------------------------------------------------------------------ | --------------- | ------------ | ----- |
| 1   | Data merge dari CSV ke placeholder `{{key}}`                                   | Sangat tinggi   | M–L          | 1     |
| 2   | Format teks untuk formulir: rata, letter-spacing (comb), line-height, auto-fit | Tinggi          | M            | 1     |
| 3   | Copy/paste elemen antar halaman dan dokumen                                    | Tinggi          | S            | 1     |
| 4   | Cetak/ekspor sebagian: pilih dokumen atau rentang halaman                      | Tinggi          | S–M          | 1     |
| 5   | Elemen centang dan garis: ✓/✗, garis, kotak penutup                            | Sedang–tinggi   | M            | 2     |
| 6   | Panel layer: daftar elemen per halaman                                         | Sedang          | M            | 2     |
| 7   | Zoom fit dan grid dengan snap                                                  | Sedang          | S            | 2     |
| 8   | Group/ungroup elemen                                                           | Sedang          | M            | 2     |
| 9   | Beberapa workspace dan library template                                        | Tinggi          | L            | 3     |
| 10  | Satuan inci/poin untuk pengguna Letter/Legal                                   | Sedang (global) | M            | 3     |
| 11  | Elemen barcode dan QR                                                          | Sedang          | M            | 3     |
| 12  | Ekspor PDF native (vektor, tanpa dialog cetak)                                 | Tinggi          | L            | 3     |
| 13  | ~~Bahasa tambahan~~ (dibatalkan)                                               | Rendah–sedang   | S per bahasa | 3     |

**Urutan yang disarankan.** Tahap 1 menuntaskan janji utama produk, "susun sekali, isi untuk banyak dokumen", dan menutup masalah yang paling sering muncul saat mengisi formulir nyata. Tahap 2 mempercepat kerja harian. Tahap 3 membuka pasar global dan memperbesar skala pemakaian.

## Tahap 1 — melengkapi alur inti

### 1. Data merge dari CSV

**Masalah.** Deteksi field sudah menghasilkan placeholder seperti `{{nama}}`, tetapi placeholder itu tercetak apa adanya. Untuk mengisi 50 formulir, pengguna harus menyalin layout dan mengetik data satu per satu, atau menyusun JSON sendiri.

**Usulan.**

- Satu dokumen menjadi **template**. Impor CSV yang baris pertamanya berisi nama key, lalu setiap baris menghasilkan satu dokumen dengan semua `{{key}}` diganti nilai dari kolom yang sama.
- Ada pratinjau per baris sebelum diterapkan. Key yang tidak ada di CSV dan kolom yang tidak dipakai di template ditandai.
- Opsi pengisian:
  - nilai kosong;
  - pemotongan teks bila melewati lebar kotak (terkait fitur 2);
  - format tanggal dan angka sederhana, misalnya `{{tanggal|dd MMMM yyyy}}` dan `{{nominal|rupiah}}`.
- Penerapannya satu langkah undo.

**Titik sentuh.** Fungsi murni baru di `src/domain/document/` untuk mengganti placeholder per baris (bisa diuji tanpa UI), dialog impor baru di `src/features/`, dan pesan di `src/i18n/messages/`.

**Risiko.**

- Batas 100 dokumen dan 5.000 elemen (`LIMITS`) cepat tercapai. Tampilkan sisa kuota sebelum impor.
- Encoding CSV: dukung UTF-8 dan UTF-8 dengan BOM, dengan pemisah koma atau titik koma (Excel berbahasa Indonesia memakai titik koma).
- XLSX sebaiknya menyusul, karena butuh library tambahan.

**Selesai bila:** CSV 50 baris menghasilkan 50 dokumen yang tercetak benar, satu kali undo mengembalikan semuanya, dan ada test domain untuk penggantian placeholder.

### 2. Format teks untuk formulir

**Masalah.** Item teks belum punya perataan, jarak huruf, maupun tinggi baris. Field kotak per karakter seperti NIK saat ini hanya bisa dipaskan dengan font monospace dan spasi manual. Teks panjang juga bisa melewati kotaknya tanpa peringatan.

**Usulan.** Tambahkan properti opsional berikut. Dokumen lama tetap valid, dan default-nya sama dengan perilaku sekarang.

- `text_align`: `left` | `center` | `right`, berlaku bila `width` diisi.
- `letter_spacing` dalam mm, ditambah mode **comb**: isi `comb_cells: 16`, dan setiap karakter otomatis masuk ke satu dari 16 kotak sama lebar.
- `line_height` untuk teks multi-baris.
- `fit: 'shrink'`: memperkecil font sampai teks muat di kotak, dengan batas minimal 4 pt.

**Titik sentuh.** Schema di `src/domain/document/schema.ts`, render kanvas (`CanvasWorkspace.tsx`), output cetak dan HTML (`src/infrastructure/export/html.ts`), serta panel properti.

**Risiko.** Kanvas dan hasil cetak harus identik. Tambahkan test E2E yang membandingkan posisi karakter comb di kanvas dan di PDF cetak.

### 3. Copy/paste elemen

**Masalah.** Duplikasi sudah ada (`Ctrl/Cmd + D`), tetapi hanya di halaman yang sama. Belum ada `Ctrl/Cmd + C/V`, jadi memindahkan elemen ke halaman atau dokumen lain harus lewat JSON.

**Usulan.** Clipboard internal yang menyimpan item terpilih beserta asetnya. Paste ke halaman aktif dengan posisi yang sama, atau digeser 5 mm bila di halaman yang sama. Opsi lanjutan: menyalin ke clipboard sistem sebagai JSON, supaya bisa dipindah antar tab.

**Titik sentuh.** `useKeyboard.ts`, command `add` multi-item di `src/domain/document/commands.ts`, dan menu konteks.

### 4. Cetak dan ekspor sebagian

**Masalah.** Cetak dan Ekspor HTML selalu memproses semua dokumen dan semua halaman (`outputPages`). Untuk mencetak ulang satu formulir yang salah, pengguna harus mencetak semuanya atau mengatur halaman di dialog printer.

**Usulan.** Dialog pilihan output: semua, dokumen tertentu, atau rentang halaman. Pilihan terakhir diingat per workspace.

**Titik sentuh.** Parameter filter di `outputPages`, `PrintSurface`, dan `standaloneHtml`.

## Tahap 2 — produktivitas

### 5. Elemen centang dan garis

Formulir sering berisi kotak centang, garis coret, atau area yang perlu ditutup. Usulannya: tipe item baru `mark` (✓, ✗, ●) dengan ukuran mengikuti kotak, `line` (horizontal, vertikal, atau miring dengan ketebalan), dan `rect` (isi putih untuk menutup teks pracetak). Semuanya ikut tercetak dan teruji seperti item teks.

### 6. Panel layer

Daftar elemen per halaman, diurutkan menurut `z_index`, dengan nama otomatis dari isi teks. Pengguna bisa memilih elemen yang tertutup elemen lain, menyembunyikannya sementara di layar (tidak tersimpan), mengunci, dan mengubah urutan dengan drag.

### 7. Zoom fit dan grid

- **Zoom:** "Pas lebar" dan "Pas halaman", selain persentase tetap.
- **Grid:** opsional, dengan jarak 1/5/10 mm, dan bisa dipakai sebagai target snap di samping garis bantu yang sudah ada.

### 8. Group/ungroup

Memindahkan dan mengunci beberapa elemen sebagai satu kesatuan, misalnya satu blok alamat. Simpan sebagai `group_id` opsional pada item, sehingga tidak mengubah struktur halaman.

## Tahap 3 — skala dan pasar global

### 9. Beberapa workspace dan library template

**Masalah.** IndexedDB hanya menyimpan satu record `active`, jadi pengguna dengan beberapa jenis formulir harus bergantian lewat backup dan restore.

**Usulan.**

- Daftar workspace dengan nama, tanggal ubah, dan ukuran kertas.
- Aksi: buat, duplikat, ganti nama, dan hapus.
- "Simpan sebagai template" menyimpan layout tanpa data isian, cocok dipadukan dengan data merge (fitur 1).

**Risiko.**

- Butuh migrasi penyimpanan ke versi skema baru.
- Session lease antar tab perlu dibuat per workspace.
- Rollback ke build lama perlu dipikirkan, dengan pola yang sama seperti salinan `debtors` di `toStoredDocument`.

### 10. Satuan inci dan poin

Pengguna Amerika Utara berpikir dalam inci. Data tetap disimpan dalam mm. Yang berubah hanya tampilan penggaris, input properti, dan pesan, dengan preferensi mm/in/pt per perangkat. Default-nya bisa mengikuti ukuran kertas: Letter/Legal → inci.

### 11. Barcode dan QR

Tipe item `barcode` (Code 128, EAN-13) dan `qr` yang dirender di browser dan ikut placeholder, misalnya QR berisi `{{nomor_registrasi}}`. Butuh library kecil yang bisa berjalan offline. Evaluasi ukuran bundle dan lisensinya sebelum memilih.

### 12. Ekspor PDF native

Hasil cetak browser bisa berbeda antar browser dan driver. Ekspor PDF vektor dengan ukuran halaman persis, misalnya memakai `pdf-lib`, memberi satu berkas yang identik di mana pun dicetak dan mudah dikirim.

Risikonya ada pada metrik font yang harus sama dengan kanvas. Font perlu disematkan, dan perlu ada test pembanding posisi teks di PDF terhadap kanvas, seperti test cetak yang sudah ada.

### 13. ~~Bahasa tambahan~~ (dibatalkan)

> Dicoret atas keputusan pemilik proyek pada 28 November 2026. Aplikasi tetap dua bahasa, Indonesia dan Inggris. Catatan di bawah disimpan sebagai rujukan.

Infrastruktur i18n sudah siap: tambahkan satu kamus di `src/i18n/messages/`, isi `LANDING`, lalu daftarkan di `LOCALES`. Test kamus otomatis memastikan key dan placeholder lengkap. Prioritas bahasa sebaiknya mengikuti data pengunjung setelah aplikasi dirilis global.

## Di luar daftar ini

- **Tanda tangan elektronik** sudah punya proposal sendiri di [`e-signature/`](e-signature/ELECTRONIC-SIGNATURE-MASTERPLAN.md), dan membutuhkan runtime server.
- **Sinkronisasi antar perangkat** bertentangan dengan prinsip local-first saat ini. Bila nanti dibutuhkan, sebaiknya opt-in dan dienkripsi end-to-end, dan dibahas sebagai proposal terpisah.
