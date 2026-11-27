# Masterplan tanda tangan elektronik Kartesian

Tanggal konsolidasi: 29 Oktober 2026. Status: siap menjadi panduan implementasi; integrasi belum dipasang dan layanan belum diprovisikan.

Eksekusi dimulai pada 29 Oktober 2026. Pengguna mengonfirmasi layanan eksternal belum tersedia dan meminta panduan setup. Lihat [instructions provisioning](SIGNING-INFRASTRUCTURE-SETUP.md) dan [status aktual per fase](SIGNING-EXECUTION-STATUS.md). Template/preflight bukan penyelesaian P0–P9.

Dokumen ini menjadi rujukan utama untuk tanda tangan, identitas akun, Clerk, kriptografi, audit dan rollout. [Security blueprint](SIGNATURE-SECURITY-BLUEPRINT.md) tetap menjadi penjelasan ancaman dan primitive. Jika ada perbedaan rancangan integrasi Clerk, keputusan pada masterplan ini yang dipakai. Hasil audit/refactor aplikasi existing tetap tercatat terpisah.

## 1. Tujuan dan batas jaminan

Bangun alur penandatanganan yang mengikat persetujuan akun pada versi dokumen dan aset tertentu, menghasilkan receipt kriptografis, serta menyediakan audit yang dapat diperiksa. Fitur hanya boleh digunakan penandatangan produksi yang telah lolos verifikasi dan persetujuan petugas.

Pisahkan bukti berikut di UI maupun model:

| Bukti                    | Makna                                                                      |
| ------------------------ | -------------------------------------------------------------------------- |
| Gambar/hasil goresan     | Aset visual; bukan bukti identitas atau persetujuan                        |
| Login Clerk              | Sesi pengguna yang diautentikasi; belum berhak menandatangani              |
| Enrollment penandatangan | Provider/mailbox memenuhi syarat dan identitas/peran telah diperiksa       |
| Consent terikat revisi   | Persetujuan eksplisit akun untuk manifest dan artifact tertentu            |
| Seal layanan             | Signature layanan atas receipt; bukan otomatis sertifikat pribadi pengguna |
| Checkpoint independen    | Anchor untuk mendeteksi rollback/fork/pemotongan audit                     |

Checksum backup existing tidak berubah menjadi signature hanya karena memakai SHA-256. Login Gmail/Outlook tidak membuktikan akun bukan dummy. Perangkat/browser yang telah dikompromikan dapat menampilkan preview palsu. Tidak ada klaim kepatuhan hukum, PAdES, atau sertifikasi dari fitur ini tanpa pekerjaan dan evaluasi terpisah.

## 2. Keputusan arsitektur

Pertahankan editor Next.js statis, IndexedDB, PDF.js, F4, undo/redo dan alur offline. Tambahkan aplikasi signing online terpisah dengan Next.js App Router runtime, Clerk SDK server, PostgreSQL, worker outbox, object storage privat berversi dan KMS/HSM. Signing app dan API dapat satu deployment; worker adalah proses terpisah dengan deployment/versioning dalam proyek yang sama. Tidak perlu memecah menjadi banyak microservice.

Target repository setelah fase foundation:

```text
src/                              Editor existing; tetap static export
packages/signing-contracts/        Schema manifest, receipt, status dan test vectors
packages/signing-domain/           Intent, eligibility, consent, audit dan policy
apps/signing/                     Next runtime: Clerk, portal, API, verifier
workers/signing/                  Seal, checkpoint, rendering dan delivery outbox
infra/                           Schema DB, deployment dan policy KMS/storage
tests/signing/                   Unit, integration, E2E, security dan recovery
```

Jangan memindahkan seluruh source existing hanya untuk memenuhi struktur baru. Pakai workspace packaging saat paket backend pertama ditambahkan; lockfile tetap satu dan versi SDK dipin setelah spike. Dependency provider berada di adapter, bukan domain.

