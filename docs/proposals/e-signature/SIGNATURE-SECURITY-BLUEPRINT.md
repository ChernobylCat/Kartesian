# Rancangan keamanan tanda tangan dan audit

Tanggal: 29 Oktober 2026. Status: rancangan, belum diimplementasikan.

Rujukan implementasi terkonsolidasi: [Masterplan Tanda Tangan Elektronik](ELECTRONIC-SIGNATURE-MASTERPLAN.md), termasuk integrasi Clerk, perbedaan autentikasi dan consent, tahapan P0–P9, serta acceptance produksi. Keputusan integrasi pada masterplan menjadi acuan bila berbeda dengan opsi awal di blueprint ini.

## Batas saat ini

Kartesian menggunakan Next static export dan IndexedDB. Backup memiliki checksum SHA-256 tanpa secret: ini mendeteksi perubahan byte yang tidak disertai checksum baru, bukan membuktikan keaslian atau identitas pembuat. Penyerang yang mengubah payload dapat menghitung ulang checksum. Gambar tanda tangan dan ID akun yang diketik pengguna juga bukan bukti kriptografis.

Target rancangan: mendeteksi perubahan versi/aset, memverifikasi persetujuan akun, mencegah replay, mempertahankan bukti pencabutan, serta mendeteksi pengubahan atau pemotongan riwayat melalui checkpoint independen. Kompromi seluruh perangkat, layanan, dan pengawas sekaligus tidak diselesaikan oleh hash atau enkripsi semata.

## Arsitektur yang diusulkan

Editor statis tetap dipertahankan. Tambahkan layanan API autentikasi/penandatanganan dengan penyimpanan transaksi dan object storage berversi. Private key layanan berada dalam KMS/HSM, terpisah dari database dan frontend; pilih algoritma yang didukung penyedia saat integrasi. Profil awal yang diusulkan adalah ES256/P-256 untuk seal dan SHA-256 untuk digest. Implementasi menggunakan pustaka/protokol terawat, bukan kriptografi buatan sendiri.

Pisahkan tiga bukti:

1. Aset visual tanda tangan: gambar, posisi, ukuran dan nama tampilan.
2. Persetujuan akun: assertion WebAuthn yang diverifikasi terhadap credential akun dan signing intent tertentu.
3. Seal layanan: signature atas receipt yang mengikat dokumen, persetujuan, nomor audit dan versi kebijakan.

Seal layanan membuktikan pernyataan layanan, bukan otomatis tanda tangan sertifikat pribadi pengguna. Passkey membuktikan kontrol credential akun; identitas orang di balik akun memerlukan proses enrollment tersendiri. Jangan menampilkan label identitas terverifikasi jika proses itu belum dijalankan.

## Alur persetujuan

- Buat snapshot immutable setelah edit aktif selesai dan semua aset tersedia. Simpan revisi monotonik; timestamp bukan nomor urut.
- Susun manifest versi: documentId, revisionId, schemaVersion, isi dokumen, hash byte aset, hash background PDF, hash aset visual tanda tangan, penempatan, format/rendering profile, font beserta versi/hash, serta pengaturan yang memengaruhi output. Sortir daftar manifest secara deterministik tanpa mengubah urutan elemen dokumen yang bermakna.
- Serialisasikan manifest dengan JSON Canonicalization Scheme (RFC 8785), kemudian hitung SHA-256. Validasi input, tolak nilai di luar profil, duplicate JSON keys pada ingestion signing API dan angka non-finite. Jangan mengandalkan urutan key `JSON.stringify()` untuk kontrak lintas implementasi.
- Simpan intent pada server: intentId acak, accountId dari sesi, documentId/revisionId, manifestHash, tujuan persetujuan, peran, versi kebijakan, expiry dan nonce acak minimal 32 byte. Ikat challenge WebAuthn dengan hash canonical intent yang memakai label domain `Kartesian/signing-intent/v1` dan framing yang tidak ambigu.
- Preview harus memuat versi yang sama. Ubah isi/penempatan/aset setelah intent dibuat berarti intent lama tidak berlaku; minta persetujuan untuk revisi baru. Ini tidak dapat menjamin preview jujur pada perangkat yang telah dikompromikan.
- Minta user verification melalui WebAuthn. Server memverifikasi signature assertion, credential ownership, challenge, origin yang diizinkan, rpIdHash, type, user presence dan user verification. Kebijakan counter harus memperhitungkan synced passkeys; counter tidak boleh menjadi satu-satunya deteksi replay.
- Konsumsi intent sekali dalam transaksi yang sama dengan pemeriksaan revisi/izin, pencatatan consent dan append audit. Gunakan compare-and-swap/row lock; retry memakai idempotency key dan menghasilkan receipt yang sama. Expired/replayed/different-document assertions ditolak.
- Setelah transaksi commit, signing service menerbitkan receipt bertanda tangan yang mengikat manifestHash dan audit event. Gunakan transactional outbox untuk retry seal/checkpoint; status masih pending sampai seal tersedia, bukan langsung sukses ketika job dijadwalkan.

