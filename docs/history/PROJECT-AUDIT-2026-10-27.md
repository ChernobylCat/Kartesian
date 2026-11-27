# Audit project Kartesian — 27 Oktober 2026

Status tindak lanjut: implementasi perbaikan tersedia pada [laporan perbaikan audit](PROJECT-AUDIT-FIXES-2026-10-27.md). Temuan dan bukti di bawah merekam kondisi sebelum perbaikan.

Baseline: commit `6cb21b9` pada branch `feat/field-detection-ocr`. Audit ini memverifikasi implementasi Next.js setelah penghapusan legacy. Source aplikasi tidak diubah. Temuan direproduksi dengan fixture sintetis dan origin browser terisolasi; data workspace pengguna tidak dimodifikasi.

## Hasil pemeriksaan

| Pemeriksaan                                        | Hasil                                                    |
| -------------------------------------------------- | -------------------------------------------------------- |
| Build produksi Next.js/Webpack dan static export   | Lulus; 254 aset precache                                 |
| ESLint                                             | Lulus                                                    |
| TypeScript strict                                  | Lulus                                                    |
| Unit dan komponen                                  | 43/43 lulus                                              |
| E2E produksi                                       | 108/108 lulus; Chromium/Edge, Firefox, WebKit; 6,4 menit |
| Detector Python melalui `.venv/Scripts/python.exe` | 7/7 lulus, tanpa skip; termasuk HTTP dan PyMuPDF nyata   |
| `npm audit --audit-level=high`                     | 0 vulnerability dilaporkan registry                      |
| Reproduksi tambahan                                | 12 defect terkonfirmasi, dijelaskan di bawah             |

Suite existing lulus tetapi belum mencakup kasus-kasus defect berikut. Pemeriksaan tambahan browser dilakukan pada Edge headless; pemeriksaan rotasi service memakai PyMuPDF nyata. Penundaan callback transaksi digunakan secara sengaja untuk mereproduksi perlombaan penyimpanan secara deterministik. Ini pengujian kondisi penyimpanan lambat, bukan klaim bahwa kejadian tersebut selalu muncul pada setiap perpindahan tab.

## Temuan menurut prioritas

### A01 · P1 — Perubahan terakhir tertinggal saat tab lain mengambil alih

