# Instruksi menyiapkan layanan tanda tangan Kartesian

Tanggal: 29 Oktober 2026. Panduan ini disiapkan karena layanan eksternal belum tersedia. Jangan mengirim secret melalui chat atau menyimpannya dalam Git. Penyiapan resource dapat menimbulkan biaya; pemilik akun membuat dan menyetujui resource pada dashboard penyedia masing-masing.

## Status eksekusi dan batas saat ini

Masterplan tetap menjadi target: [Electronic Signature Masterplan](ELECTRONIC-SIGNATURE-MASTERPLAN.md). Konfigurasi eksternal merupakan prasyarat exit gate P0 dan integrasi P1–P8, bukan alasan mengaktifkan mock di produksi.

Yang tersedia saat ini: editor existing, masterplan/security blueprint, template konfigurasi staging/production, dan preflight konfigurasi offline dengan regression test. Belum tersedia: aplikasi signing runtime, autentikasi Clerk terintegrasi, enrollment nyata, renderer artifact server, transaksi consent PostgreSQL, KMS seal worker, audit witness atau verifier produksi. P9 multi-signer juga belum diimplementasikan. Tidak ada penandatanganan yang dapat diaktifkan lewat template ini.

## Pilihan infrastruktur acuan

Untuk membuat langkah konfigurasi konkret, panduan memakai Clerk, Google/Microsoft OAuth, PostgreSQL terkelola, AWS S3, AWS KMS dan layanan email transaksional. Hosting signing adalah Node.js 24 yang dapat menjalankan Next runtime dan proses worker terpisah. Penyedia PostgreSQL/hosting/email boleh dipilih kemudian; tidak perlu membeli semua layanan sebelum spike autentikasi berhasil.

AWS hanya acuan adapter, bukan resource yang sudah dibuat. Jika memilih Azure/GCP, tentukan adapter ekuivalen sebelum memakai template AWS. Jangan memasukkan key dari penyedia lain ke variabel ARN.

| Komponen        | Disiapkan oleh pemilik akun                          | Bukti selesai tanpa secret                                   |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Domain/DNS      | Editor origin, signing origin dan trust origin HTTPS | Hostname dan status sertifikat                               |
| Clerk           | Instance/app terpisah staging dan production         | Instance ID, mode akses, provider aktif                      |
| Google OAuth    | OAuth app/client terpisah per environment            | Client ID dan redirect URI; bukan client secret              |
| Microsoft OAuth | App registration per environment                     | Application ID, supported types, redirect URI                |
| PostgreSQL      | DB/role terpisah per environment                     | Provider, region, versi, TLS dan backup policy               |
| Object storage  | Bucket assets/evidence/witness                       | Nama bucket, account, versioning, retention policy           |
| KMS             | Seal key dan encryption key terpisah                 | Key ARN, spec, usage dan public key fingerprint              |
| Runtime         | Signing app serta worker                             | Penyedia, domain, identity/role runtime                      |
| Email           | Verified sender domain                               | Domain, alamat pengirim dan status DNS                       |
| Approval        | Petugas pemeriksa dan pemberi approval               | Role dan prosedur bootstrap; bukan dokumen identitas pribadi |

Mulai staging. Untuk staging yang realistis, Clerk dapat memakai instance bertipe Production yang khusus staging; instance ini tetap terpisah dari instance produksi sebenarnya. Prefix `pk_live_` tidak membuktikan sebuah deployment adalah produksi. Environment, instance identity, hostname dan semua resource harus dipetakan bersama.

## Langkah 1 — Domain dan environment

1. Pilih domain yang Anda kuasai. Contoh penamaan saja: editor `app.DOMAIN_ANDA`, signing `sign.DOMAIN_ANDA`, staging `sign.staging.DOMAIN_ANDA`, trust `trust.DOMAIN_ANDA`. Jangan memakai domain example pada konfigurasi nyata.
2. Sediakan DNS dan HTTPS valid untuk setiap origin. Final redirect URLs mengikuti nilai yang diberikan dashboard Clerk, jangan menebak callback path.
3. Tetapkan RP ID sama dengan hostname signing yang dipilih. Pilih hostname stabil sebelum mendaftarkan passkey; pindah RP ID bukan sekadar mengganti URL login.
4. Buat tabel inventaris environment: domain, Clerk instance ID, OAuth client IDs, DB, buckets, seal/encryption key IDs, witness account dan release owner. Staging/production tidak memakai resource yang sama.

## Langkah 2 — Clerk