## Bentuk receipt dan verifier

Receipt memuat protocolVersion, intentId, documentId, revisionId, manifestHash, consentEvidenceHash, account/credential reference, role, policyVersion, serverReceivedAt, auditStreamId, sequence, eventHash, keyId dan algoritma yang diizinkan. Gunakan format signature envelope standar dan encoding yang ditentukan; jangan menggabungkan string JSON dengan signature secara ad hoc.

Verifier memvalidasi schema dan allowlist algoritma, keyId terhadap trust anchor yang diperoleh melalui kanal tepercaya, signature, hash seluruh aset dan manifest, ikatan consent, urutan audit dan status pencabutan. Public key yang hanya disertakan di file tidak cukup: penyerang dapat mengganti isi, kunci dan signature sekaligus.

Hasil verifikasi harus membedakan: valid untuk revisi tersebut, isi berubah, signature invalid, key tidak dipercaya, dicabut, bukti tidak lengkap, atau status terbaru tidak dapat diperiksa. Receipt lama yang valid tidak otomatis membuktikan dokumen belum dicabut sekarang.

Export browser-print tidak otomatis menghasilkan PDF bertanda tangan. Receipt atas manifest dan hash byte PDF final adalah dua objek berbeda. Untuk memverifikasi file PDF final, tangkap/generasikan byte final yang sebenarnya lalu ikat digest-nya pada receipt artifact. PDF signature tertanam/PAdES memerlukan pipeline khusus terpisah; jangan mengklaimnya dari gambar/QR atau receipt JSON.

## Audit yang tahan manipulasi

- Stream audit per dokumen memakai sequence dari database, eventId unik, actor dari sesi tepercaya, aksi, revisi, reason, policyVersion, serverReceivedAt dan prevEventHash.
- Hash event dengan canonical encoding dan domain `Kartesian/audit-event/v1`, tanpa memasukkan eventHash/signature sendiri. Hash-chain mendeteksi perubahan terhadap chain yang anchor-nya sudah dipercaya; chain lokal dapat dibuat ulang atau dipotong tanpa anchor eksternal.
- App role hanya boleh append melalui transaksi terkontrol; izin update/delete tidak diberikan. Ini kontrol akses, bukan jaminan kebal administrator database.
- Segel checkpoint `(streamId, lastSequence, lastEventHash)` secara berkala dan simpan salinan pada penyimpanan retensi serta pengawas terpisah. Bandingkan checkpoint untuk mendeteksi rollback/fork. Pola transparency/Merkle dapat dikembangkan kemudian; jangan mengklaim kepatuhan Certificate Transparency hanya karena memakai hash tree.
- Pencabutan, perubahan izin dan rotasi credential/key menjadi event baru. Bukti lama dipertahankan; koreksi tidak mengedit event historis.
- Waktu server dibedakan dari waktu perangkat dan timestamp tepercaya independen. Tambahkan timestamp authority jika diperlukan untuk pembuktian waktu di luar kontrol layanan.
- Event cetak adalah `PRINT_REQUESTED`; aplikasi tidak mengetahui apakah printer menghasilkan kertas.

## Syarat akun penandatangan dan kebijakan produksi

Persyaratan pengguna: fitur tanda tangan elektronik hanya tersedia untuk pemilik akun Gmail atau Outlook yang terverifikasi. Login saja belum memberi izin menandatangani. Editor dokumen tetap dapat digunakan sesuai kebijakan workspace; pembatasan ini berlaku pada akses penandatanganan dan seluruh endpoint terkait.

### Identitas provider dan verifikasi mailbox

