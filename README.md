# TednCo Parkir

Aplikasi manajemen parkir berbasis SaaS/PWA untuk operator parkir skala kecil. Mendukung pencatatan kendaraan masuk, kendaraan aktif, checkout, pembayaran manual, saldo prepaid, riwayat, dan laporan.

> **Status:** Project scaffold dan dokumentasi MVP. Implementasi fitur belum diverifikasi selesai. README ini tidak mengklaim aplikasi sudah production-ready.

## Fitur yang direncanakan untuk MVP

- Login, role `owner`/`admin`/`staff`, tenant dan location access.
- Kendaraan Motor/Mobil: entry, pencarian plat, detail, edit, pembatalan beralasan.
- Tarif Reguler dan Menginap yang dikonfigurasi per lokasi/jenis kendaraan.
- Checkout Cash/QRIS (verifikasi manual), tanpa split payment.
- Prepaid saldo uang: deposit, deduction saat checkout, refund berizin, ledger.
- Riwayat dan laporan operasional/keuangan terpisah dari deposit prepaid.
- Subscription administration dan configurable plan settings.
- Responsive PWA, online-first; **tanpa transaksi offline**.

## Tech stack

- Next.js 16 App Router, React 19, TypeScript.
- Tailwind CSS v4, Inter.
- pnpm.
- MongoDB Atlas (official MongoDB Node.js driver), Zod — direncanakan untuk implementasi.
- Vitest dan Playwright — direncanakan untuk testing.

## Requirements

- Node.js versi yang kompatibel dengan `package.json` dan Next.js; environment terakhir dilaporkan menggunakan Node `24.11.1`.
- pnpm sesuai versi/konfigurasi repository.
- MongoDB Atlas test/development database untuk fase database, dengan dukungan transactions.

## Local development

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:3000`.

Untuk pemeriksaan baseline (jika scripts tersedia):

```bash
pnpm lint
pnpm build
```

Cek `package.json` untuk script test/typecheck aktual. Jangan menganggap semua script testing sudah ditambahkan.

## Environment configuration

1. Salin `.env.example` menjadi `.env.local`.
2. Isi nilai yang dibutuhkan untuk fitur yang sedang diimplementasikan.
3. Jangan commit `.env.local`, API keys, database credentials, atau auth secrets.
4. Pastikan secret hanya dibaca di server dan tidak memakai prefix `NEXT_PUBLIC_`.

Contoh Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Nama env untuk authentication/email dapat berubah mengikuti library/provider yang dipilih. Cocokkan dengan implementation sebelum dipakai.

## Project documentation

| File | Isi |
|---|---|
| `AGENTS.md` | Aturan AI coding agent dan Next.js |
| `PRD.md` | Kebutuhan produk dan scope MVP |
| `BUSINESS_RULES.md` | Aturan parkir, checkout, prepaid, reports |
| `DATABASE_SCHEMA.md` | Collections, indexes, integrity |
| `AUTH_AND_TENANCY.md` | Login, permissions, tenant isolation |
| `SUBSCRIPTION_SPEC.md` | Plans, invoices, subscription statuses |
| `DESIGN_SPEC.md` | UI/UX dan design tokens |
| `IMPLEMENTATION_PLAN.md` | Phase dan task implementasi |
| `TESTING_STRATEGY.md` | Unit, integration, E2E, security gates |
| `HANDOFF.md` | Status terakhir, keputusan, next task |

## Development order

1. Documentation and repo verification.
2. Architecture, environment validation, MongoDB.
3. Authentication, roles, tenant/location authorization.
4. Design system dan app shell.
5. Kendaraan masuk dan daftar aktif.
6. Tariffs, checkout, dan history.
7. Prepaid ledger, deposit, deduction, refund.
8. Reports, settings, subscription admin.
9. PWA, security/QA, staging, pilot, production.

Lihat `IMPLEMENTATION_PLAN.md` untuk task ID dan acceptance criteria.

## Important safety rules

- Semua data access di server harus tenant/location scoped.
- Semua financial operations harus atomic, idempotent, dan server-validated.
- QRIS hanya label/metode pembayaran dengan konfirmasi manual pada MVP; tidak ada payment gateway.
- Saldo prepaid tidak boleh negatif; deposit tidak dihitung sebagai service revenue.
- Tidak ada offline write queue, split payments, atau receipts pada MVP.
- Jangan mengubah `AGENTS.md` generated Next.js block.

## Collaboration / AI agents

Sebelum coding: baca `HANDOFF.md`, `AGENTS.md`, dan dokumen yang relevan. Kerjakan satu task kecil, pertahankan pekerjaan existing, jalankan test yang sesuai, laporkan perubahan dan blocker, lalu update handoff saat milestone terverifikasi. Jangan melakukan push otomatis.

## License

Belum ditentukan. Jangan menganggap repository ini open-source atau bebas digunakan ulang sebelum lisensi ditetapkan.