Origin editor dan signing portal dipisahkan. RP ID WebAuthn stabil mengikuti signing origin. Editor mengirim snapshot hanya setelah pengguna memilih “Siapkan untuk ditandatangani”; tidak otomatis mengunggah seluruh IndexedDB. Snapshot transfer memakai authorization ke objek dan token sekali pakai yang singkat, bukan URL yang membawa secret di query string. PostMessage, jika digunakan, memeriksa origin/source dan schema secara tepat. Tidak menerima actorId/tenantId dari payload sebagai sumber hak akses.

Untuk V1, backend merender artifact PDF final dari snapshot tervalidasi menggunakan template dan font yang dipin. Preview penandatangan menampilkan artifact yang sama. PDF.js pada editor tetap untuk panduan; browser Print bukan jalur artifact yang disegel. Rendering berjalan terisolasi, tanpa network eksternal atau akses file bebas.

## 3. Pembagian tanggung jawab Clerk

Clerk dipilih sebagai lapisan login, sesi dan lifecycle akun. Signing service memverifikasi sesi dan authorized party/audience sesuai SDK/deployment sebelum memeriksa eligibility pada database sendiri. SDK/client tidak pernah menjadi satu-satunya pengaman endpoint.

| Clerk                                          | Kartesian                                                       |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Google/Microsoft social login dan sesi         | Kelayakan Gmail/Outlook, approval identitas/peran dan tenant    |
| UI akun dan mekanisme verifikasi yang tersedia | Binding provider yang memenuhi syarat ke signer profile         |
| Reverification untuk aksi sensitif             | Intent sekali pakai dan consent atas revisi tertentu            |
| Invite-only/waitlist                           | Status active_signer dan larangan self-approval                 |
| Lifecycle notification/webhook                 | Revocation, signature receipt, audit, KMS dan artifact verifier |

Default portal signing: invite-only. Domain allowlist aplikasi diterapkan di backend, karena allowlist Clerk tidak berlaku bersama invite-only/waitlist. Fitur allowlist Clerk produksi membutuhkan paket berbayar jika dipilih sebagai mode lain; jangan menganggap semua fitur development otomatis tersedia gratis saat produksi.

Clerk dapat melakukan automatic account linking berdasarkan verified email. Ini berbeda dari blueprint yang menghendaki binding identitas eksplisit. Karena itu, perubahan external accounts tidak boleh otomatis memindahkan approval, credential signing atau hak active_signer. Simpan binding provider tersendiri, minta proof ulang untuk perubahan binding dan uji jalur linking/unlinking sebelum release. Jika data/proof yang tersedia dari Clerk tidak cukup, gunakan enrollment proof provider tambahan; jangan menebak identitas dari primary email.

### Persetujuan berbasis passkey

Default rancangan: Clerk mengurus login; signing origin mengelola credential WebAuthn khusus consent, terikat ke accountId internal. Enrollment credential wajib sesi Clerk yang valid, step-up yang memenuhi kebijakan, dan binding signer yang sah. Recovery credential diaudit serta membatalkan intent yang belum selesai.

Alasannya: reverification Clerk adalah autentikasi ulang sesi. Jangan mengasumsikan hasilnya menyediakan assertion dengan challenge arbitrary yang dapat mengikat manifest. Jika spike membuktikan API Clerk mendukung seluruh bukti terikat intent yang dibutuhkan, adapter dapat diganti untuk menghindari enrollment ganda. Sampai terbukti, credential consent tidak disamakan dengan passkey milik Clerk.

Pada setiap consent, API memverifikasi assertion terhadap challenge khusus intent dengan user presence dan user verification wajib. Untuk setiap step-up Clerk yang diwajibkan, kebijakan server menolak faktor yang tidak memadai; jangan membiarkan graceful downgrade memenuhi syarat signing. Signature atas dokumen tidak digantikan oleh “baru login beberapa menit lalu”.

## 4. Syarat akun produksi

Default domain tepat: `gmail.com` dan `outlook.com`. Hotmail/Live, custom-domain Workspace, akun organisasi Microsoft dan domain lain tidak otomatis diperbolehkan.