- Gunakan login resmi Google/Microsoft melalui OIDC authorization-code flow dengan PKCE, state dan nonce. Server memverifikasi issuer, audience, signature, expiry dan ikatan sesi; domain email yang diketik di form bukan bukti login provider.
- Default allowlist alamat penandatangan adalah domain tepat `gmail.com` dan `outlook.com`, dinormalisasi case domain. Bukan substring atau suffix longgar: `gmail.com.example.org` ditolak. Domain Google Workspace, Microsoft organisasi, Hotmail, Live dan domain lain tidak otomatis diperbolehkan; perlu keputusan kebijakan terpisah.
- Google: wajib claim `email_verified` yang valid dan alamat Gmail pada token yang sudah diverifikasi. Identitas internal memakai `(issuer, sub)`, bukan alamat email.
- Microsoft: gunakan akun Microsoft personal untuk kebijakan Outlook personal. Jangan menganggap `email` atau `preferred_username` sebagai identifier immutable atau klaim verifikasi mailbox. Identitas memakai `(issuer, sub)`; tenant/object references disimpan jika relevan. Alamat Outlook harus dikonfirmasi lewat challenge email aplikasi yang sekali pakai, kedaluwarsa dan dibatasi percobaannya, lalu diikat ke akun provider tersebut. Challenge ini membuktikan kontrol mailbox, bukan identitas orang.
- Simpan providerSubject, providerIssuer, email terverifikasi, metode/waktu verifikasi dan versi kebijakan. Perubahan email/binding provider membutuhkan reauthentication dan verifikasi ulang serta membatalkan intent lama.
- Jangan menggabungkan akun Google dan Microsoft hanya karena email sama. Account linking memerlukan bukti kontrol kedua akun dan step-up authentication.

### Mengurangi akun dummy/testing

Email terverifikasi dan passkey tidak menyediakan bukti universal bahwa akun dibuat untuk penggunaan nyata. Tidak ada klaim OIDC yang boleh diasumsikan sebagai `not_dummy`. Nama alamat yang memuat kata test/dummy bukan dasar tunggal untuk menolak atau menerima pengguna.

Kebijakan produksi default:

1. Akun baru berstatus `pending_review`; signing API menolak sampai status `active_signer` diberikan melalui undangan dan persetujuan petugas yang berwenang setelah pemeriksaan identitas/peran sesuai kebijakan organisasi.
2. Aktivasi memerlukan provider yang diizinkan, mailbox terverifikasi, passkey terdaftar, identitas/peran disetujui dan accountPurpose `production`. Nilai status/purpose ditetapkan server, bukan form atau token dari browser.
3. Akun `test`, `demo`, `automation`, suspended, revoked dan akun yang belum disetujui tidak mendapat hak tanda tangan produksi. Pemeriksaan dilakukan lagi ketika intent dibuat, consent diterima dan receipt diterbitkan; status lama pada sesi/token tidak cukup.
4. Admin tidak menyetujui akunnya sendiri. Aktivasi, perubahan role, penolakan dan pencabutan menghasilkan event audit, disertai pihak pemberi keputusan dan alasan. Akses sensitif menggunakan pemisahan peran serta prosedur pengecualian yang diaudit.
5. Rate limit pendaftaran, challenge dan signing; anomali/bot signal memicu pemeriksaan tambahan. Cooldown sejak pendaftaran aplikasi hanya kontrol tambahan, bukan bukti umur atau keaslian akun Google/Microsoft.

Untuk pengguna publik tanpa petugas/organisasi yang dapat melakukan pemeriksaan, jangan mengklaim dummy sudah tersaring. Tetapkan proses verifikasi identitas yang dapat dipertanggungjawabkan sebelum memberikan status active_signer. Login provider bukan pengganti proses itu.

### Pemisahan produksi dari pengujian

- Pisahkan origin/RP ID, OAuth app/client credentials, database, bucket, key KMS, callback URL dan audit stream antara development, staging dan production. Jangan mengandalkan nama email saja.
- Mock OAuth, bypass login, seeded demo users, test signing key dan test issuer tidak didistribusikan/diaktifkan dalam konfigurasi produksi. Startup/deployment gate gagal jika konfigurasi kepercayaan produksi tidak lengkap atau mengarah ke resource pengujian.
- Receipt memuat environment dan policyVersion di dalam payload yang ditandatangani. Verifier produksi hanya mempercayai issuer/key produksi yang dikonfigurasi; receipt staging ditolak walaupun signature-nya valid dengan key staging.
- Verifikasi server tidak memiliki fallback ke checksum lokal, akun anonim, email OTP saja atau mode dummy saat provider/KMS tidak tersedia. Operasi tetap pending atau ditolak.
- Jangan menggunakan Gmail API atau Microsoft Graph mailbox-read permission hanya untuk login. Scope dibuat minimum; pengiriman challenge email tidak memerlukan akses membaca inbox pengguna.

