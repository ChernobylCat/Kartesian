# Deploy ke Google Cloud Run

Kartesian adalah static export Next.js (`output: 'export'`). Tidak ada API, database, atau penyimpanan di server: semua data pengguna tersimpan di IndexedDB browser. Container hanya menyajikan isi `out/` lewat `scripts/build/serve-next.cjs`, lengkap dengan header keamanan (CSP, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, dan HSTS di balik HTTPS), kompresi brotli/gzip, serta cache:

| Path                                   | Cache-Control                                          |
| -------------------------------------- | ------------------------------------------------------ |
| `/_next/static/*` (nama file ber-hash) | `public, max-age=31536000, immutable`                  |
| `/sw.js`                               | `no-cache`                                             |
| Halaman dan aset lain                  | `no-cache` + `ETag` (dijawab `304` bila tidak berubah) |
| Halaman tidak ditemukan                | `404.html`, `no-store`                                 |

## File terkait

- [`Dockerfile`](../../Dockerfile): tahap build (pnpm dari `packageManager`, `pnpm run build`) dan tahap runtime (Node + `out/` + satu file server, user `node`, port 8080).
- [`.dockerignore`](../../.dockerignore): context build hanya berisi yang dibutuhkan `pnpm run build`. `public/` sengaja tidak ikut karena dibuat ulang saat build.
- [`.gcloudignore`](../../.gcloudignore): file yang diunggah oleh `gcloud run deploy --source`. Samakan isinya dengan `.dockerignore`.

## Persiapan (sekali)

1. Pasang [Google Cloud CLI](https://cloud.google.com/sdk/docs/install), lalu login dan pilih project yang billing-nya aktif:

   ```bash
   gcloud auth login
   gcloud config set project PROJECT_ID
   ```

2. Aktifkan API yang dipakai deploy dari source:

   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

## Deploy

Dari root repositori:

```bash
gcloud run deploy kartesian --source . --region asia-southeast2 --allow-unauthenticated --port 8080 --memory 256Mi --cpu 1 --min-instances 0 --max-instances 3
```

- `--source .` mengunggah repositori (difilter `.gcloudignore`), lalu Cloud Build membangun image dari `Dockerfile` dan menyimpannya di Artifact Registry. Pada deploy pertama, gcloud menawarkan membuat repositori `cloud-run-source-deploy`.
- `asia-southeast2` adalah Jakarta. Ganti sesuai lokasi pengguna.
- `--allow-unauthenticated` membuat situs publik. Hapus flag ini bila aksesnya ingin dibatasi dengan IAM.
- `--min-instances 0` membuat layanan turun ke nol saat sepi, sehingga hanya ditagih ketika ada request. Request pertama setelah sepi terkena cold start. Server ini sangat kecil, tetapi bila jeda itu mengganggu, gunakan `--min-instances 1` (ditagih terus-menerus).
- Build butuh akses internet: Corepack mengunduh pnpm, pnpm mengunduh dependensi, dan `next build` memeriksa advisory keamanan versi Next.

Setelah selesai, gcloud menampilkan URL `https://kartesian-….run.app`. Landing page ada di `/`, versi English di `/en/`, dan editor di `/editor/`.

## Uji image secara lokal (opsional, butuh Docker)

```bash
pnpm run docker:build
```

```bash
pnpm run docker:run
```

Lalu buka `http://localhost:8080`.

## Domain sendiri

HTTPS sudah otomatis di URL `run.app`. Untuk domain sendiri:

- [Domain mapping Cloud Run](https://cloud.google.com/run/docs/mapping-custom-domains) adalah cara paling ringkas, tetapi masih preview dan tidak tersedia di semua region.
- Bila region Anda tidak didukung, pakai Firebase Hosting (rewrite ke layanan Cloud Run) atau global external Application Load Balancer dengan serverless NEG.

## Hal yang perlu diperhatikan

- **Data terikat ke origin.** IndexedDB dan localStorage terpisah per domain dan port. Pengguna yang sebelumnya memakai Kartesian di alamat lain tidak akan melihat datanya di URL baru. Minta mereka mengunduh _Backup workspace lengkap_ di alamat lama, lalu memulihkannya di alamat baru.
- **Pembaruan versi.** Setiap deploy menghasilkan service worker baru. Editor yang sedang terbuka menampilkan banner _Versi baru siap_, dan semua tab menyimpan data sebelum beralih.
- **Detector PDF tetap lokal.** CSP hanya mengizinkan koneksi ke `127.0.0.1:8765`, jadi service PyMuPDF/PaddleOCR tetap berjalan di komputer pengguna, dan PDF.js di browser bekerja tanpanya. Men-deploy detector ke Cloud Run berarti PDF meninggalkan perangkat pengguna. Itu mengubah janji privasi di landing page dan butuh perubahan CSP serta CORS.
- **Fitur tanda tangan elektronik.** Fitur yang direncanakan di `docs/proposals/e-signature/` membutuhkan runtime Node. Saat fitur itu dibangun, `output: 'export'` dilepas dan container menjalankan `next start`. Layanan Cloud Run yang sama tetap bisa dipakai.