Google harus memenuhi proof provider dan status mailbox verified. Microsoft connection Clerk saat ini menggunakan audience `common`, sehingga login Microsoft dapat berasal dari organisasi, sekolah atau personal. Backend harus membuktikan tipe akun yang memenuhi syarat Outlook personal dan verified mailbox; jika informasi yang tersedia tidak mencukupi, pending_review tetap berlaku. Spike menilai kebutuhan proof langsung Microsoft untuk enrollment. Mengizinkan domain email saja tidak cukup untuk menyelesaikan pemeriksaan tipe akun.

AccountId internal dan clerkUserId menjadi referensi akun; binding provider menggunakan identifier stabil dari kanal server tepercaya, bukan email sebagai primary key. Mailbox challenge tambahan digunakan saat proof provider tidak cukup; challenge sekali pakai, kedaluwarsa, disimpan sebagai hash dan dibatasi percobaannya. OTP mailbox bukan pengganti passkey consent atau pemeriksaan identitas.

Status signer: `pending_review → active_signer → suspended/revoked`. Aktivasi memerlukan undangan, provider yang memenuhi syarat, mailbox verified, credential consent, role yang sah dan approval petugas lain. Akun test/demo/automation tidak dapat aktif di produksi. Purpose, approval dan eligibilityVersion ditetapkan server. Dilarang self-approval; bootstrap petugas pertama menggunakan prosedur administratif terpisah dengan dua pihak dan pencatatan audit.

Perubahan email/provider/role/credential, suspension dan revocation menaikkan eligibilityVersion serta membatalkan intent yang relevan. Event webhook Clerk diverifikasi signature-nya dan diproses idempotent; kehilangan/penundaan webhook ditangani rekonsiliasi berkala. Untuk aksi signing, cek live session/provider state sesuai kontrak yang ditetapkan dan batasi freshness cache; bila validasi status tidak tersedia, jangan menerbitkan receipt baru.

Tidak ada filter yang menjamin semua akun dummy terdeteksi. Approval identitas/peran, undangan, pemisahan lingkungan, rate limit dan pemeriksaan anomali adalah lapisan kontrol yang dapat dipertanggungjawabkan. Jangan mengandalkan kata “test”, usia akun yang tidak tersedia dari provider, IP atau CAPTCHA sebagai bukti identitas.

## 5. Alur produk dan lifecycle

1. Pengguna mengedit secara lokal; aset tanda tangan dibuat dengan menggambar atau PNG transparan. Aset disimpan privat dan tidak menjadi template publik.
2. Pengguna memilih snapshot yang akan diunggah dan melihat ringkasan data/aset yang dikirim.
3. Server memvalidasi dan menyimpan revision immutable, menyiapkan visual tanda tangan/penempatan, lalu merender PDF final. QR hanya berisi opaque verification reference yang dialokasikan sebelum rendering.
4. Penandatangan login dan lolos eligibility; preview memperlihatkan PDF final yang akan diikat, ringkasan revisi, peran dan pernyataan persetujuan.
5. Server menerbitkan intent dan challenge WebAuthn yang mengikat manifestHash, artifactHash, actor, role, policyVersion, purpose, nonce, expiry dan environment.
6. User verification dan persetujuan eksplisit menghasilkan assertion. Backend menerima consent sekali dalam transaksi, mencatat audit dan memasukkan pekerjaan seal ke outbox.
7. Worker menerbitkan seal setelah pemeriksaan final. UI menampilkan `seal_pending` sampai receipt tersedia; checkpoint audit mempunyai status terpisah `anchor_pending/anchored`.
8. Pengguna mengunduh PDF final dan evidence bundle. Verifier memeriksa bytes artifact, manifest, credential consent, receipt, trust anchor, audit dan revocation.

Lifecycle revision: `draft → preparing → ready_for_consent → consent_accepted → seal_pending → sealed`; sebelum consent dapat cancelled/expired. Perubahan setelah ready membuat revisi baru dan membatalkan intent lama. Setelah sealed, perubahan lokal adalah fork/revisi baru; signature lama tetap hanya berlaku untuk revisi lama. Revocation menjadi event baru, bukan penghapusan sejarah.

