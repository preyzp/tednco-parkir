# IMPLEMENTATION_PLAN.md — TednCo Parkir

> Technical Implementation Roadmap  
> Product: TednCo Parkir  
> Version: 1.0 — MVP  
> Package Manager: pnpm  
> Development Strategy: Incremental, testable, and AI-agent-friendly

---

## 1. Purpose

Dokumen ini menentukan urutan implementasi TednCo Parkir dari project scaffold sampai siap digunakan oleh pengguna awal.

Tujuan utamanya:

- Menghindari implementasi fitur secara acak.
- Menjaga konsistensi arsitektur.
- Mempermudah pekerjaan AI coding agent.
- Menghemat penggunaan token AI.
- Mengurangi risiko regression.
- Memastikan setiap fitur dapat diuji sebelum melanjutkan.
- Menjaga dokumentasi dan source code tetap sinkron.

Dokumen ini harus digunakan bersama:

- `AGENTS.md`
- `PRD.md`
- `BUSINESS_RULES.md`
- `DATABASE_SCHEMA.md`
- `AUTH_AND_TENANCY.md`
- `SUBSCRIPTION_SPEC.md`
- `DESIGN_SPEC.md`
- `TESTING_STRATEGY.md`
- `HANDOFF.md`

Jika ada konflik spesifikasi, jangan membuat asumsi diam-diam. Identifikasi konflik dan selesaikan sebelum implementasi terkait.

---

## 2. Technology Stack

| Layer            | Technology                                       |
| ---------------- | ------------------------------------------------ |
| Framework        | Next.js 16 App Router                            |
| Language         | TypeScript (strict)                              |
| UI               | React 19                                         |
| Styling          | Tailwind CSS v4                                  |
| Database         | MongoDB Atlas                                    |
| Database Driver  | Official MongoDB Node.js Driver                  |
| Validation       | Zod                                              |
| Authentication   | Established auth library compatible with Next.js |
| Unit Testing     | Vitest                                           |
| E2E Testing      | Playwright                                       |
| Package Manager  | pnpm                                             |
| Deployment       | To be finalized                                  |
| Application Type | Responsive Web App + PWA                         |

### Technical Rules

- Jangan mengganti framework tanpa persetujuan.
- Gunakan pnpm untuk dependency management.
- Jangan menambahkan ORM tanpa kebutuhan yang disetujui.
- Jangan membuat custom password hashing atau session cryptography.
- Jangan hardcode tarif, tenant ID, permission, atau subscription limit.
- Gunakan server-side validation untuk semua operasi.
- Semua akses data harus tenant-scoped.
- Semua operasi finansial harus aman terhadap retry dan concurrency.
- Jangan membuat offline transaction queue pada MVP.

---

## 3. Development Workflow

Setiap task harus mengikuti siklus berikut:

1. Baca `HANDOFF.md` dan dokumentasi yang relevan.
2. Periksa file yang berkaitan dengan task.
3. Implementasikan satu perubahan terfokus.
4. Jalankan pengujian yang relevan.
5. Jalankan lint/typecheck/build jika sesuai.
6. Perbaiki error yang muncul.
7. Laporkan file yang berubah dan hasil pengujian.
8. Update `HANDOFF.md` setelah milestone selesai.
9. Buat Git checkpoint setelah perubahan diverifikasi.

### AI Agent Constraints

- Jangan melakukan audit seluruh repository untuk task kecil.
- Jangan melakukan refactor yang tidak diminta.
- Jangan mengubah fitur yang sudah berjalan tanpa kebutuhan.
- Jangan mengimplementasikan task fase berikutnya.
- Jangan menghapus dokumentasi existing.
- Jangan melakukan Git push tanpa instruksi.
- Jangan mengklaim task selesai jika tes gagal.
- Jika menemukan blocker, jelaskan secara ringkas sebelum melakukan perubahan besar.

---

## 4. Implementation Phases

<escape>### Phase 0 — Project Foundation & Documentation</escape>

**Goal:** Menyiapkan repository dan spesifikasi sebelum coding fitur.

#### Tasks

