# HANDOFF.md — TednCo Parkir

> Living project handoff. Update setelah milestone terverifikasi.
> Verifikasi ulang 2026-10-26 tercatat di bagian berikut; snapshot lama di bawah dipertahankan sebagai riwayat.
> Phase 1 complete dan terverifikasi pada 2026-10-18: 196 tes offline, 4 integration tests Atlas pada database test acak, lint/typecheck/build lulus. Tidak ada write/index setup pada database development.

## Verifikasi penutupan Phase 1 — 2026-10-26

Scope/acceptance: verifikasi P1.1–P1.9 dan bukti integration existing, jalankan checks offline/static/build, periksa Git ignore, selaraskan keputusan UI, tanpa perubahan production code atau akses Atlas. Tidak memulai Phase 2, memasang dependency, commit, push, atau membuang perubahan existing.

| Task | Status dan bukti aktual |
|---|---|
| P1.1 | Selesai: `src/lib/env.ts`, validasi Zod server-only/lazy dan tes environment. |
| P1.2 | Selesai: `src/lib/mongodb.ts`, shared connection promise, retry/cache dan tes helper; ping historis tercatat 2026-10-18. |
| P1.3 | Selesai: `src/types/`, persistence documents, JSON DTOs, type-only exports dan tes tipe. |
| P1.4 | Selesai untuk foundation: `src/lib/dal/`, tenant/location/platform scope dan tes; authorization sengaja fail-closed sampai Phase 2. |
| P1.5 | Selesai: explicit `setupDatabaseIndexes()`, 31 index/12 koleksi dan tes; penerapan live hanya database test menurut bukti historis. |
| P1.6 | Selesai: `src/lib/errors.ts`, AppError/HTTP mapping/normalisasi aman dan tes. |
| P1.7 | Selesai: `src/lib/validations/`, shared schemas/normalisasi/adapter error dan tes. |
| P1.8 | Selesai: Vitest terpasang, run/watch scripts, discovery offline terpisah dari live integration. |
| P1.9 | Selesai: 9 file/196 tes offline lulus ulang; empat skenario live sesuai catatan historis dan source harness. |

**Bukti live historis:** milestone 2026-10-18 di dokumen ini, `TESTING_STRATEGY.md`, dan `IMPLEMENTATION_PLAN.md` konsisten mencatat `pnpm test:integration --reporter=verbose --silent=false`: **4/4 tes, 1 file, 0 gagal, 6,39 detik**, database `tpk_t_fddf793a3e2e4ec1b0ffc6001a8fc81a`. Source `tests/integration/foundation.integration.ts` sesuai empat skenario: index initialization/rerun, partial active-session uniqueness, completed-payment/posted-debit concurrency, dan prepaid-account/idempotency uniqueness. Config integration terpisah dan guard explicit approval tersedia. Tidak ditemukan artefak runner/log mentah terpisah dalam repository; ini verifikasi konsistensi bukti dokumenter, bukan pembuktian independen ulang eksekusi historis. Tidak membuka koneksi Atlas atau menjalankan live tests pada sesi ini. Rerun di masa depan tetap membutuhkan persetujuan eksplisit baru; tidak diperlukan untuk closure berdasarkan catatan existing.

**Checks saat ini:** `pnpm test`: **196 passed / 9 files, 0 failed**, durasi **6,07 detik** (termasuk 18 guard tests offline); `pnpm lint`: lulus (exit 0); `pnpm exec tsc --noEmit`: lulus (exit 0). Build pertama gagal fetch Geist/Geist Mono akibat pembatasan jaringan; retry `pnpm build` dengan akses jaringan tercatat terpisah di bawah. Tidak mengganti font/source untuk melewati pemeriksaan.

**Git/secrets:** branch `master`, HEAD `1e469ff`. Working tree existing: 5 tracked files modified (`.gitignore`, `AGENTS.md`, `README.md`, `package.json`, `pnpm-lock.yaml`) dan 14 untracked entries (10 dokumen/template, `src/lib/`, `src/types/`, `tests/`, config integration). `git check-ignore -v` mengonfirmasi `.env.local`, `.env.production`, `.env.test` diabaikan oleh `.env*`, dan `.pem` oleh `*.pem`; `.env.example` dikecualikan sebagai template. `git ls-files` untuk `.env*`, `*credential*`, `*.pem` kosong. Nilai environment tidak dibaca/dicetak untuk audit ini; build memuat konfigurasi existing secara normal. Git membutuhkan opsi per-command `safe.directory` karena ownership sandbox berbeda; tidak mengubah konfigurasi global.

**Keputusan UI:** shadcn/ui untuk komponen, Lucide React untuk ikon, tema **Light / Dark / System** (label Terang / Gelap / Sistem), Inter dan emerald tetap. Dicatat pada `DESIGN_SPEC.md` dan setelah generated block `AGENTS.md`. Belum diinstal/diimplementasikan; token Dark dan pengujian UI menunggu fase UI. Ini menggantikan open decision library UI pada snapshot lama.

**Status:** P1.1–P1.9 selesai untuk foundation berdasarkan source, checks lokal, dan bukti live historis yang tersedia. Auth/CRUD/financial workflow/E2E belum termasuk cakupan; kesiapan index/data staging/production belum diverifikasi. **Next planned task: P2.1 — Authentication Library Selection and Setup**, belum dimulai. Pilih library kompatibel dengan Next.js aktual dan tetapkan setup/session requirements sebelum implementasi login. Checkpoint yang direkomendasikan setelah review diff dan template environment: `feat: establish application architecture`; tidak commit/push otomatis.

**Hasil build akhir 2026-10-26:** `pnpm build` lulus (exit 0), compile, TypeScript dan static generation 4/4 selesai. Retry dengan jaringan pertama berhenti exit 1 setelah static generation karena `SecurityFatalError`: Next.js 16.4.0 ditandai memiliki kerentanan; retry berikutnya lulus dengan peringatan yang sama. Upgrade keamanan Next.js direkomendasikan sebagai tindak lanjut tersendiri, tanpa perubahan dependency pada sesi ini. Tidak ada blocker closure foundation yang tersisa; peringatan keamanan wajib ditangani sebelum deployment. Perubahan sesi ini hanya dokumentasi `AGENTS.md`, `DESIGN_SPEC.md`, dan `HANDOFF.md`; semua perubahan existing dipertahankan.

## 1. Identitas proyek

- **Nama:** TednCo Parkir
- **Jenis:** SaaS/PWA manajemen parkir
- **Workspace lokal:** `D:\Project\tednco-parkir`
- **Bahasa UI:** Indonesia
- **Timezone default:** Asia/Jakarta
- **UI:** minimal, mobile-first, emerald `#059669`, font Inter
- **Package manager:** pnpm