Undo/redo editor tidak membatalkan consent/receipt server. Consent yang dicabut memerlukan aksi revocation eksplisit dengan alasan dan authorization. Offline hanya menyediakan draft/pending lokal; kembali online harus meminta challenge baru dan persetujuan eksplisit, bukan mengirim klik lama seolah persetujuan online telah selesai.

## 6. Kontrak kriptografi dan integritas

- Canonical manifest mengikuti RFC 8785; tolak duplicate JSON keys, angka non-finite dan data di luar schema. Urutan item/halaman yang bermakna dipertahankan; metadata manifest yang berupa himpunan disortir secara deterministik.
- Gunakan SHA-256 untuk hash byte aset, original background PDF, font, rendering profile, visual signature, manifest dan PDF final. Bedakan jenis digest; asset ID saja tidak mengikat isi.
- Challenge consent: hash encoding canonical intent dengan domain `Kartesian/signing-intent/v1` dan framing byte yang eksplisit. Nonce CSPRNG minimal 32 byte, expiry pendek dan consumption sekali. Jangan memakai hash dokumen yang tetap sebagai challenge setiap transaksi.
- Seal memakai envelope JWS yang profil algoritma/encoding-nya dipin; target awal ES256/P-256 melalui KMS/HSM. Verifikasi menolak alg none, algoritma di luar allowlist, key dari header/URL arbitrer dan key milik staging. Pemetaan DER/P1363 dan hashing KMS/JWS wajib diuji dengan test vectors agar tidak terjadi double hashing.
- Receipt mengikat protocolVersion, environment, tenant/document/revision, manifestHash, artifactHash, consentEvidenceHash, actor/credential reference, role, policyVersion, audit sequence/hash, serverReceivedAt dan keyId. Evidence assertion asli serta credential public key reference disimpan untuk verifikasi.
- Public key trust bundle berasal dari distribusi tepercaya terpisah. Kunci yang hanya ada pada file pengguna tidak boleh langsung dipercaya. Rotasi mempertahankan riwayat trust/revocation.
- Aset sensitif menggunakan envelope encryption AES-256-GCM, nonce unik per key/enkripsi dan AAD yang mengikat tenant/document/revision/asset/schema. Pisahkan key seal dari key enkripsi.
- Receipt artifact disimpan terpisah dari PDF; menambahkan receipt/QR setelah PDF dihash akan mengubah bytes dan memerlukan artifact baru. V1 tidak mengklaim PDF signature tertanam/PAdES. Hindari circular hash antara receipt dan PDF.

## 7. Audit, transaksi dan kegagalan parsial

Audit per stream dokumen memakai sequence yang dialokasikan server, eventId unik, actor dari sesi, aksi, target, policyVersion, reason, server time dan prevEventHash. Hash memakai canonical encoding dengan domain `Kartesian/audit-event/v1`. Peristiwa penolakan tanpa dokumen terotorisasi masuk security log terpisah agar tidak membocorkan keberadaan dokumen.

Transaksi consent mengunci/compare-and-swap revisi, intent dan eligibilityVersion; mengonsumsi intent, menulis consent + audit + outbox bersama-sama. Unique constraints mencegah replay/double-submit. Idempotency key diikat ke actor, endpoint dan hash request; key sama dengan isi berbeda ditolak.

KMS tidak ikut transaksi PostgreSQL. Worker membaca job, memeriksa status/eligibility, meminta signature, lalu mempublikasikan receipt dalam transaksi dengan pemeriksaan ulang eligibilityVersion dan status revision. Bila status berubah selama panggilan KMS, hasil tidak dipublikasikan dan job dicatat cancelled/stale. Revocation yang terjadi setelah publikasi menjadi event status berikutnya. Retry tidak menambah consent/audit bisnis yang sama dua kali; attempt operasional boleh dicatat terpisah.

App DB role tidak dapat update/delete audit; append melalui jalur terkontrol. Segel checkpoint per interval terukur dan simpan pada retensi object storage serta pengawas independen dengan akses terpisah. Monitor checkpoint freshness/fork/sequence gaps. Hash-chain tanpa anchor eksternal tidak membuktikan riwayat belum dipotong.