- [ ] P0.1 — Verifikasi scaffold Next.js.
- [ ] P0.2 — Verifikasi pnpm dan lockfile.
- [ ] P0.3 — Lengkapi dokumentasi produk.
- [ ] P0.4 — Buat `HANDOFF.md`.
- [ ] P0.5 — Buat `.env.example`.
- [ ] P0.6 — Perbarui `README.md`.
- [ ] P0.7 — Verifikasi `.gitignore`.
- [ ] P0.8 — Jalankan baseline lint dan build.

#### Definition of Done

- Dokumentasi tersedia.
- Project dapat dijalankan secara lokal.
- pnpm digunakan secara konsisten.
- Tidak ada secrets dalam repository.
- Baseline lint dan build berhasil.

**Git checkpoint:** `chore: complete project foundation`

---

<escape>### Phase 1 — Architecture & Database Foundation</escape>

**Goal:** Menyiapkan fondasi aplikasi dan database.

#### Tasks

- [x] P1.1 — Setup environment validation dengan Zod.
- [x] P1.2 — Setup MongoDB connection helper.
- [x] P1.3 — Definisikan shared domain types.
- [x] P1.4 — Buat database collection access layer.
- [x] P1.5 — Buat database indexes sesuai schema.
- [x] P1.6 — Buat server-side error handling pattern.
- [x] P1.7 — Buat shared validation schemas.
- [x] P1.8 — Setup Vitest.
- [x] P1.9 — Tambahkan database foundation tests.

Verified 2026-10-18: 196 offline tests, 4 approved Atlas integration tests,
lint/typecheck/build passed. Indexes applied only to an isolated random test
database, not development/production. See HANDOFF.md for evidence and limits.

#### Architecture Principles

- Server-only database access.
- Jangan mengakses MongoDB langsung dari client components.
- Pisahkan validation, authorization, dan persistence.
- Gunakan data access functions yang konsisten.
- Jangan percaya tenant ID dari request body.
- Gunakan timestamp UTC untuk persistence dan format lokal pada UI.
- Pastikan database indexes mendukung tenant/location scoping.

#### Definition of Done

- Koneksi database bekerja.
- Environment validation bekerja.
- Shared types tersedia.
- Database indexes dibuat dengan aman.
- Foundation tests berhasil.

**Git checkpoint:** `feat: establish application architecture`

---

<escape>### Phase 2 — Authentication & Multi-Tenancy</escape>

**Goal:** Membuat login dan isolasi tenant yang aman.

#### Tasks

- [ ] P2.1 — Integrasi authentication library.
- [ ] P2.2 — Implementasi login.
- [ ] P2.3 — Implementasi logout.
- [ ] P2.4 — Implementasi secure session handling.
- [ ] P2.5 — Implementasi password reset.
- [ ] P2.6 — Implementasi users dan tenant memberships.
- [ ] P2.7 — Implementasi active tenant context.
- [ ] P2.8 — Implementasi location authorization.
- [ ] P2.9 — Implementasi role/permission checks.
- [ ] P2.10 — Implementasi protected application routes.
- [ ] P2.11 — Implementasi audit logging foundation.
- [ ] P2.12 — Tambahkan authentication dan tenancy tests.

#### Role Support

- Platform Admin.
- Owner.
- Admin.
- Staff.

Satu user dapat memiliki membership dan role berbeda pada tenant berbeda.

#### Definition of Done

- User dapat login dan logout.
- Session aman.
- User hanya dapat mengakses tenant yang diizinkan.
- Staff hanya dapat mengakses lokasi yang ditugaskan.
- Permission diverifikasi di server.
- Unauthorized requests ditolak.
- Password reset aman.
- Security tests berhasil.

**Git checkpoint:** `feat: implement authentication and tenancy`

---

<escape>### Phase 3 — Design System & Application Shell</escape>

**Goal:** Menyiapkan UI foundation sesuai `DESIGN_SPEC.md`.

#### Tasks