1. Buat Clerk account/project. Siapkan aplikasi/instance staging dan production yang terisolasi. Untuk awal cukup staging; periksa ketersediaan fitur/paket pada dashboard tanpa menganggap fitur development gratis tersedia di produksi.
2. Konfigurasikan domain dan DNS sesuai [deployment Clerk](https://clerk.com/docs/guides/development/deployment/production). Selesaikan verifikasi DNS/sertifikat sampai dashboard menyatakan domain siap.
3. Aktifkan Google dan Microsoft saja sebagai social provider untuk jalur enrollment penandatangan. Konfigurasikan credentials sendiri untuk instance bertipe production.
4. Set access mode invite-only. Allowlist Clerk tidak berlaku bersama invite-only/waitlist; pembatasan tepat `gmail.com`/`outlook.com` tetap wajib pada backend Kartesian. Invite bukan approval menandatangani.
5. Simpan publishable key, secret key dan webhook signing secret pada secret manager/deployment secret store. Hanya publishable key boleh masuk konfigurasi publik frontend. Jangan menyalin secret Google/Microsoft ke editor.
6. Inventarisasi event lifecycle user/session/external-account yang didukung instance untuk webhook. Endpoint webhook belum tersedia di repo; konfigurasikan URL setelah runtime dibuat. Gunakan signing secret webhook dan uji signature invalid, redelivery, serta reconciliation.
7. Jangan memberikan hak active_signer lewat public/user-editable metadata. Approval, role, purpose production dan provider binding dimiliki backend signing.

Referensi: [access modes](https://clerk.com/docs/guides/secure/restricting-access), [instances](https://clerk.com/docs/guides/development/managing-environments), [account linking](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking).

### Google

1. Buat proyek Google Cloud untuk environment yang bersangkutan dan konfigurasi OAuth consent screen dengan nama aplikasi, kontak, domain serta kebijakan privasi yang benar.
2. Buat OAuth client web. Salin authorized redirect URI persis dari koneksi Google Clerk. Tambahkan origin yang memang diminta konfigurasi provider, tanpa wildcard/local origin pada produksi.
3. Masukkan client ID/secret ke koneksi Google pada dashboard Clerk. Simpan secret dalam vault; jangan commit file JSON credentials yang diunduh.
4. Gunakan test users hanya untuk pengujian non-production. Untuk produksi, selesaikan publishing/verification yang diminta Google dan pastikan status consent app sesuai produksi. Jangan memakai app OAuth Testing untuk pengguna produksi.
5. Pada spike, login dengan Gmail asli dan buktikan server memperoleh verified mailbox serta binding provider yang benar. Uji akun Google non-Gmail: harus ditolak untuk menjadi penandatangan walaupun login berhasil.

[Panduan Google Clerk](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google).

### Microsoft/Outlook

1. Buat Microsoft Entra app registration untuk environment yang bersangkutan. Ikuti supported account types yang didukung koneksi Clerk saat integrasi, serta redirect URI persis dari dashboard Clerk.
2. Buat client secret dengan expiry yang dicatat. Simpan nilainya di koneksi Clerk/vault; application ID dan secret ID bukan client secret value. Tetapkan owner dan prosedur rotasi sebelum expiry.
3. Ikuti petunjuk keamanan Microsoft/nOAuth di dokumentasi Clerk. Review optional claims dengan tenant administrator; jangan mengubah manifest hanya berdasarkan contoh tanpa memeriksa dokumentasi yang berlaku.
4. Clerk Microsoft saat dokumentasi diperiksa hanya mendukung audience `common`. Login dengan akun organisasi dapat berhasil; jangan menganggap semua login Microsoft adalah Outlook personal.
5. Spike wajib membuktikan akun personal, alamat Outlook yang telah diverifikasi, dan binding provider dari data server tepercaya. Uji akun kerja/sekolah, alamat lain, email yang berubah, serta automatic linking. Jika proof tidak cukup, enrollment tetap pending dan tambahkan proof Microsoft langsung pada fase implementasi. Jangan memalsukan flag personal/verified.

[Panduan Microsoft Clerk](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/microsoft).

### Passkey dan persetujuan

Aktifkan fitur autentikasi/step-up Clerk yang tersedia dan uji di staging. Ini belum menyediakan consent dokumen. Credential WebAuthn khusus signing akan didaftarkan pada signing origin saat backend tersedia. Reverification tidak otomatis menerima arbitrary document challenge. Uji pula graceful downgrade; faktor yang lebih lemah tidak boleh membuka akses signing. Bukti P0 harus memisahkan keberhasilan login dari keberhasilan consent terikat revisi.

[Clerk reverification](https://clerk.com/docs/guides/secure/reverification), [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server).

## Langkah 3 — PostgreSQL

1. Pilih PostgreSQL terkelola di region yang sesuai kebutuhan data. Buat staging database terlebih dahulu, dengan backup dan pemulihan point-in-time sesuai kemampuan penyedia.
2. Buat database terpisah untuk produksi. Bedakan role migrator, app, worker dan audit reader. App tidak menjadi owner database/superuser.
3. Wajibkan TLS dengan verifikasi hostname/CA. Template memakai `sslmode=verify-full`; runtime harus menerima CA penyedia dan tidak boleh memakai `rejectUnauthorized:false` atau sslmode disable. Jangan membuka database ke seluruh internet bila deployment dapat memakai private network/allowlist.
4. Simpan connection string di secret manager. Untuk transaksi row-lock/idempotency, pilih koneksi/pool yang sesuai dan uji transaksi sesungguhnya; URL valid saja bukan bukti transaksi benar.
5. Migrations dan grants signing belum tersedia. Jangan membuat tabel dummy lalu menganggap schema telah diimplementasikan. Implementasi P1 akan menambahkan versioned SQL migration, unique constraints dan audit append permissions.
6. Uji restore ke database baru dan rekam hasilnya sebelum produksi. Tentukan RPO/RTO bersama pemilik produk; nilai tersebut belum diputuskan otomatis.

## Langkah 4 — Object storage dan witness

1. Buat bucket assets dan evidence yang terpisah untuk staging; kemudian resource lain untuk produksi. Aktifkan block-public-access, versioning, TLS-only policy serta encryption.
2. Runtime memakai identity/role dengan least privilege. Pengunggahan memakai key object opaque per tenant/revision; tidak menimpa artifact final. Preview/download yang sah memakai URL singkat dan authorization pada backend.
3. Bucket evidence memerlukan retention sesuai kebijakan yang disepakati. S3 Object Lock bekerja bersama versioning. Mulai eksperimen staging dengan retention singkat yang telah dipahami; jangan menetapkan compliance retention panjang sembarangan karena penghapusan tidak bebas dilakukan selama masa retensi.
4. Witness/checkpoint ditempatkan pada account yang berbeda dan dioperasikan oleh pihak/role terpisah. App/worker utama tidak mendapat izin menghapus atau menulis ulang anchor lama. Kehadiran bucket ketiga di account yang sama bukan bukti pengawasan independen.
5. Catat bucket/account/region/versioning/retention dan IAM policy. Uji bahwa principal aplikasi gagal menghapus evidence yang dilindungi, sementara pengawas dapat membaca checkpoint yang diperlukan.

[S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html). Bukti konfigurasi retention/witness merupakan prasyarat P6; hanya mengisi variabel bucket belum memenuhi gate.

## Langkah 5 — KMS

1. Buat asymmetric seal key dengan key spec `ECC_NIST_P256`, usage `SIGN_VERIFY`, untuk profil awal ES256. Jangan membuat key enkripsi simetris lalu mencoba memakainya untuk menandatangani.
2. Buat symmetric encryption key terpisah untuk envelope encryption data. Catat kedua key ARN. Jangan mengimpor private signing key ke file aplikasi atau menaruhnya dalam environment variable.
3. Bedakan administrator key dari principal worker penandatangan. Worker hanya memperoleh operasi signing yang dibutuhkan pada seal key dan operasi wrapping yang dibutuhkan pada encryption key. Verifier menggunakan public key tepercaya, tidak membutuhkan private key.
4. Distribusikan public key/fingerprint lewat trust channel yang terkontrol. KeyId pada receipt di-resolve hanya ke trust bundle yang diizinkan, bukan URL arbitrary dari file pengguna.
5. Implementasi adapter akan menguji `ECDSA_SHA_256`, pilihan RAW/DIGEST dan konversi DER/P1363 terhadap JWS test vectors. Jangan memilih MessageType dengan coba-coba atau menghitung hash dua kali.
6. Tetapkan rotasi/revocation/compromise procedure dan simpan riwayat key trust. Jangan menonaktifkan key lama sebelum memahami kebutuhan dekripsi/validasi evidence; jangan menjadwalkan deletion sebagai bagian setup biasa.

[AWS KMS key specifications](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html). Hak sign harus diuji dengan workload identity yang sebenarnya; prefix ARN tidak membuktikan key spec/permissions.

## Langkah 6 — Hosting, email dan secret

1. Sediakan hosting Node.js 24 untuk Next runtime signing, proses worker terpisah serta renderer PDF yang terisolasi. Root editor masih static export; `pnpm run build` yang sekarang tidak membangun signing service yang belum dibuat.
2. Gunakan workload identity/role untuk akses cloud bila tersedia. Hindari access key IAM jangka panjang. Frontend tidak pernah menerima DB URL, Clerk secret, KMS private key atau credential storage.
3. Konfigurasikan domain email transaksional bila diperlukan untuk undangan/challenge. Verifikasi DNS SPF/DKIM/DMARC dan pengiriman; gunakan scope pengiriman minimum, bukan akses membaca inbox Gmail/Outlook pengguna.
4. Buat sender staging yang terpisah. Perhatikan sandbox/recipient restrictions penyedia email ketika menguji; email tidak terkirim tidak boleh dianggap mailbox verified.
5. Pisahkan secret store staging/production. Hanya pihak deployment berwenang dapat melihat/mengubah secret; log dan error preflight tidak boleh mencetak nilainya.

## Langkah 7 — Isi template dan preflight lokal

Template kosong yang aman untuk Git:

- `infra/signing/staging.env.example`
- `infra/signing/production.env.example`

Gunakan Node 24. Pada PowerShell dari root repo:

```powershell
Copy-Item infra/signing/staging.env.example infra/signing/staging.env.local
# Isi file .local menggunakan editor lokal/vault; jangan menempel secret di terminal/chat.
node --env-file=infra/signing/staging.env.local scripts/tools/check-signing-config.cjs
pnpm run test:signing
```

Untuk produksi, salin template produksi ke `production.env.local` dan gunakan path file itu. `.env*` serta `*.env.local` dilindungi `.gitignore` (template `.env.example` tetap dapat dilacak). Jangan menyalin export secret manager ke file berextension lain dalam repository.

Preflight hanya memeriksa field wajib dan kebijakan sintaks dasar: HTTPS/origin/RP ID, live-type Clerk keys, TLS PostgreSQL, key ARN/region yang terpisah, buckets, witness account yang berbeda, domain penandatangan tepat dan invite-only. Tidak melakukan network request, login, pemeriksaan IAM, verifikasi key spec atau pengecekan biaya. Kredensial palsu dengan prefix yang benar masih dapat lolos sintaks; ini bukan health check atau persetujuan produksi.

`SIGNING_ENABLED` wajib `false`. Script selalu mengembalikan `productionReady: false`. Nilai tersebut bukan konfigurasi yang bisa dibuka dengan flag; runtime dan gate produksi harus diimplementasikan dahulu.

## Langkah 8 — Bukti yang diperlukan untuk melanjutkan

Kirim informasi non-secret berikut setelah staging siap:

```text
Signing origin / editor origin / RP ID:
Clerk instance ID dan access mode:
Google dan Microsoft Application/Client IDs (tanpa secret):
Hasil login Gmail / Outlook personal / akun organisasi yang harus ditolak:
Provider dan region PostgreSQL; status TLS/backup:
AWS region; seal key ARN/spec/usage; encryption key ARN:
Nama bucket assets/evidence; witness account/bucket:
Mode retention yang disetujui:
Hosting Node/worker; metode workload identity:
Alamat pengirim dan status verifikasi email:
Petugas approval dan prosedur bootstrap:
```

Jangan kirim connection string, client secret, secret Clerk, session cookie, assertion privat, dokumen identitas pribadi atau gambar tanda tangan. Untuk pengujian integrasi, credentials dipasang langsung oleh pemilik pada secret store/local environment yang telah disetujui; tidak disalin ke percakapan.

## Urutan pengerjaan agar efisien

1. Siapkan domain + Clerk staging + OAuth, lalu jalankan spike P0. Jika identitas/provider binding tidak memenuhi syarat, perbaiki desain enrollment sebelum menambah biaya layanan lain.
2. Sambil itu, kontrak/schema dan test vectors dapat diimplementasikan lokal; bukan implementasi signature production.
3. Setelah PoC memenuhi gate, siapkan PostgreSQL/storage/KMS staging dan lanjut P1–P7.
4. Jalankan integration/E2E asli, witness/restore drill serta security review untuk P8.
5. Resource produksi dibuat terpisah setelah staging berhasil. P9 multi-signer mengikuti V1 stabil.

Belum ada akun eksternal, resource berbayar, dependency signing, atau layanan produksi yang dibuat oleh panduan ini. Status masterplan dicatat di [execution status](SIGNING-EXECUTION-STATUS.md), bukan disimpulkan dari jumlah file yang sudah dibuat.