Lokasi: [EditorClient.tsx](../../src/features/editor/EditorClient.tsx#L60), [editor-session.ts](../../src/application/editor-session.ts#L8). Pola serupa juga ada pada persiapan update di [useOffline.ts](../../src/features/editor/hooks/useOffline.ts#L24); reproduksi pada audit ini khusus handover tab.

`onTakeover` menunggu flush sebelum mengaktifkan `readonly`. Selama save sedang berjalan, pengguna masih dapat mengedit. Save menyimpan snapshot awal, lalu flush selesai meskipun revisi baru masih pending. Tab lama berubah menjadi hanya-baca sehingga autosave perubahan baru dilewati.

Reproduksi: buka dua tab; tambah elemen di tab pemilik; lakukan Ambil alih dari tab kedua; tambah elemen lagi ketika status tab pertama masih Menyimpan. Dengan callback transaksi ditunda 1,5 detik, tab lama berisi **3 elemen**, sedangkan tab baru dan IndexedDB hanya **2 elemen**. Tab lama tetap berstatus perubahan belum tersimpan.

Perbaikan minimum: bekukan mutasi sebelum mengambil snapshot/flush, pastikan mekanisme flush masih dapat menyimpan selama pembekuan tersebut, lalu lepaskan lease setelah revisi terakhir benar-benar tersimpan. Pulihkan kemampuan edit jika flush gagal. Jangan hanya memindahkan `readonly = true` ke atas: autosave saat ini justru melewati state readonly.

### A02 · P1 — Scan lama menimpa PDF yang baru dipulihkan dari backup

Lokasi: [PdfPanel.tsx](../../src/features/pdf/PdfPanel.tsx#L217), [SettingsPanel.tsx](../../src/features/settings/SettingsPanel.tsx#L25).

Scan menyimpan referensi PDF dalam `next`, menunggu proses async, lalu menulis seluruh objek lama kembali. Import backup dapat mengganti PDF selama proses itu tanpa membatalkan scan.

Reproduksi: unggah `original.pdf`; mulai scan PyMuPDF dengan respons ditahan; impor backup berisi `restored.pdf`; lepaskan respons scan. FileName tersimpan berubah dari **restored.pdf kembali menjadi original.pdf**. Byte dan halaman PDF lama juga berasal dari objek yang sama, sehingga masalah ini lebih luas daripada label file.

Perbaikan minimum: batalkan operasi aktif saat PDF diganti, atau cocokkan identitas/generasi PDF sebelum menerapkan hasil. Hasil scan hanya boleh memperbarui kandidat milik PDF yang dipindai.

### A03 · P1 — Layer negatif terlihat di canvas tetapi hilang saat cetak dan ekspor

Lokasi: [print.css](../../src/styles/print.css#L25), [html.ts](../../src/infrastructure/export/html.ts#L12).

Canvas menggunakan stacking context terisolasi, sedangkan halaman output tidak. Item dengan `z_index: -1` berada di belakang background putih output. Nilai ini dapat dicapai melalui kontrol Layer atau tombol Kirim ke belakang.

Reproduksi: elemen 20 × 20 mm dengan highlight magenta dan layer -1. Screenshot mendeteksi **3.136 piksel magenta pada preview**, tetapi **0 pada print media dan HTML mandiri**.

Perbaikan minimum: samakan stacking context halaman serta urutan background dan item antara preview, cetak, dan HTML; verifikasi juga ketika background disertakan.

### A04 · P1 — Koordinat PyMuPDF tidak mengikuti rotasi halaman

Lokasi: [detector.py](../../services/pdf-field-detector/detector.py#L145), terutama konversi widget pada baris 155. Normalisasi koordinat juga dipakai extractor vector/text/table.

Rect widget yang belum dirotasi langsung dibagi dengan `page.rect` yang ukurannya sudah mengikuti rotasi. Kandidat lalu tidak berimpit dengan gambar PDF.js yang dirender berotasi.

Reproduksi nyata: widget pada PDF 612 × 960 pt diuji pada 0°, 90°, 180°, 270°. Kasus 0° cocok dengan toleransi pembulatan. Pada 90°, koordinat X normalized full-sheet menjadi **21,9 mm**, seharusnya sekitar **159,7 mm** sebelum pemetaan contain; 180° dan 270° juga salah. Suite browser rotated-PDF existing memakai mode PDF.js sehingga tidak menangkap bug service ini.

Perbaikan minimum: transformasikan rect ke koordinat visual dengan matriks rotasi sebelum normalisasi. Terapkan kontrak koordinat yang sama pada semua extractor dan uji crop/rotation; koordinat hasil OCR berbasis pixmap sudah berada dalam ruang visual sehingga jangan dirotasi dua kali.

### A05 · P2 — PDF rusak meninggalkan worker yang tidak diterminasi

Lokasi: [pdf-runtime.ts](../../src/infrastructure/pdf/pdf-runtime.ts#L14).

Jika `task.promise` gagal, `openPdf` melempar sebelum mengembalikan instance. Blok finally pada PdfPanel tidak mempunyai instance untuk menghancurkan loading task tersebut.

Reproduksi: unggah tiga file `.pdf` rusak berturut-turut. Instrumentasi constructor/terminate Worker menunjukkan jumlah worker yang belum diterminasi **1 → 2 → 3** setelah masing-masing proses selesai. Tidak dilakukan klaim ukuran kebocoran heap dari hitungan ini.

Perbaikan minimum: hancurkan loading task pada jalur kegagalan pembukaan PDF, dan pastikan pembatalan selama pembukaan juga membersihkan task.

### A06 · P2 — Resize teks berukuran otomatis memakai estimasi yang berbeda dari ukuran visual

Lokasi: [geometry.ts](../../src/domain/document/geometry.ts#L39), [useCanvasPointer.ts](../../src/features/editor/hooks/useCanvasPointer.ts). Ukuran DOM sudah dikumpulkan untuk penggaris, tetapi resize masih memakai `dimensions(item)`.

Reproduksi pada zoom 75%: teks tanpa width/height mempunyai lebar visual **54 px**. Handle kanan digeser **6 px ke kanan**, tetapi lebar akhir menjadi **51,87 px**, sehingga elemen malah mengecil. Estimasi awal domain adalah 16,2 mm, berbeda dari ukuran visual awal sekitar 19,05 mm.

Perbaikan minimum: gunakan dimensi awal yang benar-benar diukur untuk gesture pertama pada teks auto-size. Audit pemakaian estimasi yang sama pada snapping dan alignment agar panduan konsisten dengan batas visual.

### A07 · P2 — Input numerik mempertahankan nilai yang ditolak model

Lokasi: [PropertyPanel.tsx](../../src/features/editor/components/PropertyPanel.tsx#L44), NumericField dan callback properti.

Input menyimpan draft lokal sebelum memanggil command. Jika validasi menolak perubahan, nilai prop lama tidak berubah sehingga effect reset tidak berjalan.

Reproduksi: elemen X=20 mm dengan lebar 30 mm; isi X=209 lalu Enter. Toast menyatakan elemen melewati batas, tetapi input tetap menampilkan **209**, sementara posisi canvas/IndexedDB tetap **20**.

Perbaikan minimum: kembalikan input ke nilai model saat commit ditolak, atau tampilkan state invalid eksplisit. Jangan menampilkan nilai yang ditolak seolah sudah diterapkan.

### A08 · P2 — Upload gambar dari sidebar mengabaikan halaman aktif

Lokasi: [EditorClient.tsx](../../src/features/editor/EditorClient.tsx#L308), fallback target dalam `addImage`.

Jika tidak ada elemen terpilih, fallback selalu dokumen/halaman pertama. Alur tambah teks sudah mempunyai resolusi halaman aktif, tetapi upload gambar belum menggunakannya.

Reproduksi: tambah halaman kedua; klik area kosong halaman kedua; gunakan tombol Gambar di sidebar. Distribusi gambar tersimpan menjadi **[1, 0]**, meskipun halaman aktif adalah halaman kedua. Tombol + Gambar pada header halaman mempunyai target eksplisit dan tidak mengalami kasus ini.

Perbaikan minimum: gunakan resolver target aktif yang sama untuk teks dan gambar, termasuk halaman virtual PDF.

### A09 · P2 — Sidebar mobile memotong kontrol

Lokasi: [globals.css](../../src/styles/globals.css#L607), aturan sidebar dua kolom pada viewport kecil.

Reproduksi pada **320 × 568 px**: tombol Backup, Ekspor settings, dan Impor settings/backup mempunyai batas kanan sekitar **389 px**, di luar viewport. Tombol Hapus highlight juga melampaui viewport ketika elemen dipilih. Scroll width dokumen tetap 320 px sehingga kontrol terpotong dalam area sidebar. Screenshot diperiksa secara visual.

Perbaikan minimum: gunakan satu kolom pada layar sempit dan pastikan grid anak/button dapat menyusut atau membungkus label. Verifikasi kontrol sidebar lengkap, bukan hanya dialog mobile.

### A10 · P2 — Recovery masih mengarah ke editor legacy yang sudah dihapus

Lokasi: [EditorClient.tsx](../../src/features/editor/EditorClient.tsx#L141), [NEXTJS-OPERATIONS.md](../guides/NEXTJS-OPERATIONS.md).

Halaman pemulihan menawarkan Buka editor legacy, tetapi hasil build saat ini mengembalikan **HTTP 404 pada `/legacy/`**. Runbook masih menginstruksikan pemulihan melalui route tersebut dan masih menyebut build legacy/parser `.mjs`, meskipun baseline sekarang pure Next.js.

Perbaikan minimum: selaraskan UI recovery dan runbook dengan mekanisme backup/import yang tersedia dan arsip legacy yang sebenarnya. Hindari mengarahkan pengguna dengan data bermasalah ke route mati.

### A11 · P2 — Nama dokumen dari key `name` diabaikan

Lokasi: [model.ts](../../src/domain/document/model.ts#L90), [schema.ts](../../src/domain/document/schema.ts).

Schema menerima `name` sebagai nama dokumen valid, tetapi codec hanya mengambil `title` atau `debitur`.

Reproduksi: input `[{"name":"Nama dari import","pages":[]}]` menghasilkan judul internal **Dokumen 1** dan output menambahkan `title: "Dokumen 1"`. Metadata `name` masih ada, tetapi nama yang dipakai UI/output berubah dan title baru kemudian lebih diprioritaskan.

Perbaikan minimum: gunakan resolusi nama dan penulisan kembali key yang konsisten dengan seluruh bentuk input yang diterima schema.

### A12 · P3 — Properti font/warna bawaan tidak mencerminkan canvas

Lokasi: [PropertyPanel.tsx](../../src/features/editor/components/PropertyPanel.tsx#L243), [CanvasWorkspace.tsx](../../src/features/editor/components/CanvasWorkspace.tsx).

Reproduksi: teks tanpa `font_family` dan `color` ditampilkan sebagai **Courier New / hitam #000000** di canvas, tetapi panel menunjukkan **Arial / #111827**. Ini membuat nilai terpilih menyesatkan, termasuk ketika pengguna ingin memilih Arial yang sudah terlihat terpilih.

Perbaikan minimum: pakai default presentasi yang sama pada panel, canvas, dan output; tampilkan state campuran secara terpisah ketika multi-selection berbeda nilai.

## Cakupan komponen

| Area                                                  | Pemeriksaan yang dilakukan                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| App shell, toolbar, help, onboarding, Dialog          | Source review; navigasi, focus/Escape, centering, tema dan empat viewport melalui E2E          |
| Canvas, selection, marquee, pointer, resize, keyboard | Source review, unit, E2E dan reproduksi auto-size/target upload                                |
| Ruler, crosshair, session guide, virtualisasi         | Source review dan E2E tiga browser; zoom 40/75/150%, snapping dan virtual-page materialization |
| PropertyPanel dan JsonPanel                           | Validasi/schema, invalid draft, formatting, properti dan input yang ditolak                    |
| Model, command, history, codec                        | Unit/round-trip/invariant, batas input dan reproduksi alias name                               |
| Autosave, IndexedDB, lease, backup/recovery           | Unit, E2E rollback/quota/checksum, migrasi byte PDF dan reproduksi handover lambat             |
| PDF runtime, review, detector browser/service         | E2E rasio background, apply/undo, malformed PDF, scan/import race dan PyMuPDF rotasi nyata     |
| PrintSurface, standalone HTML, kalibrasi              | E2E geometri/typografi dan pemeriksaan piksel layer negatif                                    |
| Offline/update, aset lokal, build/CI                  | Source review, cold offline dan update-veto E2E, build/type/lint/audit                         |

## Bukti dan batas verifikasi

- [Hasil reproduksi codec, default, resize, worker, layer dan recovery](verification/audit-2026-10-27/results.json).
- [Hasil reproduksi async, input numerik, upload dan mobile](verification/audit-2026-10-27/async-results.json).
- [Perbandingan rotasi PyMuPDF](verification/audit-2026-10-27/rotation.json).
- [Preview layer negatif](verification/audit-2026-10-27/negative-layer-preview.png), [print media](verification/audit-2026-10-27/negative-layer-print.png), [HTML mandiri](verification/audit-2026-10-27/negative-layer-export.png).
- [Screenshot sidebar mobile](verification/audit-2026-10-27/mobile-320.png). Bagian canvas di bawah fold dapat berupa placeholder virtual saat screenshot full-page; temuan mobile di atas berdasarkan kontrol sidebar yang memang terlihat dan terukur.
- Laporan E2E lokal: `playwright-report/index.html`. Reproducer lokal: `test-results/audit-2026-10-27/`; direktori hasil tes diabaikan Git dan dapat dibersihkan run berikutnya.

Tes HTTP Python dan npm audit awalnya terhalang pembatasan socket/DNS sandbox, kemudian dijalankan kembali di host dan lulus. Kegagalan lingkungan awal tersebut tidak dihitung sebagai defect aplikasi.

Printer fisik, PaddleOCR dengan model nyata, corpus dokumen produksi, aksesibilitas dengan pembaca layar, dan soak test panjang belum diverifikasi pada audit ini. Hasil lulus suite existing bukan jaminan bahwa seluruh kombinasi input bebas bug. Urutan perbaikan yang disarankan adalah A01–A04, lalu A05–A11, kemudian A12, dengan regression test khusus untuk masing-masing kasus.