- [ ] P3.1 — Setup design tokens.
- [ ] P3.2 — Integrasi Inter.
- [ ] P3.3 — Implementasi Button, Input, Select, Badge.
- [ ] P3.4 — Implementasi Card, Dialog, dan feedback components.
- [ ] P3.5 — Implementasi desktop sidebar.
- [ ] P3.6 — Implementasi mobile navigation.
- [ ] P3.7 — Implementasi page header.
- [ ] P3.8 — Implementasi active location selector.
- [ ] P3.9 — Implementasi loading/empty/error states.
- [ ] P3.10 — Implementasi dashboard shell.
- [ ] P3.11 — Tambahkan responsive dan accessibility checks.

#### Definition of Done

- UI responsive.
- Navigation berfungsi.
- Active tenant/location context terlihat sesuai kebutuhan.
- Komponen menggunakan design tokens.
- Tidak ada placeholder action yang menyesatkan.
- Dashboard shell siap menerima data nyata.

**Git checkpoint:** `feat: build application shell`

---

<escape>### Phase 4 — Vehicle Entry & Active Parking</escape>

**Goal:** Membuat alur kendaraan masuk dan daftar kendaraan aktif.

#### Tasks

- [ ] P4.1 — Implementasi vehicle validation.
- [ ] P4.2 — Implementasi plate normalization.
- [ ] P4.3 — Implementasi reusable vehicle records.
- [ ] P4.4 — Implementasi create parking session.
- [ ] P4.5 — Implementasi duplicate active session prevention.
- [ ] P4.6 — Implementasi vehicle entry form.
- [ ] P4.7 — Implementasi active parking list.
- [ ] P4.8 — Implementasi partial plate search.
- [ ] P4.9 — Implementasi vehicle type filter.
- [ ] P4.10 — Implementasi active session detail.
- [ ] P4.11 — Implementasi edit active vehicle details.
- [ ] P4.12 — Implementasi cancellation with reason.
- [ ] P4.13 — Implementasi authorized entry-time correction.
- [ ] P4.14 — Tambahkan parking session tests.

#### Important Rules

- Jenis kendaraan hanya Motor dan Mobil pada MVP.
- Nomor polisi wajib.
- Cegah duplikasi sesi aktif sesuai aturan tenant/lokasi.
- Cancellation hanya untuk sesi aktif yang belum dibayar dan kendaraan tidak benar-benar parkir.
- Cancellation tidak menghasilkan revenue.
- Semua perubahan sensitif harus diaudit.

#### Definition of Done

- Kendaraan dapat masuk.
- Kendaraan aktif muncul pada lokasi yang benar.
- Search dan filter bekerja.
- Duplicate entry ditolak.
- Detail dan edit bekerja sesuai permission.
- Cancellation tercatat tanpa menghapus histori.
- Cross-tenant access ditolak.

**Git checkpoint:** `feat: implement parking entry and active sessions`

---

<escape>### Phase 5 — Tariffs, Checkout & History</escape>

**Goal:** Menyelesaikan alur kendaraan keluar dan pembayaran.

#### Tasks

- [ ] P5.1 — Implementasi tariff configuration.
- [ ] P5.2 — Implementasi tariff lookup per lokasi/jenis kendaraan.
- [ ] P5.3 — Implementasi regular fee calculation.
- [ ] P5.4 — Implementasi overnight fee calculation.
- [ ] P5.5 — Implementasi checkout preview.
- [ ] P5.6 — Implementasi Cash payment confirmation.
- [ ] P5.7 — Implementasi manual QRIS confirmation.
- [ ] P5.8 — Implementasi transaction snapshots.
- [ ] P5.9 — Implementasi atomic checkout persistence.
- [ ] P5.10 — Implementasi idempotency and duplicate prevention.
- [ ] P5.11 — Implementasi parking history.
- [ ] P5.12 — Implementasi transaction detail.
- [ ] P5.13 — Implementasi audited completed transaction correction.
- [ ] P5.14 — Tambahkan checkout dan concurrency tests.

#### Important Rules