### Acceptance tambahan

Uji token palsu/expired/wrong-audience, akun provider dengan domain lain, domain mirip Gmail/Outlook, mailbox belum terverifikasi, binding email berubah, account-linking tanpa reauthentication, akun pending/test/revoked, admin self-approval, test credentials pada deployment produksi, receipt staging, serta penonaktifan akun di antara pembuatan intent dan penerbitan receipt. Semuanya harus ditolak server tanpa menghasilkan seal produksi yang dapat dipercaya.

## Kunci, enkripsi dan akses

- Pisahkan kunci seal, kunci enkripsi dan credential pengguna. Tidak ada private signing key layanan dalam JS bundle, localStorage, env publik atau backup workspace.
- Enkripsi aset sensitif dengan envelope encryption: AES-256-GCM, nonce unik per enkripsi untuk kunci yang sama, AAD mengikat tenant/document/revision/asset dan versi format. Kunci data dibungkus KMS; private data tidak ditulis ke log.
- Sesi menggunakan cookie Secure/HttpOnly, kebijakan SameSite yang sesuai deployment, CSRF protection dan authorization untuk setiap objek. Pisahkan tenant; URL/ID yang sulit ditebak bukan izin akses.
- Challenge dan rate limit berlaku pada enrollment, consent, recovery dan revocation. Pemulihan akun tidak memulihkan atau menyamar sebagai credential lama; daftarkan credential pengganti, cabut yang hilang dan catat peristiwanya.
- Rotasi key mempertahankan public key dan riwayat periode/pencabutan. Kompromi key memerlukan evaluasi dampak terhadap receipt lama; waktu pada receipt saja tidak membuktikan receipt diterbitkan sebelum kompromi.
- Kunci browser non-extractable bukan perlindungan terhadap XSS yang masih dapat memanggil operasi crypto. Perkuat CSP, rendering aman, dependency review dan isolasi origin penandatanganan. Hardware/synced/device-bound credential ditentukan oleh kebijakan, bukan diasumsikan dari kata passkey.
- QR hanya membawa reference opaque/tautan verifier, bukan data pribadi atau private token yang memberi hak menandatangani. Verifier publik menampilkan informasi minimum dan memiliki rate limit.

## Offline dan tahapan implementasi

Offline boleh membuat draft, gambar tanda tangan dan consent lokal yang berstatus pending. Jangan menampilkan seal layanan, waktu server atau status verified sebelum API mengonfirmasi. IndexedDB dan waktu perangkat bukan sumber audit independen.

1. Threat model, schema manifest/receipt dan verifier beserta test vectors. Ini dapat dibuat tanpa provisioning produksi.
2. Layanan autentikasi, WebAuthn, intent sekali pakai dan transaksi consent/audit; tetapkan enrollment dan recovery policy.
3. Integrasi KMS, seal, outbox, encryption dan checkpoint eksternal; uji kegagalan parsial dan rotasi key.
4. UI status yang membedakan pending/verified/revoked/unknown, verifier artifact, backup evidence dan pengujian penetrasi terarah sebelum produksi.

## Acceptance keamanan

Wajib diuji: perubahan satu byte manifest/aset; penyisipan signature image; replay assertion; origin/RP ID salah; credential akun lain; akses tenant lain; intent expired; double-submit bersamaan; edit setelah preview; retry tanpa event ganda; crash sebelum/sesudah commit; seal job gagal; audit fork/truncation; checkpoint rollback; public key palsu dari artifact; nonce reuse ditolak oleh desain storage; key rotation/revocation; offline tanpa status palsu; dan penghapusan aset lokal tanpa menghapus bukti server. Gunakan test vector canonicalization lintas runtime. Security review independen tetap diperlukan sebelum menjadikan desain ini jaminan produksi.

## Referensi primer

- [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/): ceremony, challenge dan validasi relying party.
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html): canonical JSON untuk operasi hash/signature.
- [W3C Web Cryptography](https://www.w3.org/TR/webcrypto/): primitive signature, hashing dan authenticated encryption.
- [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html): rujukan konsep transparency/checkpoint dan bukti konsistensi; bukan spesifikasi langsung untuk audit dokumen Kartesian.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): validasi token, email_verified dan identifier sub.
- [Microsoft ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference): batas penggunaan email/preferred_username dan identifier akun.

Dokumen ini menambahkan rancangan, bukan fitur keamanan aktif. Belum ada signature service, enrollment, kunci KMS, atau audit server yang dipasang pada aplikasi.