## 2. Last known environment (perlu verifikasi ulang)

- Node `v24.11.1`; npm `11.6.2`; Git `2.43.0.windows.1`.
- Next.js `16.4.0`, React `19.3.0`, TypeScript 5, Tailwind v4.
- Branch: `master`.
- Last reported commit: `1e469ff chore: initialize TednCo Parkir with pnpm`.
- Scaffold baseline `pnpm lint` dan `pnpm build` pernah dilaporkan lolos.
- `pnpm-lock.yaml` digunakan; `package-lock.json` telah dihapus.
- **Belum diverifikasi dalam sesi ini:** status working tree, isi file aktual, dependency terbaru, koneksi MongoDB, dan implementasi fitur.

## 3. Documentation inventory

| File | Status | Keterangan |
|---|---|---|
| `AGENTS.md` | Konten pernah diberikan | Pastikan aturan produk ditambahkan **setelah** generated Next.js rules block |
| `PRD.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `BUSINESS_RULES.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `DATABASE_SCHEMA.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `AUTH_AND_TENANCY.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `SUBSCRIPTION_SPEC.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `DESIGN_SPEC.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `IMPLEMENTATION_PLAN.md` | Konten pernah diberikan | Perlu verifikasi file di disk |
| `TESTING_STRATEGY.md` | Disiapkan dalam paket ini | Perlu disalin ke repo |
| `HANDOFF.md` | Disiapkan dalam paket ini | Perlu disalin ke repo dan diperbarui |
| `README.md` | Disiapkan dalam paket ini | Menggantikan README scaffold setelah review |
| `.env.example` | Disiapkan dalam paket ini | Contoh konfigurasi, tanpa secret |

**Penting:** Dokumen yang diberikan di chat tidak otomatis berarti file telah dibuat dalam repo pengguna.

## 4. Current phase

**Phase 1 — Architecture & Database Foundation: COMPLETE untuk scope foundation. P1.1–P1.9, koneksi, index dan concurrent inserts telah diverifikasi pada database test terisolasi. Berikutnya Phase 2 — Authentication & Multi-Tenancy; belum dimulai.**

- Validasi environment server-only dengan Zod tersedia melalui `getServerEnv()` di `src/lib/env.ts`.
- Validasi lazy: import tidak membaca/memvalidasi environment; pemanggil backend harus memanggil fungsi saat runtime sebelum memakai konfigurasi.
- Required: `MONGODB_URI` (format dasar connection string MongoDB) dan `MONGODB_DB_NAME` (nama valid, kurang dari 64 byte UTF-8). Error hanya memuat nama variabel, tanpa nilai atau log secret.
- Auth library belum dipilih; belum ada variabel auth wajib atau secret baru.
- Helper MongoDB server-only tersedia di `src/lib/mongodb.ts`: `getMongoClient(): Promise<MongoClient>` dan `getDb(): Promise<Db>`. Tidak ada validasi environment atau koneksi pada import.
- Cache promise berbagi koneksi pending/sukses; development memakai `globalThis` untuk hot reload, production memakai cache modul per proses. Konfigurasi koneksi sukses tetap sampai proses restart. Jangan menutup shared client per request.
- Kegagalan constructor/connect disanitasi tanpa raw error/cause/log secret; client gagal ditutup, cache dikosongkan untuk retry. Server selection timeout 10 detik. Tidak ada retry loop otomatis.
- Read-only connection test Atlas development berhasil pada 2026-10-18 menggunakan getDb() dan command ping (ok=1). Tidak ada record, koleksi atau index yang dibuat/diubah/dihapus oleh tes ini. CRUD/auth belum diimplementasikan; Phase 0 tidak diaudit ulang secara menyeluruh.
- Shared domain types tersedia di `src/types/`: union domain, dokumen persistence sesuai schema, dan DTO JSON dengan string ID/timestamp serta tanpa `passwordHash` pengguna. Semua ekspor memakai `export type`.
- Fondasi DAL server-only tersedia di `src/lib/dal/`: mapping 11 koleksi inti, accessor tenant/lokasi/platform, handle bertipe tanpa raw Collection/Db, dan pembentuk filter scope `$and`. Tidak ada operasi CRUD.
- Akses DAL runtime masih tertutup: titik integrasi otorisasi selalu melempar error sebelum `getDb()`. Phase 2 wajib menggantinya dengan validasi sesi/membership/izin/lokasi terpercaya; belum ada autentikasi atau database row-level security.
- Setup index server-only tersedia melalui `setupDatabaseIndexes()` di `src/lib/database-indexes.ts`: 31 index pada 11 koleksi inti + idempotencyKeys. Dijalankan eksplisit pada Atlas database test acak setelah persetujuan owner; rerun verified. Tidak dipasang ke development/production. Nama koleksi dibagi dengan DAL di `src/lib/collection-names.ts`.
- Server error contract tersedia di `src/lib/errors.ts`: AppError dengan 8 kode stabil, pemetaan HTTP, pesan Indonesia tetap, normalizeError() dan field-level reasons tanpa nilai sensitif. Belum diintegrasikan ke endpoint/auth/CRUD/helper existing.
- Shared validation schemas server-only tersedia di `src/lib/validations/`: vehicle entry/update, cancellation, tariff, checkout, prepaid registration/deposit/refund, pagination/date range/search, dan adapter issue Zod ke AppError aman. Tidak ada workflow/write/API/auth baru.
- Vitest setup telah direview: default Node/isolation/discovery memadai untuk seluruh 8 file/165 tes; tanpa config/dependency baru. `pnpm test:watch` ditambahkan; workflow dan gaps terdokumentasi di TESTING_STRATEGY.md.
- P1.9 mencakup suite offline dan integration opt-in terpisah. Normal suite terkini: 9 file/196 tes lulus; suite offline tidak membuka MongoDB live. Atlas guard baru menambah 6 tes menjadi 18 guard tests.
- Empat integration tests Atlas lulus setelah explicit approval dan opt-in: index enforcement, partial uniqueness, concurrent duplicate rejection, serta setup index/rerun. Semua operasi hanya pada database test baru; fixtures/index dipertahankan tanpa drop otomatis.
- Next planned phase: **Phase 2 — Authentication & Multi-Tenancy** (belum dimulai).

## 5. Confirmed business decisions