Event minimum: signer invited/approved/suspended/revoked, provider/credential changed, revision prepared, intent created/expired, consent accepted, seal issued/failed, artifact exported, signature revoked, checkpoint published dan print requested. Jangan mencatat “printed” berdasarkan penutupan dialog browser. Token, secret, gambar signature, isi dokumen dan raw credential response tidak ditulis ke log operasional biasa.

## 8. Data dan endpoint

| Entitas                            | Constraint utama                                                         |
| ---------------------------------- | ------------------------------------------------------------------------ |
| accounts, memberships              | clerkUserId unik; tenant/role server-authoritative                       |
| signer_profiles, identity_bindings | approval bukan dari user-editable metadata; eligibilityVersion monotonik |
| consent_credentials                | credentialId unik; public key, RP ID, account binding, revocation        |
| document_revisions, assets         | immutable setelah ready; content digest, owner/tenant, storage version   |
| signing_requests, signing_intents  | role/actor/revision fixed; nonce hash, expiry dan usedAt                 |
| consents, receipts                 | unique intentId; evidence hash, algorithm/key dan status publikasi       |
| audit_events, checkpoints          | unique streamId+sequence, previous hash, independent anchor              |
| outbox, artifact_exports           | retry/idempotency; artifact bytes tidak ditimpa                          |

API awal: `POST /revisions`, `POST /revisions/:id/prepare`, `GET /revisions/:id/preview`, `POST /signer/enrollment`, `POST /signer/credentials/options`, `POST /signer/credentials/verify`, `POST /signing-intents`, `POST /signing-intents/:id/consent`, `GET /receipts/:id`, `POST /receipts/:id/revoke`, `GET /audit/:documentId`, dan `GET /verify/:opaqueRef`. Endpoint admin approval terpisah dengan pemisahan role. Semua akses objek memeriksa tenant/membership/permission; identifier acak bukan authorization.

Response membedakan valid, tampered, untrusted_key, revoked, incomplete dan status_unknown. Receipt offline yang valid secara signature belum membuktikan status pencabutan terbaru. Verifier publik menampilkan informasi minimum; evidence lengkap hanya untuk pemilik/pihak yang berwenang.

## 9. Batas MVP dan fitur lanjutan

V1 produksi mencakup satu penandatangan per revision, alur approval akun, visual signature, PDF final immutable, consent terikat artifact, seal, revocation, audit/checkpoint dan verifier. Single-signer menghindari penggantian PDF diam-diam saat signature lain ditambahkan.

V2 menambahkan multi-signer/urutan persetujuan: seluruh slot, role dan visual assets yang memengaruhi artifact harus dibekukan sebelum consent pertama. Jika visual/aset/artifact berubah, seluruh consent terkait manifest lama harus diminta ulang. Perilaku mengubah PDF setelah signer pertama tanpa invalidasi dilarang.

PAdES/sertifikat pribadi, timestamp authority eksternal, guest signers, domain organisasi, dan public self-service identity verification merupakan workstream tersendiri. Kebutuhan compliance/retensi diputuskan dengan pihak yang bertanggung jawab; tidak diasumsikan dari implementasi teknis.

## 10. Roadmap implementasi dan exit gate