- Reguler/Menginap dipilih secara eksplisit.
- Menginap membutuhkan `nightCount` positif.
- Jangan otomatis memilih Menginap berdasarkan jam.
- Tidak ada split payment.
- QRIS memerlukan konfirmasi manual.
- Checkout harus aman dari double-click dan retry.
- Simpan snapshot tarif.
- Sesi selesai tidak boleh dibayar dua kali.

#### Definition of Done

- Checkout Cash/QRIS bekerja.
- Total tarif benar.
- Riwayat tercatat.
- Snapshot transaksi tersimpan.
- Double payment dicegah.
- Koreksi memerlukan izin dan audit.
- Tidak ada transaksi sukses palsu.

**Git checkpoint:** `feat: implement parking checkout and history`

---

<escape>### Phase 6 — Prepaid Management</escape>

**Goal:** Membuat sistem saldo prepaid yang aman.

#### Tasks

- [ ] P6.1 — Implementasi prepaid account model.
- [ ] P6.2 — Implementasi prepaid registration.
- [ ] P6.3 — Implementasi initial deposit.
- [ ] P6.4 — Implementasi additional deposit.
- [ ] P6.5 — Implementasi prepaid ledger.
- [ ] P6.6 — Implementasi balance calculation and integrity checks.
- [ ] P6.7 — Integrasi prepaid ke checkout.
- [ ] P6.8 — Implementasi atomic prepaid deduction.
- [ ] P6.9 — Implementasi insufficient balance fallback.
- [ ] P6.10 — Implementasi prepaid account detail.
- [ ] P6.11 — Implementasi authorized refund.
- [ ] P6.12 — Implementasi pending transfer refund handling.
- [ ] P6.13 — Implementasi prepaid activation/deactivation.
- [ ] P6.14 — Implementasi audited balance adjustment.
- [ ] P6.15 — Tambahkan prepaid financial tests.

#### Important Rules

- Saldo prepaid adalah nominal uang.
- Tidak ada paket kunjungan/hari pada MVP.
- Saldo terikat kendaraan dan lokasi.
- Deposit bukan pendapatan layanan parkir.
- Saldo hanya dipotong setelah checkout prepaid berhasil.
- Tidak ada pemotongan parsial.
- Saldo tidak boleh negatif.
- Refund hanya owner/admin berizin.
- Semua perubahan saldo memiliki ledger.
- Semua financial writes harus atomic dan idempotent.

#### Definition of Done

- Deposit tercatat.
- Saldo benar.
- Prepaid checkout berhasil.
- Saldo tidak cukup ditangani dengan benar.
- Refund bekerja sesuai permission.
- Ledger konsisten.
- Concurrent deductions tidak menyebabkan saldo negatif.

**Git checkpoint:** `feat: implement prepaid balance management`

---

<escape>### Phase 7 — Reports, Settings & Subscription Administration</escape>

**Goal:** Menyelesaikan kebutuhan administratif MVP.

#### Tasks

- [ ] P7.1 — Implementasi dashboard operational metrics.
- [ ] P7.2 — Implementasi parking reports.
- [ ] P7.3 — Implementasi prepaid reports.
- [ ] P7.4 — Implementasi date range filters.
- [ ] P7.5 — Implementasi staff/location/payment filters.
- [ ] P7.6 — Implementasi business profile settings.
- [ ] P7.7 — Implementasi location settings.
- [ ] P7.8 — Implementasi operating hours settings.
- [ ] P7.9 — Implementasi staff management.
- [ ] P7.10 — Implementasi configurable permissions.
- [ ] P7.11 — Implementasi subscription plan management.
- [ ] P7.12 — Implementasi tenant subscription status.
- [ ] P7.13 — Implementasi manual invoice/payment administration.
- [ ] P7.14 — Implementasi backend subscription feature/limit enforcement.
- [ ] P7.15 — Tambahkan report dan subscription tests.

#### Important Rules

- Pendapatan parkir berbeda dari deposit prepaid.
- Laporan mengikuti tanggal transaksi yang tepat.
- Data dibatasi tenant/lokasi.
- Staff financial access mengikuti permission.
- Subscription prices/limits editable tanpa redeploy.
- Expired subscription tidak menghapus data.
- Subscription tidak boleh menghalangi pengembangan core parking flow.