- Jenis kendaraan MVP: Motor, Mobil.
- Tarif dikonfigurasi per tenant/lokasi/jenis kendaraan; Reguler/Menginap dipilih staff saat checkout.
- Menginap menggunakan jumlah malam integer positif; tidak auto-switch lewat tengah malam.
- Cash/QRIS dikonfirmasi manual; prepaid hanya jika saldo aktif mencukupi; tidak ada split payment.
- Prepaid adalah saldo uang per plat dan lokasi, bukan paket kunjungan; potong hanya saat checkout sukses.
- Deposit bukan pendapatan layanan parkir; refund hanya owner/admin berizin.
- Pembatalan aktif yang memenuhi syarat tidak menghasilkan revenue/deduction, tetapi tetap tercatat.
- Multi-tenant, staff location scope, server authorization, audit, idempotency, atomic financial writes wajib.
- Online-first; tanpa offline write queue, cetak struk, export laporan, atau integrasi gateway otomatis dalam MVP.
- Subscription plans/limits editable via platform admin; harga final belum ditentukan.

## 6. Technical decisions

- Next.js App Router, React, TypeScript strict, Tailwind v4, pnpm.
- MongoDB Atlas + official Node.js driver, Zod.
- Established authentication library yang kompatibel dengan versi Next.js aktual; jangan membuat custom crypto.
- Vitest unit/integration; Playwright E2E.
- Server-side data access tenant-scoped; MongoDB transactions untuk financial multi-document operations.
- Preserve `<!-- BEGIN:nextjs-agent-rules -->` hingga `<!-- END:nextjs-agent-rules -->` dalam `AGENTS.md`; jangan overwrite generated block.

## 7. Open decisions / blockers

- **Phase 1 closure:** seluruh foundation acceptance criteria telah terverifikasi. Tidak ada blocker Phase 1 yang tersisa. Pengujian auth/CRUD/financial transaction workflows menunggu fase implementasinya; staging/deployment existing-data compatibility tetap prosedur terpisah, bukan diklaim lulus dari test DB.

- Pilihan auth library dan strategi email reset belum difinalisasi.
- Deployment/hosting, domain, observability, email provider, dan backup plan belum difinalisasi.
- Harga paket subscription dan limit final belum difinalisasi.
- Pilihan komponen UI/library (jika perlu) belum difinalisasi.
- Struktur aktual repo, script test, dan environment belum diperiksa ulang.

## 8. Next actions (urut)

**Update P1.9 (2026-10-18):** Phase 1 complete setelah live tests database test terisolasi dan semua checks lulus. Next: Phase 2 — Authentication & Multi-Tenancy. Daftar berikut merupakan baseline historis sebelum P1.1, bukan daftar pekerjaan aktif terbaru.

1. `git status --short` dan `git log -1 --oneline` — baca saja, jangan reset.
2. Verifikasi 12 file dokumentasi dan isi `AGENTS.md`.
3. Periksa `.gitignore` dan pastikan `.env.local` tidak tracked; `.env.example` boleh tracked.
4. Review `README.md` sebelum mengganti scaffold.
5. Jalankan `pnpm install --frozen-lockfile` jika diperlukan, `pnpm lint`, `pnpm build`.
6. Update bagian environment/status dengan hasil nyata.
7. Mulai **P1.1 — environment validation with Zod** sebagai satu task kecil.
8. Uji, laporkan hasil, dan commit hanya setelah persetujuan/aturan workflow pengguna.

## 9. Change log

| Tanggal | Perubahan | Status |
|---|---|---|
| 2026-10-17 | Paket 4 dokumen penutup disiapkan | Belum diverifikasi di repo lokal |
| 2026-10-17 | P1.1: environment validation server-only, Zod, contoh environment, tes terfokus | 17 tes, lint, typecheck, dan build lulus |
| 2026-10-17 | P1.2: MongoDB connection helper lazy dengan reuse, development HMR cache, dan safe retry | 26 tes total, lint, typecheck, dan build lulus |
| 2026-10-17 | P1.3: shared domain documents, JSON DTOs, union types, dan pemeriksaan tipe terfokus | 30 tes total, lint, typecheck, dan build lulus |
| 2026-10-17 | P1.4: fondasi DAL server-only, collection mapping, scope guard dan integrasi otorisasi tertutup | 25 tes DAL, 55 tes total, lint, typecheck, dan build lulus |
| 2026-10-17 | P1.5: controlled index setup, 31 index termasuk partial uniqueness dan idempotency | 34 tes index, 89 tes total, lint, typecheck, dan build lulus; belum live |
| 2026-10-17 | P1.6: server-only AppError, normalisasi respons aman, HTTP mapping, field validation reasons | 26 tes error, 115 tes total, lint, typecheck, dan build lulus |
| 2026-10-18 | P1.7: shared strict Zod schemas, normalisasi plat, conditional input rules, safe validation errors | 50 tes validasi, 165 tes total, lint, typecheck, dan build lulus |
| 2026-10-18 | P1.8: Vitest setup/discovery/isolation review, explicit watch script, workflow docs | 8 file/165 tes, shuffled suite, watch rerun, lint, typecheck, build lulus |
| 2026-10-18 | P1.9: foundation test gaps + guarded opt-in local MongoDB suite | 185 tes offline lulus; 4 live checks belum dijalankan; Phase 1 belum complete |
| 2026-10-18 | Read-only Atlas development connection test melalui getDb() dan ping | 1 tes lulus; tanpa data/index writes; temporary code dihapus |
| 2026-10-18 | Review lanjutan P1.9: production cache boundary, pending authorization, mutable ObjectId scope | 119 tes terfokus/190 tes penuh lulus; 4 integration write checks tetap pending |
| 2026-10-18 | P1.9 approved Atlas isolated test run dan penutupan Phase 1 | 4 live/196 offline tests, lint/typecheck/build lulus; Phase 1 complete |