| Fase                        | Deliverable                                                                                                                                 | Dependensi / gate selesai                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P0 · Kontrak & spike        | ADR arsitektur; threat model; PoC Clerk Google/Microsoft, verified mailbox, account linking, step-up dan challenge capability; test vectors | Buktikan provider personal/binding dapat ditegakkan. Jika tidak, desain enrollment tambahan; tidak menurunkan syarat |
| P1 · Foundation             | Signing app runtime, shared schema, PostgreSQL migrations, storage/KMS ports, CI terpisah                                                   | Editor static tetap build/offline; database integration test berjalan; mock hanya non-production                     |
| P2 · Identity & eligibility | Clerk login/invite-only; signer enrollment, approval, passkey consent, revocation, webhook/reconciliation                                   | Akun pending/test/akun domain lain tidak bisa sign; perubahan binding tidak mewarisi approval                        |
| P3 · Revision & artifact    | Snapshot opt-in, immutable manifest/assets, renderer PDF terisolasi, preview exact artifact                                                 | Perubahan satu byte terdeteksi; font/background/offset terikat; cross-tenant akses ditolak                           |
| P4 · Consent transaction    | Intent sekali pakai, WebAuthn verify, idempotency dan audit/outbox atomik                                                                   | Replay, race, expiry, revision drift dan wrong account ditolak; evidence disimpan                                    |
| P5 · Seal & trust           | KMS JWS adapter, receipt worker, key history, revocation dan verifier                                                                       | Test vectors lintas implementasi; failure KMS tidak menghasilkan status sealed                                       |
| P6 · Audit anchor           | Hash chain, checkpoint signature, retensi dan independent witness                                                                           | Rollback/fork/truncation terdeteksi relatif ke checkpoint tepercaya; alarm freshness aktif                           |
| P7 · Product integration    | UI signature, status, audit viewer, evidence export dan admin approval                                                                      | Mode offline tidak memberi status verified; editing sealed revision membuat fork; receipt bukan gambar biasa         |
| P8 · Production hardening   | Threat-focused E2E, penetration review, backup/restore drill, incident runbook, pilot terbatas                                              | Seluruh gate security dan operasi di bawah lulus sebelum production signing dibuka                                   |
| P9 · Perluasan              | Multi-signer dan fitur lanjutan yang disetujui                                                                                              | V1 stabil dan aturan invalidasi lintas signer diuji                                                                  |

Urutan kritis: P0 → P1 → P2/P3 → P4 → P5/P6 → P7 → P8. P2 dan P3 dapat dikerjakan independen setelah kontraknya stabil; P5/P6 berbagi event schema. Ini dependensi pekerjaan, bukan instruksi membuat thread/agen baru.

Untuk efisiensi, hindari custom login UI, implementasi kripto sendiri, dukungan banyak provider/domain, dan migrasi seluruh editor di fase awal. Gunakan komponen Clerk selama memenuhi gate. Verifikasi komponen/contract setiap fase; suite browser menyeluruh di akhir integrasi. Jangan menunda pemeriksaan invariant kriptografi/transaksi sampai production.

## 11. Acceptance dan pengujian

| Lapisan         | Kasus wajib                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identitas       | forged/expired/wrong audience session, Google non-Gmail, Microsoft organisasi, email belum verified, perubahan provider/linking, akun test/revoked dan self-approval |
| WebAuthn        | challenge replay/expired, origin/RP ID salah, UV tidak terpenuhi, credential akun lain, revoked credential, synced-passkey counter policy                            |
| Dokumen         | manifest/aset/PDF/font diubah, duplicate keys, integer/float edge cases, visual signature disisipkan, perubahan setelah preview                                      |
| Transaksi       | double submit, idempotency key conflict, crash sebelum/sesudah commit, queue redelivery, KMS timeout, eligibility berubah saat worker berjalan                       |
| Trust/audit     | key palsu pada artifact, alg substitution, receipt staging, revocation, audit gap/fork/truncation, stale checkpoint dan rotasi/kompromi key                          |
| Akses/privacy   | akses lintas tenant, object ID guessing, signed URL expiry, CSRF/CORS, XSS, public verifier enumeration dan kebocoran log                                            |
| Existing editor | seluruh unit/komponen, tiga engine browser, PDF detector, F4, backup/restore, undo/redo, virtualization dan offline                                                  |

Gunakan unit test untuk policy/pure canonicalization, integration test DB asli/KMS adapter, browser E2E dengan virtual authenticators di test environment, dan staging dengan akun nyata yang terpisah. Mock OAuth saja bukan bukti provider production berfungsi. Test keys/receipts wajib ditolak verifier produksi.

## 12. Operasi, produksi dan rollback

