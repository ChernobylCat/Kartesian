# Kartesian Legacy Standalone Archive
Tanggal Backup: 27 Oktober 2026

Arsip ini berisi seluruh kode sumber, aset vendor, dan pengujian untuk implementasi asli Kartesian (Vanilla JS Single Page Application) sebelum peniadaan legacy codebase.

## Cara Menjalankan Versi Legacy
Aplikasi ini murni statis tanpa ketergantungan build. Anda dapat menjalankannya dengan server web statis apa pun:

### Opsi 1: Menggunakan npx serve
```bash
npx serve -l 4173 .
```
Buka peramban di http://127.0.0.1:4173

### Opsi 2: Menggunakan Python
```bash
python -m http.server 4173
```
Buka peramban di http://127.0.0.1:4173

### Opsi 3: Menggunakan Node static-server bawaan
```bash
node tests/support/static-server.js
```

## Struktur Berkas
- index.html: Entry point aplikasi utama.
- assets/vendor/: Library bawaan (PDF.js, Ace editor, Driver.js).
- assets/app.css: Stylesheet Tailwind terkompilasi.
- src/: Logika aplikasi modular (.mjs).
- tests/: Tes regresi dan tes browser Playwright.
