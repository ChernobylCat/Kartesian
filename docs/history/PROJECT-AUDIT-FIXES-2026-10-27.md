# Perbaikan hasil audit — 27 Oktober 2026

Seluruh 12 temuan pada [audit project](PROJECT-AUDIT-2026-10-27.md) telah diimplementasikan. Data workspace pengguna tidak diubah untuk pengujian; browser menggunakan fixture sintetis pada origin terisolasi.

## Perubahan

| Temuan                           | Perbaikan dan perilaku akhir                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 · Penyimpanan saat handover  | Edit inline/numerik yang sedang fokus diselesaikan terlebih dahulu. Store membekukan mutasi sebelum flush tanpa melepas hak menyimpan. Lease dilepas setelah status saved; kegagalan simpan membuka edit kembali. Protokol update PWA memakai pembekuan yang sama dan melepasnya saat update dibatalkan. |
| A02 · Hasil scan PDF lama        | Operasi memantau identitas PDF dan hak edit. Import, penghapusan/penggantian PDF, atau pembekuan workspace membatalkan operasi lama, sehingga hasilnya tidak dapat menimpa PDF baru.                                                                                                                     |
| A03 · Layer negatif di output    | Halaman cetak/HTML mempunyai stacking context terisolasi. Background berada pada layer -1001, di bawah rentang item -1000…1000; canvas memakai urutan yang sama.                                                                                                                                         |
| A04 · Rotasi PyMuPDF             | Rect widget, text, vector dan table ditransformasikan ke ruang visual melalui matriks rotasi sebelum normalisasi. OCR tetap memakai koordinat pixmap yang sudah mengikuti rotasi. Filter ukuran vector memakai lebar CropBox tanpa rotasi.                                                               |
| A05 · Worker PDF gagal           | Loading task dihancurkan pada kegagalan, batas halaman, atau pembatalan saat PDF masih dibuka. Jalur sukses tetap menyerahkan lifetime task kepada pemanggil.                                                                                                                                            |
| A06 · Geometri teks otomatis     | Resize pertama memakai ukuran DOM awal, bukan estimasi panjang teks. Snap memakai ukuran terukur pada halaman; alignment melalui toolbar dan keyboard menerima ukuran terukur pilihan. Ukuran pengukuran ini tidak dipersistenkan sebagai properti dokumen.                                              |
| A07 · Nilai numerik yang ditolak | Command mengembalikan status berhasil/gagal ke kontrol. NumericField mengembalikan tampilan ke nilai model ketika validasi menolak perubahan.                                                                                                                                                            |
| A08 · Tujuan upload gambar       | Tombol Gambar sidebar memakai resolver halaman aktif yang sama dengan tombol Teks, termasuk halaman virtual. Penambahan gambar dan registrasi aset terjadi dalam satu commit yang tunduk pada pembekuan/hak edit.                                                                                        |
| A09 · Sidebar mobile             | Sidebar menjadi satu kolom pada layar ≤480 px. Grid numerik dapat menyusut; label tombol dapat membungkus pada mobile. Kontrol diuji pada lebar 320, 390, 480 dan 640 px.                                                                                                                                |
| A10 · Recovery legacy            | Link mati `/legacy/` dihapus dari UI recovery. Instruksi mengarah ke retry dan restore backup lengkap. Runbook dan README memakai arsitektur, perintah, serta lokasi arsip yang sekarang tersedia.                                                                                                       |
| A11 · Alias nama dokumen         | Codec mengikuti prioritas nama schema: title, name, debitur. Key asal dan alias tambahan dipertahankan saat round-trip; nama tidak diganti menjadi Dokumen 1.                                                                                                                                            |
| A12 · Default properti           | Default font, ukuran dan warna dibagikan oleh panel, canvas dan HTML: Courier New, 10 pt, #000000. Font/ukuran campuran ditampilkan terpisah dari nilai default.                                                                                                                                         |

Pembekuan adalah state sesi, terpisah dari ownership readonly dan tidak disimpan ke backup. Format workspace tetap schemaVersion 2; tidak ada penghapusan data atau migrasi database baru.

## Verifikasi

- ESLint dan TypeScript strict: lulus.
- Build produksi Next.js/Webpack: lulus; 254 aset offline.
- Unit/komponen: **54/54 lulus**, termasuk freeze sebelum flush, kegagalan storage, draft JSON invalid, alias nama, geometri terukur, dan cleanup loading task PDF.
- Python: **9/9 lulus** melalui `.venv/Scripts/python.exe`, tanpa skip. Widget diuji pada 0/90/180/270° dengan dan tanpa CropBox; vector diuji berotasi; kontrak HTTP memakai PyMuPDF nyata.
- Sepuluh skenario browser baru telah lulus pada Edge sebelum suite lengkap dijalankan.
- Suite browser lengkap: **138/138 lulus** pada Chromium/Edge, Firefox dan WebKit, tanpa retry, dalam 7,3 menit. Ini mencakup 108 kasus existing dan 30 kasus baru.
- Pemeriksaan visual tambahan dengan service worker normal: sidebar mobile tanpa overflow, default properti sesuai, dan tidak ada page error JavaScript.

Regression browser baru berada di [audit-fixes.spec.js](../../tests/e2e/audit-fixes.spec.js). Kasus handover menunda callback transaksi 1,5 detik, memverifikasi draft inline ikut tersimpan dan mutasi selama freeze ditolak. Kasus PDF menahan respons scan, melakukan restore backup, lalu memastikan PDF hasil restore tetap bertahan setelah scan lama dan reload. Kasus layer memeriksa piksel pada preview, print media, dan HTML mandiri dengan background aktif serta layer item minimum -1000. Kasus worker memastikan tiga PDF rusak berturut-turut kembali ke nol worker yang belum diterminasi.

Artefak visual: [desktop](verification/audit-fixes-2026-10-27/desktop.png), [mobile](verification/audit-fixes-2026-10-27/mobile.png), [hasil pemeriksaan visual](verification/audit-fixes-2026-10-27/visual-check.json). Canvas di bawah fold pada screenshot mobile dapat berupa placeholder virtual; geometri canvas dan output diverifikasi terpisah oleh E2E.

Laporan E2E lokal tersedia pada `playwright-report/index.html`; trace/screenshot kegagalan disimpan di `test-results/audit-fixes-final-2026-10-27/` bila ada. Build awal terhalang izin direktori `.next` dalam sandbox Windows dan berhasil saat dijalankan ulang di host. Tidak ada dependency baru, commit Git, maupun deployment eksternal.

Printer fisik dan model PaddleOCR nyata tidak dijalankan pada verifikasi ini. Hasil audit awal disimpan sebagai bukti kondisi sebelum perbaikan.