- Pisahkan Clerk instances, OAuth clients, origins/RP IDs, database, bucket, KMS keys dan audit streams antar environment. Secrets tidak boleh memakai env publik atau masuk backup editor.
- Deployment/startup gate menolak konfigurasi produksi yang memakai test issuer/key/mock, trust bundle kosong, permission terlalu luas atau resource staging. Google/Microsoft produksi memakai credentials yang dikonfigurasi khusus.
- Domain restriction, verified mailbox, active_signer, purpose production, tenant/role, credential dan policy freshness dicek server pada intent, consent dan publikasi receipt. Role dari client/public metadata tidak dipercaya.
- Rate limit enrollment, OTP, intent, consent dan verifier; alarm untuk replay, signature failure, penolakan eligibility, outbox backlog, checkpoint stale, credential revocation dan KMS anomaly. Log korelasi memakai request/event IDs tanpa secret.
- Tetapkan RPO/RTO serta masa retensi dengan pemilik produk; uji restore database+object versions+trust history+checkpoint. Evidence tidak boleh bergantung pada satu browser.
- Rollout: non-production → pilot invite-only → production terbatas → perluasan. Feature flag dapat menghentikan intent/consent/seal baru tanpa menghilangkan akses ke evidence dan revocation yang sah. Jangan mencabut signing hanya dengan menyembunyikan tombol.
- Rollback aplikasi mempertahankan schema/evidence compatible; tidak menghapus audit. Gunakan expand/contract migrations dan drill key compromise. Setiap rilis mencatat contract/profile/key versions.

## 13. Kebutuhan eksternal dan keputusan sebelum release

Implementasi kontrak/domain dan test lokal dapat dimulai tanpa credentials produksi. Integrasi nyata memerlukan: Clerk project/instances dan paket yang sesuai, Google/Microsoft OAuth apps, domain HTTPS/RP ID, hosting runtime/worker, PostgreSQL, private object storage, KMS/HSM, pengiriman email bila dibutuhkan, witness/retention storage serta petugas approval.

Pilihan penyedia infrastruktur, budget/kuota Clerk, enrollment identity policy, retensi, RPO/RTO, region data dan scope multi-signer harus dicatat sebagai keputusan sebelum provisioning/release. Tidak ada estimasi kalender atau biaya pasti sebelum spike P0 dan pilihan penyedia tersebut. Infrastruktur eksternal dan pembayaran tidak dibuat oleh penyusunan masterplan ini.

Definition of done V1: seluruh P0–P8 selesai, tidak ada temuan security kritis/tinggi terbuka, trust/revocation/restore drill berhasil, semua regression existing lulus, dan UI mendeskripsikan bukti dengan benar. Fitur hanya gambar+login+checksum tidak memenuhi definition of done.

## 14. Referensi dan batas dokumentasi provider

Diperiksa 29 Oktober 2026; konfirmasi ulang saat integrasi dan pin SDK/API version.

- [Clerk Microsoft](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/microsoft): dukungan social connection, verifikasi email dan batas audience common.
- [Clerk access control](https://clerk.com/docs/guides/secure/restricting-access): invite-only/waitlist, allowlist produksi dan keterbatasan mode.
- [Clerk reverification](https://clerk.com/docs/guides/secure/reverification): pemeriksaan server, faktor tersedia dan graceful downgrade.
- [Clerk account linking](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking): automatic linking berbasis email.
- [Next runtime vs static export](https://nextjs.org/docs/app/guides/backend-for-frontend): API runtime tidak tersedia pada export statis.
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html), [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/), [Web Crypto](https://www.w3.org/TR/webcrypto/), [JWS RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html): rujukan protokol; implementasi mengikuti profil dan test vectors yang ditetapkan P0.

## Langkah eksekusi pertama

Mulai P0: tulis ADR, schema manifest/intent/receipt, threat cases, fixture canonicalization dan PoC binding identitas Clerk. Setelah exit gate P0 terpenuhi, tambahkan signing runtime pada P1. Jangan lebih dahulu menambahkan tombol “Tanda tangan terverifikasi” pada editor tanpa layanan pembuktian yang mendukungnya.