#### Implementation Priority

Selesaikan laporan dan settings operasional terlebih dahulu.

Subscription administration dapat dibagi menjadi subfase setelah core parking stabil.

Jangan mengaktifkan limit subscription sebelum ada kebijakan akses dan mekanisme administrasi yang dapat digunakan.

#### Definition of Done

- Laporan benar.
- Settings tersimpan.
- Staff permissions diterapkan.
- Subscription plans dapat dikelola.
- Status subscription dapat ditampilkan.
- Backend memvalidasi feature/limit sesuai konfigurasi.

**Git checkpoint:** `feat: complete reports and administration`

---

<escape>### Phase 8 — PWA, QA & Deployment</escape>

**Goal:** Menyiapkan aplikasi untuk pilot penggunaan nyata.

#### Tasks

- [ ] P8.1 — Setup PWA manifest.
- [ ] P8.2 — Setup app icons.
- [ ] P8.3 — Implementasi online/offline status feedback.
- [ ] P8.4 — Verifikasi tidak ada offline financial write queue.
- [ ] P8.5 — Setup Playwright E2E.
- [ ] P8.6 — Jalankan critical user journey tests.
- [ ] P8.7 — Jalankan authorization/security tests.
- [ ] P8.8 — Jalankan concurrency/idempotency tests.
- [ ] P8.9 — Jalankan responsive checks.
- [ ] P8.10 — Jalankan accessibility checks.
- [ ] P8.11 — Setup production environment.
- [ ] P8.12 — Setup database indexes di production.
- [ ] P8.13 — Setup monitoring dan error logging.
- [ ] P8.14 — Verifikasi backup/recovery strategy.
- [ ] P8.15 — Deploy staging.
- [ ] P8.16 — Jalankan pilot acceptance testing.
- [ ] P8.17 — Deploy production setelah approval.

#### Definition of Done

- Aplikasi installable sebagai PWA.
- Critical journeys berhasil.
- Tidak ada critical security issue yang diketahui.
- Transaksi aman saat retry.
- Production secrets terkonfigurasi.
- Monitoring tersedia.
- Backup/recovery sudah diverifikasi.
- Pilot user dapat menggunakan aplikasi.

**Git checkpoint:** `chore: prepare MVP release`

---

## 5. Dependency Order

Urutan utama:

```text
Documentation
     |
     v
Architecture & Database
     |
     v
Authentication & Tenancy
     |
     v
Design System & App Shell
     |
     v
Vehicle Entry & Active Parking
     |
     v
Tariffs & Checkout
     |
     v
Prepaid
     |
     v
Reports & Administration
     |
     v
PWA, QA & Deployment
```

Beberapa pekerjaan UI dapat dikembangkan bersamaan dengan backend jika kontrak datanya sudah jelas.

Namun jangan menjalankan financial operations sebelum authorization, validation, dan database integrity siap.

---

## 6. Task Size Guidelines

Satu prompt coding agent idealnya menyelesaikan:

- Satu komponen.
- Satu endpoint/server action.
- Satu validation schema.
- Satu workflow kecil.
- Satu kelompok test terkait.

Hindari prompt seperti:

"Build the entire parking system."

Gunakan prompt seperti:

"Implement server-side plate normalization and validation with unit tests, following BUSINESS_RULES.md. Do not modify unrelated files."

### Task Completion Report

Setiap coding task harus menghasilkan ringkasan:

1. Implementasi yang selesai.
2. File yang dibuat/diubah.
3. Tests yang dijalankan.
4. Hasil tests.
5. Blocker atau risiko.
6. Task berikutnya yang direkomendasikan.

---

## 7. Testing Gates

### Per Task

- Relevant unit tests.
- TypeScript checks untuk file terkait.
- Lint untuk perubahan terkait.

### Per Phase

- Relevant integration tests.
- Regression tests untuk workflow terdampak.
- Full typecheck.
- Full lint.
- Production build.

### Before Production

- Critical E2E journeys.
- Tenant isolation tests.
- Permission tests.
- Financial idempotency tests.
- Concurrency tests.
- PWA behavior tests.
- Security checks.