### Milestone: Phase 1 complete — approved Atlas integration verification
- Date: 2026-10-18.
- Authorization: user secara eksplisit menyetujui perluasan minimal guard Atlas dan index/write hanya pada database test acak baru memakai koneksi existing. Tidak memberi izin mengubah data/index development atau drop otomatis.
- Isolation: Atlas mode hanya aktif lewat RUN_MONGODB_INTEGRATION=I_APPROVE_ATLAS_TEST_WRITES. Membaca konfigurasi .env.local tanpa mencetak/mengubah file; URI harus mongodb+srv host .mongodb.net, path aplikasi dibuang, dbName selalu dihasilkan runner dan tidak menerima caller override. Empty-namespace preflight sebelum setup/write; shared getDb() memakai dbName test. UUID penuh disimpan dengan prefix pendek tpk_t_ agar nama 38 byte sesuai Atlas Free limits; local mode legacy tetap tersedia.
- Actual test database: `tpk_t_fddf793a3e2e4ec1b0ffc6001a8fc81a`. Ini database test baru, terpisah dari development/production. 31 explicit indexes di 12 koleksi; synthetic fixtures/index dipertahankan. Tidak drop database/koleksi, tidak delete records atau mengubah development database. Client ditutup dan opt-in environment dipulihkan setelah run.
- Live result: `pnpm test:integration --reporter=verbose --silent=false` lulus **4/4 tes, 1 file, 0 gagal**, total 6,39 detik. Memverifikasi initialization/rerun listIndexes tetap sama; partial unique active sessions dengan tenant/location/history exceptions; concurrent completed-payment/posted-debit uniqueness; account/idempotency compound uniqueness. Competing inserts menghasilkan satu sukses dan satu duplicate-key 11000.
- Failures resolved: dua percobaan awal berhenti pada empty-namespace preflight sebelum index setup/fixture writes (4 tests tidak dieksekusi tiap percobaan). Nama test lama melebihi batas 38-byte Atlas Free; prefix Atlas dipendekkan tanpa mengurangi UUID, lalu live suite lulus. Typecheck parseEnv Dict<string> awal diperbaiki menjadi string|undefined map. Diagnostics hanya stage/kategori/numeric code, tidak raw driver message/credential.
- Post-live verification: **196/196 offline tests, 9 file, 0 gagal**; **18/18 guard tests**; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus. Build memakai environment existing tanpa mencetak nilai dan tidak menjalankan test writes. Tidak ada dependency baru.
- Files changed sesi ini: `tests/integration/target.ts`, `target.test.ts`, `foundation.integration.ts`, `README.md`, `vitest.integration.config.mts` (setup timeout 60 detik untuk Atlas), `TESTING_STRATEGY.md`, `HANDOFF.md`, `IMPLEMENTATION_PLAN.md` (P1.1–P1.9 checked dengan evidence). Production helper/index/DAL logic dan schema tidak diubah; runner existing dipertahankan, bukan dibangun ulang.
- Acceptance: koneksi development ping sebelumnya lulus; Zod environment/types/DAL/error/validation/unit testing tersedia; approved live connection/index enforcement/concurrent insert tests lulus; lint/typecheck/build dan docs terverifikasi. **Phase 1 complete**. Hasil ini bukan verifikasi auth, financial transaction rollback/reconciliation, atau production-data compatibility yang di luar foundation scope.
- Next phase: **Phase 2 — Authentication & Multi-Tenancy**, belum dimulai. Tidak mengimplementasikan fitur Phase 2.
- Recommended Git checkpoint: `feat: establish application architecture`. Review diff existing work dan pastikan secrets tetap ignored sebelum user memilih commit. Tidak melakukan commit atau push.

### Review lanjutan: P1.9 — Database Foundation Tests
- Date: 2026-10-18.
- Verified status: cakupan existing direview dan dipertahankan; 5 tes tambahan mengisi gaps konkret tanpa perubahan production logic, dependency, schema, auth, CRUD atau UI.
- Files changed sesi ini: `src/lib/mongodb.test.ts` (1 tes production mengabaikan leftover development global cache), `src/lib/dal/collections.test.ts` (3 tes delayed authorization denial sebelum DB dan 1 tes mutasi byte ObjectId asal), `tests/integration/README.md`, `TESTING_STRATEGY.md`, `HANDOFF.md`. Config/script integrasi existing tidak diubah.
- Existing coverage reviewed: concurrent/reused connection, safe retry dan pending cleanup melewati development HMR, production module cache, fail-closed authorization, tenant/location filter override, 31 index definitions/partial uniqueness/idempotent rerun/mid-setup conflict, database error sanitization. Tidak menambah tes duplikat pada perilaku yang sudah tercakup.
- Verification terbaru: focused `pnpm test src/lib/mongodb.test.ts src/lib/dal src/lib/database-indexes.test.ts src/lib/errors.test.ts tests/integration/target.test.ts` lulus **119/119 tes, 6 file**. Full `pnpm test` lulus **190/190 tes, 9 file, 0 gagal**. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus tanpa kegagalan. Discovery memuat hanya 9 offline test files, bukan .integration.ts. Build memuat .env.local tanpa menampilkan nilai dan memakai izin network untuk font existing; tidak mengeksekusi database setup/write.
- Integration readiness: harness existing tetap opt-in melalui test:integration/config terpisah; token persetujuan eksplisit, URI loopback khusus test tanpa credentials/path, menolak app DB variables, nama database test acak per run, empty-namespace preflight, tanpa automatic drop/delete. Atlas/remote termasuk development ditolak oleh harness. Live write/index creation membutuhkan persetujuan eksplisit dan service test terisolasi. Tidak menjalankan integration suite atau setupDatabaseIndexes terhadap Atlas pada review ini.
- Live status: read-only development Atlas ping sebelumnya **berhasil**; itu tidak membuktikan unique index enforcement atau concurrent writes. Empat integration checks tetap **belum dijalankan live**. Phase 1 belum complete; outstanding test-database/index/concurrency verification dicatat, bukan dianggap lulus dari mock.
- Next planned phase: **Phase 2 — Authentication & Multi-Tenancy**, belum dimulai.
- Git checkpoint: tidak ada commit/push; existing work dipertahankan.

### Verification: Atlas development connection (read-only)
- Date: 2026-10-18.
- Verified status: berhasil. `.env.local` tersedia dan ignored Git; kedua variabel MongoDB wajib terisi. Pemeriksaan hanya mengeluarkan boolean, tanpa nilai. Host cocok Atlas dan database cocok target development yang diharapkan.
- Method: temporary server-side Vitest file dengan mock marker server-only saja; helper getDb()/MongoClient tetap nyata. Memuat `.env.local`, memanggil getDb(), menjalankan `{ ping: 1 }`, memastikan ok=1, lalu menutup shared client dalam proses tes khusus. Tidak memakai DAL authorization bypass atau live integration write suite.
- Results: percobaan pertama di sandbox timeout 30 detik. Pengulangan dengan akses jaringan di luar sandbox lulus **1/1 tes** (test sekitar 2,87 detik, total 3,22 detik). Karena konfigurasi sama berhasil di luar sandbox, pembatasan jaringan sandbox merupakan kemungkinan penyebab timeout awal; bukan bukti kredensial salah. `.env.local` semula belum ada saat inspeksi awal, lalu tersedia sebelum eksekusi tes.
- Scope: hanya connection/auth handshake dan ping. Tidak ada insert/update/delete, collection/index creation, migration, auth feature change, commit atau push. Temporary `src/lib/atlas-development-ping.temporary.test.ts` sudah dihapus; perubahan permanen sesi ini hanya HANDOFF.md. Tidak ada kredensial/connection strings/database values yang dicetak.
- Remaining: ping tidak membuktikan write permissions, financial atomicity, unique index enforcement atau concurrency. Tidak menjalankan 4 integration write checks dan tidak menandai Phase 1 complete.
- Next planned phase: Phase 2 — Authentication & Multi-Tenancy; blocker verifikasi index/concurrency Phase 1 tetap dicatat.

