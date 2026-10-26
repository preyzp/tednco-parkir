# TESTING_STRATEGY.md — TednCo Parkir

> MVP testing strategy | Bahasa Indonesia | Timezone: Asia/Jakarta

## 1. Tujuan dan prinsip

Pastikan operasi parkir benar, data antar-tenant terisolasi, permission ditegakkan di server, dan uang/saldo prepaid tidak berubah ganda akibat retry, double-click, atau concurrency. Test bukan pengganti validasi server. Gunakan data uji sintetis; jangan memakai data pelanggan produksi.

Referensi: `PRD.md`, `BUSINESS_RULES.md`, `DATABASE_SCHEMA.md`, `AUTH_AND_TENANCY.md`, `SUBSCRIPTION_SPEC.md`, `DESIGN_SPEC.md`, dan `IMPLEMENTATION_PLAN.md`.

## 2. Tool dan lapisan pengujian

| Lapisan | Tool | Fokus |
|---|---|---|
| Unit | Vitest | Normalisasi plat, tarif, validasi, permission, format uang/tanggal |
| Integration | Vitest + database test terisolasi | Repository, unique indexes, session lifecycle, transaksi MongoDB, ledger |
| E2E | Playwright | Login, kendaraan masuk, checkout, prepaid, riwayat, role dan mobile |
| Static | TypeScript + ESLint | Kesalahan tipe dan kualitas kode |
| Manual | Browser desktop/mobile | Aksesibilitas, operasional lapangan, instalasi PWA, koneksi buruk |

Gunakan MongoDB test deployment yang mendukung transaksi multi-dokumen (replica set). Jangan mengasumsikan mock MongoDB membuktikan keamanan transaksi/concurrency. Database test harus berbeda dari production; bersihkan fixture secara aman.

## 3. Perintah pengujian

### P1.9 live verification selesai (2026-10-18)

**Phase 1 complete untuk scope foundation.** Setelah persetujuan eksplisit owner,
runner existing diperluas minimal untuk Atlas dengan token terpisah
`I_APPROVE_ATLAS_TEST_WRITES`. URI existing dibaca tanpa dicetak dari .env.local;
path database URI dibuang dan nama database diganti sepenuhnya oleh UUID test.
Nama Atlas `tpk_t_<32 hex UUID>` dibatasi 38 byte, mempertahankan UUID penuh.
Mode lokal/guard lama tetap tersedia. Tidak menerima database development/
production dari caller, tidak memodifikasi .env.local dan tidak drop otomatis.

Hasil live: **4/4 tes lulus, 1 file, 0 gagal**, total **6,39 detik**, database
`tpk_t_fddf793a3e2e4ec1b0ffc6001a8fc81a`. Memverifikasi 31 index pada 12 koleksi,
index initialization/rerun, active partial uniqueness dan history exceptions,
completed payment/posted debit uniqueness, serta concurrent account/idempotency
conflicts. Koneksi ditutup; fixture/index/database test dipertahankan. Tidak ada
write atau setup index terhadap development database. Bukan bukti workflow
checkout/prepaid, auth atau transaction rollback yang belum diimplementasikan.

Dua percobaan awal gagal di empty-namespace preflight sebelum setup index/write;
nama test lama melebihi batas Atlas Free. Setelah perbaikan prefix khusus Atlas,
empat tes sukses. Typecheck awal parseEnv Dict<string> diperbaiki menjadi map
string|undefined. Semua checks akhir lulus:

- Guard offline: **18/18 tes**.
- Full `pnpm test`: **196/196 tes / 9 file**, 0 gagal; live files tetap terpisah.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`: lulus.
- Live command: `pnpm test:integration --reporter=verbose --silent=false`, dengan
  Atlas opt-in hanya dalam proses yang telah disetujui; tidak dieksekusi oleh build.

Persetujuan owner hanya mencakup database test acak dan fixture/index test.
Persetujuan eksplisit tetap wajib sebelum future live write/index creation.
Panduan mode Atlas/lokal dan database retained ada di `tests/integration/README.md`.
Data/index readiness pada deployment staging/production tetap prosedur terpisah.
Next: **Phase 2 — Authentication & Multi-Tenancy**, belum diimplementasikan.

### Snapshot sebelum persetujuan live: P1.9 (2026-10-18)

Status terkini setelah review lanjutan P1.9: `pnpm test` menjalankan
**9 file / 190 tes offline** (0 gagal). Suite terfokus MongoDB/DAL/index/error/
guard lulus **119 tes / 6 file**. Lint, typecheck dan production build lulus.
Lima tes tambahan memverifikasi production mengabaikan cache development,
pending authorization tenant/lokasi/platform tidak menyentuh DB sebelum/sesudah
ditolak, serta mutasi byte ObjectId asal tidak mengubah scope yang ditangkap.
Tidak mengulang skenario reuse/concurrency/partial indexes yang sudah tercakup.
Perintah `pnpm test:integration` memakai config terpisah
`vitest.integration.config.mts`, hanya menemukan `*.integration.ts`. Empat tes
live tidak ditemukan oleh normal test discovery dan tidak dieksekusi saat build.
Guard integration diuji offline dalam target.test.ts; production code tidak
diubah. Workflow P1.8 di bawah adalah snapshot sebelum penambahan 20 tes P1.9.

Tambahan tes mencakup cleanup koneksi gagal yang masih pending saat development
module reload/production reuse, safe retry paralel setelah cleanup, index conflict
di tengah setup dan identical rerun, DB acquisition failure, scope _id tenant/
lokasi, platform audit isolation, invalid tenant dalam context lokasi, unknown
commit error sanitization, serta guard target integration. Existing concurrency,
reuse, fail-closed authorization, partial-index definitions dan validation/error
tests dipertahankan tanpa duplikasi skenario.

Panduan lengkap: `tests/integration/README.md`. Live writes mensyaratkan izin
pemilik dan token RUN_MONGODB_INTEGRATION=I_APPROVE_LOCAL_TEST_WRITES, URI khusus
MONGODB_TEST_URI untuk server loopback terisolasi tanpa credentials/database path,
dan tidak boleh ada MONGODB_URI/MONGODB_DB_NAME aplikasi pada proses. Database
test dihasilkan acak untuk setiap run dengan prefix tednco_parkir_test_; namespace
harus kosong sebelum index dibuat. Tidak ada automatic drop/deletion. Fixtures
tetap tersimpan dan client ditutup setelah run; cleanup data adalah tugas operator
terpisah dengan izin eksplisit. Remote/Atlas sengaja belum diizinkan harness awal;
perlu review terpisah sebelum perluasan, bukan mematikan guard.

Empat tes live disiapkan untuk index rerun/listIndexes, competing active sessions
dengan pengecualian history/tenant/location, completed payments/posted ledger
debits, dan prepaid/idempotency uniqueness. Tidak menguji workflow finansial,
authorization nyata, rollback/reconciliation atau idempotent business responses.
Replica set diperlukan untuk pengujian transaksi pada fase yang relevan.

**Live write/index verification belum tersedia.** Read-only Atlas development
connection sudah terverifikasi lewat getDb() dan ping sesuai HANDOFF.md; itu
bukan izin menjalankan setupDatabaseIndexes() atau menulis fixture di development.
Review lanjutan ini tidak membuka koneksi live atau menjalankan suite integration.
Dalam implementasi awal P1.9 hanya guard-disabled execution diperiksa:
opt-in sengaja dikosongkan, Vitest menolak 1 suite di beforeAll (exit 1), 4 tes
live tidak dieksekusi. Tidak ada koneksi/write live. Ini negative safety check yang
berhasil menolak akses, bukan integration pass. Typecheck awal ProcessEnv fixture
gagal karena augmentasi NODE_ENV dari Next; guard diubah menerima readonly map
environment, lalu typecheck/build lulus. Suite terfokus lulus 114 tes/6 file;
suite penuh, lint, typecheck dan production build lulus setelah perbaikan.

Phase 1 **belum ditandai complete**: koneksi development sudah lulus ping, tetapi
index enforcement dan concurrent writes pada dedicated test database masih perlu
dibuktikan dengan live run berizin. Persetujuan eksplisit wajib didapat sebelum
live write maupun index creation; tidak menjalankan setup index terhadap Atlas
development. Next planned phase: **Phase 2 — Authentication &
Multi-Tenancy**. Tidak memulai auth/CRUD/E2E untuk menutupi blocker verifikasi live.

Perintah final mengikuti `package.json` aktual. Tambahkan script secara bertahap, misalnya `test`, `test:unit`, `test:integration`, `test:e2e`, `typecheck`. Jalankan `pnpm lint`, `pnpm build`, dan test yang relevan. Jangan mengklaim script sudah tersedia sebelum memeriksa repo.

### Workflow terverifikasi P1.8 (2026-10-18)

| Kebutuhan | Perintah |
|---|---|
| Semua tes, sekali jalan | `pnpm test` |
| Satu file | `pnpm test src/lib/mongodb.test.ts` |
| Satu direktori | `pnpm test src/lib/dal` |
| Watch semua tes | `pnpm test:watch` |
| Watch satu file | `pnpm test:watch src/lib/env.test.ts` |
| Daftar file yang ditemukan | `pnpm exec vitest list --filesOnly` |
| Pemeriksaan tipe (termasuk tes) | `pnpm exec tsc --noEmit` |
| Lint / build | `pnpm lint` / `pnpm build` |

Watch: `r` menjalankan ulang, `q` keluar. Flag `--watch` eksplisit memastikan mode
watch tidak bergantung pada deteksi terminal/CI/agent. Pada review, satu file env
lulus 17 tes pada run awal dan rerun dalam proses watch yang sama, lalu ditutup.

Vitest 4.1.12 sudah terpasang. Tidak ada `vitest.config.*` atau `vite.config.*`;
default environment **node**, globals **false**, dan isolate **true** sesuai tes
backend/domain saat ini. Tidak membutuhkan jsdom, plugin React, DOM testing,
coverage provider atau dependency tambahan. Semua tes mengimpor API dari vitest
secara eksplisit. Runtime imports saat ini relatif; TypeScript mendukung alias
`@/*`, tetapi runtime alias itu belum digunakan/dibuktikan pada tes. Tambahkan
konfigurasi alias minimal hanya bila tes nyata membutuhkan dan menemukan masalah.

Discovery default versi terpasang: `**/*.{test,spec}.?(c|m)[jt]s?(x)`; yang
dikecualikan default hanya node_modules dan .git. `vitest list --filesOnly`
menemukan seluruh 8 file tes di src/lib dan src/types (165 tes), tidak ada
custom include/exclude yang menyembunyikan sumber. Ini discovery file tes,
bukan pengukuran coverage source. Jika kelak ditambahkan integration/E2E suite,
pisahkan discovery dan opt-in execution agar `pnpm test` tetap offline.

TypeScript/Vite mentransformasi tes TS saat runtime; `pnpm test` sendiri tidak
melakukan static typecheck. `expectTypeOf` dan `@ts-expect-error` diverifikasi oleh
`pnpm exec tsc --noEmit`. tsconfig strict mencakup source dan test TS/TSX/MTS,
tanpa mengecualikan src. Karena itu typecheck tetap wajib selain Vitest.

### Mock, isolation, dan jaringan

- Semua jalur MongoDB yang dapat membuka koneksi dimock: mongodb.test mengganti
  MongoClient; DAL/index tests mengganti getDb. Import ObjectId/MongoServerError
  pada tes lain tidak membuka koneksi. Fixture environment memakai data sintetis;
  tes tidak memuat .env.local atau memerlukan kredensial nyata. Tidak ada fetch
  atau network request yang diperlukan oleh suite saat ini.
- `vi.mock("server-only", ...)` lokal memungkinkan pengujian Node di luar Next
  server runtime. Mock ini tidak membuktikan server/client boundary Next; build
  tetap gate tersendiri. Tidak ada global mock auth yang membuka DAL secara diam-diam.
- Mock/reset implementasi dilakukan sebelum setiap tes yang stateful. MongoDB
  tests me-reset module cache, menghapus global development cache sebelum/sesudah
  tes, memulihkan stub environment dan spies. Env tests memulihkan environment;
  console spies dipulihkan lewat finally. Promise koneksi pending diselesaikan
  dalam tes. Tidak ada real MongoClient yang perlu ditutup oleh test teardown.
- File isolation aktif secara default; tidak ada test.concurrent yang memakai
  global/env bersama. Jangan menonaktifkan isolation atau mengubah NODE_ENV global
  tanpa cleanup. Global auto restore/reset tidak ditambahkan karena cleanup
  existing sudah eksplisit dan lolos review.
- Audit urutan: `pnpm exec vitest run --sequence.shuffle --sequence.seed=20261018 --maxWorkers=1`
  lulus 8 file/165 tes. Ini memberi bukti tambahan tidak bergantung pada urutan,
  bukan bukti semua kemungkinan interleaving. Suite normal tetap paralel default.
- Tidak ada network-denial harness global; status offline didasarkan pada review
  import/mock dan kelulusan suite di sandbox dengan jaringan dibatasi. Build
  terpisah masih dapat memerlukan jaringan untuk Google Fonts scaffold existing.

### Gaps untuk P1.9 — Database Foundation Tests

Prioritaskan skenario fondasi yang belum tercakup, tanpa mengarang implementasi
auth/CRUD: kegagalan index di tengah urutan (index sebelumnya sudah terbuat),
retry/cache setelah kegagalan koneksi yang melewati development module reload,
dan tambahan kasus boundary tenant/location pada integration points existing.
Mock tests saat ini memeriksa filter/command/options, bukan database enforcement.

Rancang integration suite database terisolasi dan opt-in, dengan guard agar URI/
database test tidak mengarah production, lifecycle fixture aman, dan replica set
jika menguji transaksi. Unique active sessions/completed payments/posted debits,
idempotency, rerun/conflicting indexes dan concurrency nyata perlu diuji terhadap
MongoDB, bukan dibuktikan lewat mock. Runtime alias dan network-denial safeguards
dapat ditambahkan bila kebutuhan suite berikutnya membenarkannya. Tidak ada live
database integration yang dijalankan/dikonfigurasi oleh review P1.8 ini.

Pengujian auth/permission nyata, transaksi finansial, rollback/reconciliation,
dan E2E tetap menunggu implementasi fase terkait; jangan mengklaimnya telah
tercakup hanya karena 165 tes fondasi lulus.

## 4. Unit test — aturan bisnis

### Kendaraan
- Plat wajib; spasi/case dinormalisasi untuk pencarian dan pemeriksaan duplikasi, sementara nilai tampilan dipertahankan.
- Jenis kendaraan hanya `Motor` atau `Mobil`.
- Pencarian partial plat tidak sensitif huruf besar/kecil.
- Catatan/nama/telepon opsional; data tidak valid ditolak.

### Tarif
- Tarif ditentukan tenant, lokasi, jenis kendaraan, dan pilihan eksplisit Reguler/Menginap.
- Menginap: `nightCount` harus integer positif; total = tarif per malam × jumlah malam.
- Jangan otomatis mengganti tarif karena lewat tengah malam atau jam operasional.
- Nilai historis memakai snapshot, tidak berubah saat konfigurasi tarif diedit.
- Staff tidak dapat mengubah nominal bebas tanpa izin khusus.

### Prepaid
- Deposit positif menambah saldo hanya setelah pembayaran dikonfirmasi.
- Saldo tidak dipotong saat entry, pergantian hari, atau pembatalan.
- Checkout prepaid memotong tepat total akhir, sekali saja.
- Saldo tidak cukup → metode Prepaid tidak tersedia; Cash/QRIS tetap boleh, tanpa potongan parsial.
- Refund tidak boleh melebihi saldo; transfer pending tidak dapat direfund dua kali.
- Deposit, usage, refund, adjustment diklasifikasikan dengan benar dalam laporan.

### Waktu dan laporan
- Entry dihitung berdasarkan `entryAt`, revenue berdasarkan `paymentAt`/`exitAt` sesuai spesifikasi laporan.
- Kasus masuk sebelum tengah malam dan keluar sesudah tengah malam.
- Filter Hari Ini/Kemarin/7 Hari/Bulan Ini/Bulan Lalu/custom menggunakan timezone Asia/Jakarta.
- Pembatalan tidak masuk pendapatan; deposit prepaid bukan service revenue.

## 5. Integration test — persistence dan integrity

- Unique active session: dua request bersamaan untuk plat yang sama di tenant/lokasi yang sama tidak boleh menghasilkan dua sesi aktif.
- Plat sama pada tenant/lokasi lain mengikuti batasan identitas yang ditetapkan schema.
- Checkout atomic: session, parking transaction, payment status, dan ledger (jika prepaid) konsisten atau semuanya rollback.
- Idempotency: key sama + payload sama menghasilkan satu efek; key sama + payload berbeda ditolak.
- Concurrent prepaid checkout tidak boleh mengurangi saldo di bawah nol.
- Retry setelah timeout harus membaca status aktual sebelum membuat transaksi baru.
- Double-click QRIS/Cash checkout tidak membuat pembayaran ganda.
- Deposit dan refund retry tidak menggandakan ledger.
- Semua ledger entries memiliki referensi, actor, waktu, nominal, dan saldo sesuai schema.
- Index tenant/location dan indeks unik dibuat sesuai `DATABASE_SCHEMA.md`.
- Audit log tercipta untuk pembatalan, koreksi, refund, adjustment, dan perubahan izin.

**Catatan:** Untuk pengujian concurrency, jalankan operasi paralel sungguhan terhadap database uji; jangan hanya mock fungsi repository.

## 6. Security, auth, dan tenancy

Uji semua role: `platform_admin`, `owner`, `admin`, `staff` dengan berbagai tenant dan lokasi.

- User tanpa login ditolak pada semua protected reads/writes.
- User tenant A tidak dapat membaca/mengubah data tenant B dengan mengganti ID pada URL/body.
- Staff lokasi A tidak dapat membaca/mengubah lokasi B jika tidak diberi akses.
- Owner dapat menjalankan tugas staff tanpa ganti role.
- Permission deposit, lihat prepaid, koreksi, refund, laporan finansial, dan settings ditegakkan di server.
- Tombol tersembunyi bukan pengganti authorization: panggil endpoint langsung dan pastikan ditolak.
- Password reset token single-use, kedaluwarsa, dan tidak mengungkap apakah email terdaftar.
- Session logout/revocation, invalid session, dan rate limiting diuji.
- Error response tidak membocorkan secret, connection string, atau detail data tenant lain.
- Akses platform admin lintas tenant dibatasi dan diaudit.

## 7. E2E — critical journeys

| ID | Skenario | Hasil yang diharapkan |
|---|---|---|
| E01 | Login owner → pilih lokasi | Lokasi dan menu sesuai membership |
| E02 | Staff tambah Motor | Sesi aktif muncul, entry tercatat |
| E03 | Tambah plat yang sudah aktif | Ditolak dengan pesan jelas |
| E04 | Search partial plat + filter Mobil/Motor | Hasil tepat, tenant/location scoped |
| E05 | Edit kendaraan aktif | Data berubah dan audit sesuai aturan |
| E06 | Batalkan sesi dengan alasan | Sesi hilang dari aktif, tetap di riwayat, tanpa revenue |
| E07 | Checkout Reguler Cash | Satu transaksi sukses, sesi selesai |
| E08 | Checkout Menginap QRIS manual | Jumlah malam dan total benar; tidak sukses sebelum konfirmasi |
| E09 | Daftar prepaid + deposit | Akun aktif setelah deposit terkonfirmasi |
| E10 | Checkout menggunakan prepaid | Saldo dan ledger berkurang sekali |
| E11 | Saldo prepaid kurang | Cash/QRIS tersedia, tidak ada partial deduction |
| E12 | Refund oleh owner/admin berizin | Saldo/ledger/audit benar |
| E13 | Staff mencoba refund | Ditolak oleh server |
| E14 | Laporan tanggal lintas hari | Entry dan revenue masuk tanggal tepat |
| E15 | Tenant A mengakses ID tenant B | Ditolak, tidak ada data bocor |
| E16 | Refresh/retry checkout setelah timeout | Status dibaca ulang, tanpa duplikasi |

## 8. UI, accessibility, dan PWA

- Uji mobile 360–430px, tablet, dan desktop ≥1024px.
- Tombol aksi utama mudah dijangkau; target sentuh minimal 44×44px.
- Form punya label, error inline, focus terlihat, keyboard navigation.
- Dialog konfirmasi mengelola fokus dengan benar.
- Loading/empty/error/success state tersedia; transaksi finansial ambigu tidak hanya menggunakan toast.
- Format `Rp`, waktu Asia/Jakarta, dan status berbahasa Indonesia benar.
- PWA manifest dan icon valid, dapat diinstal pada browser yang mendukung.
- Saat offline, write operations diblokir dengan pesan jelas; **tidak** ada antrean transaksi offline.
- Pada koneksi buruk, submit ganda dicegah dan UI memeriksa status server.

## 9. Subscription testing

- Platform admin dapat mengubah plan aktif, harga, limit, trial, dan feature flags tanpa redeploy.
- Existing invoice menyimpan snapshot terms dan harga.
- Status `trialing`, `active`, `past_due`, `grace_period`, `suspended`, `canceled`, `expired` ditangani sesuai kebijakan.
- Expired subscription tidak menghapus data operasional.
- Limit/feature enforced di backend, bukan hanya disembunyikan di UI.
- Manual payment verification tidak dapat dikonfirmasi dua kali.
- Jangan menguji harga atau limit final yang belum diputuskan sebagai nilai hardcoded.

## 10. Release gates

### Setiap task
- Unit test relevan lolos.
- Typecheck/lint relevan lolos.
- Tidak ada perubahan di luar scope tanpa penjelasan.

### Setiap phase
- Integration tests terkait lolos.
- `pnpm lint` dan `pnpm build` lolos.
- Regression untuk workflow yang terdampak lolos.
- `HANDOFF.md` diperbarui dengan hasil faktual.

### Sebelum pilot/production
- E01–E16 diuji; test yang tidak relevan harus dijelaskan, bukan diam-diam dilewati.
- Tenant isolation dan permission tests lolos.
- Financial concurrency/idempotency tests lolos.
- Staging E2E, backup/restore rehearsal, monitoring, dan secret review selesai.
- Tidak ada critical/high security atau financial integrity issue terbuka.
- Owner proyek menyetujui rilis.

## 11. Bug severity

- **Critical:** data lintas tenant bocor; uang/saldo ganda; saldo negatif; transaksi selesai tanpa payment valid.
- **High:** izin role salah; checkout gagal konsisten; refund/ledger tidak sinkron.
- **Medium:** filter/laporan salah tanpa kehilangan data; layout utama menghambat workflow.
- **Low:** copy, alignment, atau polish visual minor.

Critical/High harus diselesaikan sebelum production.

## 12. Test reporting format

Untuk setiap task laporkan: ID task, perubahan, test yang dijalankan (perintah), hasil pass/fail, cakupan yang belum diuji, risiko, dan rekomendasi berikutnya. Jangan menulis “semua aman” tanpa bukti test.