Gunakan `TESTING_STRATEGY.md` sebagai referensi rinci.

---

## 8. Financial Integrity Gate

Sebelum fitur finansial dianggap selesai, verifikasi:

- Server-side validation.
- Authorized tenant/location context.
- Permission checks.
- Atomic database updates.
- Idempotency key handling.
- Duplicate submission protection.
- Correct transaction snapshots.
- Audit logging.
- No negative prepaid balance.
- No duplicate prepaid deduction.
- No duplicate checkout.
- Safe retry behavior.
- Accurate reporting classification.

MongoDB multi-document transactions memerlukan deployment yang mendukung transaksi, misalnya MongoDB Atlas replica set.

Jangan mengganti atomic transaction dengan beberapa operasi terpisah yang dapat meninggalkan saldo atau ledger tidak konsisten.

---

## 9. Git Strategy

Gunakan branch existing sesuai repository.

Untuk MVP solo development, commit kecil dan terarah dapat dilakukan pada branch kerja utama, selama perubahan sudah diuji.

### Commit Convention

- `chore:` project setup.
- `feat:` new feature.
- `fix:` bug fix.
- `refactor:` behavior-preserving changes.
- `test:` tests.
- `docs:` documentation.

### Git Safety

- Jangan force push.
- Jangan reset perubahan user tanpa izin.
- Jangan menghapus untracked files sembarangan.
- Jangan commit `.env` atau secrets.
- Jangan push otomatis.
- Sebelum commit, periksa `git status` dan file diff.

---

## 10. HANDOFF.md Update Rules

Update `HANDOFF.md` ketika:

- Sebuah phase selesai.
- Architecture decision berubah.
- Ada blocker penting.
- Ada perubahan database schema.
- Ada perubahan business rules.
- Ada keputusan dependency baru.
- Sebuah milestone sudah diverifikasi.

Minimal catat:

- Current phase.
- Completed tasks.
- Pending tasks.
- Files changed.
- Tests passed/failed.
- Known issues.
- Next recommended task.
- Latest Git checkpoint.

Jangan mengubah `HANDOFF.md` menjadi log panjang setiap command.

---

## 11. Definition of MVP Complete

TednCo Parkir MVP dianggap selesai ketika:

- User dapat login dengan aman.
- Tenant dan location isolation bekerja.
- Owner/admin/staff memiliki permission yang benar.
- Kendaraan dapat masuk dan tercatat.
- Kendaraan aktif dapat dicari.
- Kendaraan dapat checkout.
- Tarif Reguler/Menginap dihitung dengan benar.
- Pembayaran Cash/QRIS dapat dikonfirmasi.
- Prepaid deposit, deduction, refund, dan ledger bekerja.
- Riwayat parkir tersedia.
- Laporan operasional dan prepaid tersedia.
- Settings utama dapat dikonfigurasi.
- Subscription dapat dikelola sesuai scope MVP.
- Aplikasi responsive dan installable.
- Critical tests berhasil.
- Tidak ada known critical financial integrity issue.
- Deployment dan recovery sudah diverifikasi.
- Pilot acceptance testing selesai.

---

## 12. Immediate Next Steps

Setelah seluruh dokumentasi selesai:

1. Verifikasi repository dan scaffold.
2. Lengkapi `.env.example`.
3. Finalisasi `HANDOFF.md`.
4. Jalankan baseline lint/build.
5. Mulai Phase 1, Task P1.1.
6. Implementasikan task berikutnya secara berurutan.
7. Perbarui handoff pada milestone.
8. Commit setelah verifikasi.

**Do not begin implementation before the documentation baseline is ready.**

---

## 13. Final Development Principle

**Build the smallest correct feature, verify it, preserve it, then continue.**

Prioritas pengembangan TednCo Parkir:

1. Correctness.
2. Security.
3. Financial integrity.
4. Operational usability.
5. Maintainability.
6. Visual refinement.

Kecepatan pengembangan tidak boleh mengorbankan keamanan transaksi atau integritas data.