### Milestone: Phase 1 / P1.9
- Date: 2026-10-18.
- Verified status: deliverables lokal tersedia, mock/guard tests lulus; **Phase 1 belum complete** sampai live connection/index/concurrency diverifikasi pada dedicated test database dengan persetujuan eksplisit.
- Files changed: `src/lib/mongodb.test.ts`, `src/lib/dal/collections.test.ts`, `src/lib/database-indexes.test.ts`, `src/lib/errors.test.ts`, `package.json`, `TESTING_STRATEGY.md`, `HANDOFF.md`. Files created: `vitest.integration.config.mts`, `tests/integration/target.ts`, `target.test.ts`, `foundation.integration.ts`, `README.md`. Tidak ada perubahan production logic, dependency, schema, business rules atau auth/CRUD/API/UI.
- New offline coverage: 2 connection tests (development/production cleanup pending dan retry concurrent; development HMR sebelum cleanup selesai), 2 index tests (mid-setup conflict/rerun, acquisition failure), 3 DAL tests (tenant/location _id guard, platform audit guard, malformed tenant in location context), 1 DB error unknown-commit sanitization, 12 integration target guard tests. Existing partial/index/reuse/authorization/validation checks tetap dipertahankan.
- Integration design: separate test:integration script/config, live files memakai suffix .integration.ts yang tidak cocok normal discovery. Guard membutuhkan explicit RUN_MONGODB_INTEGRATION token dan MONGODB_TEST_URI loopback-only tanpa credentials/path atau opsi arbitrary; menolak app database variables. Database random per run tednco_parkir_test_<UUID> dan empty-namespace preflight sebelum index/write; tidak ada fallback app database. Tidak drop/delete/index teardown; fixtures ditinggal untuk inspeksi dan client ditutup/restores env. Local tunnel/server identity tetap harus direview operator; URI syntax bukan bukti service terisolasi. Atlas/remote tidak didukung harness awal dan tidak dibutuhkan untuk deliverable ini.
- Four pending live checks: connection helper reuse + 31-index rerun/listIndexes, competing active plates dengan tenant/location/history exceptions, completed payments/posted debit references, account/idempotency compound uniqueness. Menggunakan fixture writes langsung untuk index, bukan CRUD repository atau financial workflow. Belum membuktikan auth, real transaction rollback/reconciliation, idempotent business responses, performa, atau deployment-data readiness.
- Verification: focused command untuk MongoDB/DAL/index/errors/target guard lulus **114 tes / 6 file**; `pnpm test` lulus **185/185 tes / 9 file, 0 gagal**. Normal discovery tidak mencakup 4 live checks. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus setelah typecheck awal fixture ProcessEnv gagal (Next mewajibkan NODE_ENV); helper test environment kini readonly string map. Build memakai akses jaringan untuk font existing. Tidak ada live connection/write.
- Negative integration safety check: opt-in sengaja dinonaktifkan; `pnpm test:integration` ditolak di beforeAll (Vitest exit 1), **1 suite refused / 4 tests not executed**, sebelum connection helper dimuat. Bukan integration pass dan bukan kegagalan suite offline. Shell wrapper finally mengembalikan status shell 0 tetapi output pnpm/Vitest menyatakan exit 1; hasil dilaporkan berdasarkan runner. Tidak menjalankan jalur live-approved.
- Remaining blockers: dapatkan approval untuk dedicated disposable MongoDB test service lalu jalankan 4 live checks sesuai README, verifikasi hasil aktual sebelum menyatakan Phase 1 complete. Cleanup data bukan bagian otomatis suite. Staging existing-data/index compatibility terpisah dari harness fresh test DB.
- Next planned phase: **Phase 2 — Authentication & Multi-Tenancy**. Belum mengimplementasikan phase tersebut.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.8
- Date: 2026-10-18.
- Verified status: review selesai; tidak ditemukan alasan konkret untuk config Vitest baru atau rewrite tests. Vitest existing 4.1.12 memakai default Node, globals false, file isolation true. Semua 8 file TS tests ditemukan dan dijalankan; TS strict mencakup source/test, static assertions diperiksa terpisah oleh tsc.
- Files changed: `package.json` (menambah `test:watch: vitest --watch`), `TESTING_STRATEGY.md` (perintah, setup, cleanup, mock/offline boundaries, gaps), `HANDOFF.md`. Tidak ada dependency, lockfile, production code atau test existing diubah oleh task ini.
- Commands: `pnpm test` semua tes sekali; `pnpm test <path>` satu file/direktori; `pnpm test:watch [path]` watch eksplisit, r rerun dan q quit; `pnpm exec tsc --noEmit` static checks. Tidak menambahkan config environment/include/exclude/plugin yang belum dibutuhkan.
- Review evidence: real MongoClient dimock pada helper tests; getDb dimock pada DAL/index tests; type imports/ObjectId/MongoServerError tidak membuka koneksi. Fixture environment sintetis, tidak memuat .env.local atau memerlukan secrets/network. Hoisted module mocks bekerja; file isolation default tetap aktif. Module cache/global HMR cache direset pada MongoDB tests, env stubs dipulihkan dan spies dibersihkan. Tidak ada live client/fixture database yang perlu ditutup. Current runtime imports relatif; runtime alias @/* belum diuji/diperlukan, sehingga tidak memasang alias plugin spekulatif. Tidak ada global network-denial harness; offline status berasal dari review jalur import/mock dan suite yang lulus di sandbox terbatas.
- Verification: `pnpm exec vitest list --filesOnly` menemukan tepat 8 file, cocok dengan file test di disk. `pnpm test` lulus 165/165 tes di 8/8 file (0 gagal). Shuffled single-worker audit seed 20261018 juga lulus 165/165. Watch satu file env lulus 17 tes pada run awal dan 17 pada rerun dalam proses sama; keluar normal (exit 0). `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus. Build memakai akses jaringan untuk font scaffold existing, terpisah dari suite offline. Tidak ada kegagalan test/lint/typecheck/build.
- P1.9 gaps: index failure di tengah setup dan rerun setelah partial progress; failed development connection cache melalui module reload; scope boundary tambahan. Rancang MongoDB integration opt-in terisolasi dengan guard target test, fixture cleanup dan replica set sesuai kebutuhan sebelum membuktikan unique index enforcement/idempotency/concurrency/transactions nyata. Mock tests tidak membuktikan enforcement/performa. Auth/CRUD/financial/E2E coverage tetap menunggu implementasinya.
- Next task: **P1.9 — Database Foundation Tests**.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.7
- Date: 2026-10-18.
- Verified status: selesai. Files created under `src/lib/validations/`: `common.ts`, `vehicle.ts`, `parking.ts`, `prepaid.ts`, `filters.ts`, `errors.ts`, `index.ts`, `validations.test.ts`, `README.md`. File changed: `HANDOFF.md`. Tidak ada dependency baru atau perubahan kode existing.
- Coverage: vehicle entry dan partial update nonempty; cancellation dengan conditional note; tariff positive integer IDR; explicit checkout tariff/payment dengan overnight nightCount positif; prepaid registration/deposit cash/qris dan refund amount/reason; pagination, date range, parking search.
- Validation decisions: semua object strict dan tidak coercive; menolak unexpected tenantId/locationId/staffId/timestamps, normalizedPlate dari client, calculated totals, prepaid balances dan confirmation/split fields. Runtime enums dicocokkan secara exhaustive ke union domain; deposit method merupakan subset paymentMethod. Monetary values dan nightCount safe integers, positive kecuali cashReceived/nonNegativeIdrSchema mengizinkan nol. Kecukupan saldo/tunai dan hasil kalkulasi tetap perlu server checks. Regular nightCount dan noncash cashReceived ditolak agar stale fields tidak diam-diam diabaikan.
- Plate/text semantics: plate wajib nonblank, display trim+uppercase dan internal spacing dipertahankan; matching normalizedPlate dihitung server dengan menghapus whitespace. Tanpa regex regional yang tidak dispesifikasikan. Optional text boleh omitted/undefined atau string (termasuk empty setelah trim), tidak nullable. Tidak menetapkan database unset semantics. Plate update menghitung ulang normalizedPlate hanya bila plate disuplai.
- Safe errors: toValidationError(ZodError, staticPublicFields) memilih hanya path satu-segmen allowlisted dan kode alasan aman/deduplicated; tidak membaca/menyalin pesan issue, input values, unknown keys atau nested paths. Hasil AppError VALIDATION_ERROR dikirim melalui normalizeError dengan allowlist server yang sama. Root/unknown-key errors tetap generic 400. Tidak ada logging/retry.
- Specification ambiguities: cancellationReason persistence masih string tanpa machine-code union; schema memakai 5 label BUSINESS_RULE.md (Lainnya = other), tidak mengarang enum English. Refund transfer belum terwakili ledger enum; refund request hanya amount/reason, tanpa method/status/transfer fields atau keputusan refund penuh/sebagian. Batas panjang teks/format phone/page size/default pagination belum ditentukan; belum menetapkan product caps. page/pageSize, search, from/to, dan initial-deposit amount adalah input conventions terdokumentasi, bukan persisted fields baru. Date range memvalidasi ISO calendar dates dan urutan saja; preset, timezone bounds dan end inclusivity perlu ditentukan pada query layer. Input target resource ID belum dalam body; validasi ID/otorisasi wajib pada future boundary. Semua keterbatasan dijelaskan dalam README validasi.
- Remaining server integration: authenticate/authorize, trusted tenant/location/staff, validasi kepemilikan resource, status active/unpaid untuk cancel, duplicate active session checks/index, hitung tarif/total aman, prepaid/refund sufficiency, QRIS confirmation, audit/idempotency/atomic writes. Parse sukses bukan bukti pembayaran/deposit/refund berhasil dan tidak mengaktifkan prepaid. Tetapkan reviewed request-size/text/page-size caps sebelum endpoint dibuka.
- Verification: focused `pnpm test src/lib/validations` lulus 50 tes; full `pnpm test` lulus 165 tes. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus tanpa kegagalan pemeriksaan. Build memakai akses jaringan untuk font scaffold existing. Tidak ada koneksi database live.
- Next task: **P1.8 — Vitest Setup Review**.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.6
- Date: 2026-10-17.
- Verified status: selesai. Files created: `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/lib/errors.md`. File changed: `HANDOFF.md`. Tidak ada dependency baru, endpoint/action, auth, CRUD, schema validasi atau perubahan helper existing.
- Codes/HTTP: VALIDATION_ERROR 400, UNAUTHENTICATED 401, FORBIDDEN 403, RESOURCE_NOT_FOUND 404, CONFLICT 409, BUSINESS_RULE_VIOLATION 422, SERVICE_UNAVAILABLE 503, INTERNAL_ERROR 500. Pesan client berasal dari katalog Indonesia tetap; constructor tidak menerima pesan bebas atau raw cause.
- Response: normalizeError(error, publicFields?) menghasilkan `{ status, body: { ok: false, error: { code, message, fieldErrors? } } }`. Hanya AppError yang terdaftar pada WeakMap internal dikenali; duck-typed codes, driver/Zod errors, primitive values dan properti publik mutable tidak menentukan respons. Unknown selalu 500 tanpa stack/cause/message mentah. Tidak ada logging/retry. Raw causes tidak disimpan karena berpotensi berisi secrets; kebutuhan diagnostics future harus memakai metadata internal yang ditinjau dan disanitasi.
- Validation fields: field/reason-code pairs saja; REQUIRED/INVALID/TOO_SMALL/TOO_LARGE dipetakan ke pesan tetap. Nama field hanya muncul bila cocok allowlist statis milik server; default tidak mengekspos field. Tidak menyertakan input values, raw Zod messages atau batas dinamis. Mapping schema issues ditunda ke P1.7.
- Future boundary pattern: Route Handler menggunakan normalized.body/status dari satu hasil; Server Action memakai expected-error return state sesuai local Next.js docs. Catch harus sempit pada application work; redirect/notFound/framework control flow tidak boleh ditelan normalizer. Hanya body hasil normalisasi yang diserialisasi. Tidak ada wrapper endpoint/action terpasang.
- Financial safety: error bukan bukti rollback atau commit gagal. Tidak pernah mengubah kegagalan menjadi sukses atau retry otomatis; unknown commit/timeout harus diperiksa lewat persisted status dan future idempotency/reconciliation sebelum retry berizin. Tidak ada logic checkout/prepaid atau keputusan finansial baru.
- Remaining integration: env/MongoDB/DAL/index errors existing tetap generic Error dan dinormalisasi menjadi INTERNAL_ERROR sampai layer aplikasi/repository memetakan secara eksplisit. Duplicate-key driver errors tidak otomatis dianggap CONFLICT tanpa konteks bisnis. Otorisasi Phase 2 masih tertutup. Tidak ada monitoring/logging framework atau diagnostics cause pipeline.
- Verification: `pnpm test src/lib/errors.test.ts` lulus 26 tes; full `pnpm test` lulus 115 tes. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus tanpa kegagalan pemeriksaan. Build memakai akses jaringan untuk font scaffold existing. Tidak ada koneksi database live.
- Next task: **P1.7 — Shared Validation Schemas**.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.5
- Date: 2026-10-17.
- Verified status: implementasi lokal selesai; belum terhubung atau menerapkan index ke MongoDB live.
- Files created: `src/lib/collection-names.ts`, `src/lib/database-indexes.ts`, `src/lib/database-indexes.test.ts`, `src/lib/database-indexes.md`. Files changed: `src/lib/dal/collections.ts` (memakai nama bersama), `src/lib/dal/README.md`, `HANDOFF.md`. Tidak ada dependency baru atau perubahan domain types.
- Definitions: 31 index pada 11 koleksi inti dan idempotencyKeys; mencakup lookup tenant/lokasi, unique slug/email/membership, kendaraan/plat, sesi aktif/riwayat, tarif, pembayaran/riwayat transaksi, unique akun prepaid, ledger, audit, dan key idempotency unik tenant/actor/operation/key. Compound key mempertahankan urutan dan arah timestamp schema. Tidak ada TTL atau index subscription tanpa spesifikasi eksplisit.
- Active uniqueness: unique tenantId/locationId/normalizedPlateSnapshot, partial status active. Tidak membatasi histori completed/canceled atau tenant/lokasi berbeda. Tidak ada mismatch field/status sesi aktif dengan schema.
- Schema choices: transaksi memakai partial unique tenantId/parkingSessionId untuk status completed (schema bagian 11 mengizinkan uniqueness berbasis status; model satu dokumen final belum ditetapkan). Tidak menerapkan unconditional uniqueness yang akan mengunci pending/voided. Ledger memakai partial unique tenantId/referenceId untuk parking_debit + posted + parking_transaction sesuai bagian 13. Tidak mengubah aturan adjustment/refund. Idempotency memakai field schema bagian 15 walau tipe persistence/accessor pendukung belum dibuat; tidak menambah CRUD. Mapping user dapat membutuhkan migrasi setelah auth dipilih.
- Safety: setupDatabaseIndexes() memakai getDb() langsung khusus maintenance deployment, terpisah dari DAL/auth/CRUD. Import tidak mengakses DB. Tidak ada startup/request integration. createIndexes dengan nama/options stabil dapat diulang; conflict/duplicate menghentikan setup dengan error tersanitasi tanpa cause/log/duplicate values. Tidak drop/recreate, syncIndexes atau memperbaiki data. Setup antar-koleksi tidak atomic; index sebelumnya dapat sudah terbuat saat kegagalan. Rerun hanya setelah masalah ditinjau. Membuat index saat fungsi dijalankan dapat membuat koleksi yang belum ada secara implisit.
- Deployment: panduan staging/production di `src/lib/database-indexes.md`; inspect listIndexes dan existing duplicate groups/required normalized data secara aman sebelum build, backup dan maintenance window, jalankan fungsi dari trusted Node server deployment runner lalu verifikasi index dan concurrency staging. Belum ada CLI runner terpasang; jangan memanggil fungsi melalui API/request/startup. Unique index pada data duplikat dapat gagal; koreksi data perlu prosedur terpisah, bukan penghapusan otomatis. Shared MongoClient tidak ditutup oleh fungsi.
- Verification: focused `pnpm test src/lib/database-indexes.test.ts` lulus 34 tes; full `pnpm test` lulus 89 tes; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` lulus. Typecheck awal gagal pada inferensi union key IndexDescription; diperbaiki dengan return type eksplisit lalu checks diulang. Build memakai akses jaringan untuk font scaffold existing. Mock hanya membuktikan definisi, opsi, rerun dan stop-on-error; belum membuktikan enforcement/performa/live-data readiness.
- Next task: **P1.6 — Server Error Handling**.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.4
- Date: 2026-10-17.
- Verified status: fondasi selesai. File baru `src/lib/dal/authorization.ts`, `collections.ts`, `index.ts`, `collections.test.ts`, `authorization.test.ts`, dan `README.md`. File diubah: `HANDOFF.md`. Tidak ada dependency atau domain type yang diubah.
- Collections: 11 koleksi inti sesuai DATABASE_SCHEMA.md menggunakan tipe persistence existing dan `getDb()`. Tidak membuat koleksi/index; supporting collections subscription/idempotency ditunda sampai tipe dan scope fiturnya tersedia, tanpa fallback untyped.
- Scoping: accessor tenant untuk tenants (`_id`), locations, memberships, vehicles, auditLogs; accessor lokasi untuk locations (`_id` + tenantId), parkingSessions, tariffs, parkingTransactions, prepaidAccounts, prepaidLedger, auditLogs (tenantId + locationId). Platform accessor terpisah untuk tenants/users/platform auditLogs; audit platform mensyaratkan tenantId dan locationId tidak ada. Nama koleksi dibatasi pada compile time dan runtime; tidak ada akses platform ke koleksi operasional tenant.
- Access boundary: handle menyimpan Collection bertipe dan scope secara private; hanya mengekspos collectionName/scopedFilter. `$and` menjaga guard dari overwrite criteria. ID scope disnapshot dan filter baru memakai ObjectId baru. Tidak ada raw collection getter, callback query, CRUD atau arbitrary pipeline. Metode repository sempit yang mengeksekusi query harus ditambahkan kemudian di dalam boundary yang sama, menerapkan scope saat eksekusi dan memastikan scope write tidak dapat diubah.
- Authorization limitation: requireTenantContext/requireLocationContext/requirePlatformAccess selalu menolak sebelum akses database. Tidak menerima ID/context dari caller, tidak mengasumsikan tenant berizin, tidak ada fake auth. Tes memakai mock integration points. Phase 2 harus memvalidasi identitas, status, membership, permission spesifik dan kepemilikan/akses lokasi. Tenant-wide access harus diberi izin eksplisit, bukan otomatis untuk staff berbatas lokasi. getDb() existing masih merupakan API infrastructure rendah yang dapat melewati DAL bila diimpor langsung; future feature repositories/UI tidak boleh memakainya. Ini bukan bukti otorisasi pengguna atau isolasi database live.
- Verification: `pnpm test src/lib/dal` lulus 25 tes; full `pnpm test` lulus 55 tes; `pnpm lint`, `pnpm exec tsc --noEmit`, dan `pnpm build` lulus. Typecheck awal gagal pada normalisasi generik Filter/WithId driver di `$and`; diperbaiki dengan cast lokal yang didokumentasikan, lalu seluruh checks diulang dan lulus. Build memakai akses jaringan untuk font scaffold existing. Tidak ada koneksi database live.
- Next task: **P1.5 — Database Indexes**. Jalur index maintenance harus dipisahkan dari otorisasi aplikasi dan tidak dijalankan otomatis saat import; task ini belum membuat index.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.3
- Date: 2026-10-17.
- Verified status: selesai. Domain types mencakup Tenant, Location, User, Membership, Role, Permission, Vehicle, ParkingSession/ParkingStatus, Tariff/TariffType, ParkingTransaction/PaymentMethod, PrepaidAccount, PrepaidLedgerEntry (alias PrepaidLedger), dan AuditLog.
- Files created: `src/types/shared.ts`, `src/types/documents.ts`, `src/types/dtos.ts`, `src/types/index.ts`, `src/types/domain.test.ts`, `src/types/README.md`. File changed: `HANDOFF.md`. Tidak ada dependency baru atau perubahan helper existing.
- Decisions: nama interface persistence mengikuti DATABASE_SCHEMA.md bagian 4–14; ObjectId hanya dipakai untuk dokumen persistence lewat import type. DTO mempertahankan nama field dan optionality, mengganti ID ke hex string dan timestamp UTC ke ISO 8601 string. `UserDto` mengecualikan `passwordHash`; audit DTO membatasi snapshot ke nilai JSON. Deklarasi tipe bukan serializer/redactor dan tidak memberi akses data; mapping server eksplisit tetap wajib.
- Money/timestamps: `IdrAmount = number` mendokumentasikan integer Rupiah. Integer, safe numeric range, saldo nonnegatif, nightCount positif, dan lifecycle invariants harus divalidasi saat runtime pada task berikutnya. Timestamps persistence adalah BSON Date UTC; konversi timezone hanya untuk tampilan. Operating hours tetap string jam lokal sesuai schema.
- Specification ambiguities: file aturan bisnis sebenarnya `BUSINESS_RULE.md` (judul BUSINESS_RULES.md), digunakan tanpa rename. Permission memakai daftar contoh AUTH_AND_TENANCY.md bagian 9 sebagai vocabulary terpusat, tanpa default grants; permission khusus koreksi waktu masuk belum memiliki key. Konvensi arah/tanda adjustment ledger dan referensi reversal belum lengkap. Aturan refund mengizinkan transfer, sementara enum ledger hanya cash/qris/prepaid; tidak menambah enum/field baru. User passwordHash mengikuti schema existing; mapping auth masih menunggu pemilihan library. Detail juga dicatat di `src/types/README.md`.
- Tests: full `pnpm test` lulus 30 tes (26 existing + 4 kelompok pemeriksaan tipe). `pnpm exec tsc --noEmit` memverifikasi assertion expectTypeOf; runtime Vitest saja bukan bukti pemeriksaan tipe. `pnpm lint` dan `pnpm build` lulus. Build memakai akses jaringan untuk font scaffold existing.
- Scope preserved: tidak ada validation schemas, business logic, serializer, koleksi/index, CRUD, API routes, UI, atau implementasi autentikasi. Tidak ada koneksi database live.
- Next task: **P1.4 — Database Access Layer**.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.2
- Date: 2026-10-17.
- Verified status: selesai. Tes MongoDB memakai mock driver dan environment sintetis; tidak memerlukan database live.
- Files changed: `src/lib/mongodb.ts`, `src/lib/mongodb.test.ts`, `package.json`, `pnpm-lock.yaml`, `HANDOFF.md`. Modul/test environment P1.1 tetap dipertahankan.
- Dependency: official MongoDB Node.js Driver `mongodb` 7.7.0; tanpa ODM/ORM atau dependency tambahan lain.
- Tests: tes terfokus MongoDB lulus; full `pnpm test` lulus 26 tes (9 MongoDB + 17 environment); `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, dan `pnpm peers check` lulus. Build dijalankan dengan akses jaringan untuk font scaffold existing.
- Acceptance checked: import lazy, validasi Zod reused, koneksi concurrent dideduplikasi, reuse setelah sukses, pending connection bertahan saat development module reload, production tidak menulis global cache, configured database bertipe `Db`, kegagalan constructor/connect/cleanup aman dan dapat dicoba ulang.
- Known issues: `pnpm add mongodb` memasang driver dan memperbarui lockfile tetapi exit 1 dengan `ERR_PNPM_IGNORED_BUILDS` karena script `unrs-resolver@1.12.2` existing diblokir. Kebijakan script tidak diubah; seluruh verifikasi lulus. Konektivitas Atlas, kredensial, dan deployment live belum diverifikasi. Tiap proses/instance deployment memiliki pool sendiri. Helper ini belum menyediakan authorization atau isolasi query tenant; wajib ditambahkan pada access layer berikutnya.
- Scope preserved: tidak ada koleksi/index, CRUD, endpoint, UI, autentikasi, atau perubahan schema. Tidak ada koneksi database live selama pekerjaan ini.
- Next task: **P1.3 — Shared Domain Types**.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

### Milestone: Phase 1 / P1.1
- Date: 2026-10-17.
- Verified status: selesai; `pnpm test` (17 passed), `pnpm lint`, `pnpm exec tsc --noEmit`, dan `pnpm build` lulus. `pnpm peers check` tidak menemukan masalah.
- Files changed: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.example`, `.gitignore`, `package.json`, `pnpm-lock.yaml`, `HANDOFF.md`.
- Dependencies: Zod 4, `server-only`, Vitest 4 (sesuai deklarasi tipe Node 20 existing); script `pnpm test` menjalankan Vitest sekali tanpa watch. Belum menyiapkan integration/E2E suite P1.8.
- Decisions: `.env.example` belum ada saat inspeksi; file baru memakai nama MongoDB dari `env.example` existing. `env.example` lama dipertahankan, termasuk placeholder auth provisional; gunakan `.env.example` baru untuk P1.1. `.gitignore` mengizinkan template baru tersebut. Variabel auth baru ditentukan setelah library dipilih.
- Known issues: instalasi pnpm berhasil menulis dependency/lockfile tetapi exit 1 dengan `ERR_PNPM_IGNORED_BUILDS` karena script `unrs-resolver@1.12.2` diblokir; tidak mengubah kebijakan build script. Semua checks di atas tetap lulus. Build awal gagal mengunduh Google Fonts dari sandbox; pengulangan dengan akses jaringan lulus tanpa perubahan UI. Validasi URI hanya memeriksa format dasar, bukan konektivitas, kredensial, DNS, atau seluruh opsi driver; ini untuk P1.2 dan integrasi berikutnya.
- Preservation: perubahan dokumentasi existing dan file untracked pengguna dipertahankan. Status Git dibaca memakai `-c safe.directory=D:/Project/tednco-parkir` karena kepemilikan berbeda; tidak mengubah Git config global.
- Next task: **P1.2 — Setup MongoDB connection helper**. Jangan menganggap koneksi database telah diuji.
- Git checkpoint: tidak ada commit atau push sesuai instruksi pengguna.

## 10. Template update milestone

```md
### Milestone: <phase/task>
- Date:
- Verified status:
- Files changed:
- Tests run and results:
- Decisions:
- Known issues:
- Next task:
- Git checkpoint (if any):
```

**Agent instruction:** Mulai sesi dengan membaca handoff ini dan file spesifikasi relevan. Verifikasi fakta terhadap repo; jangan mengubah status berdasarkan asumsi. Jangan melakukan audit besar atau refactor di luar task.
