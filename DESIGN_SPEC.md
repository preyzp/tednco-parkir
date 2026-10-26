# DESIGN_SPEC.md — TednCo Parkir

> UI/UX Design Specification  
> Product: TednCo Parkir  
> Version: 1.0 — MVP  
> Language: Bahasa Indonesia  
> Default timezone: Asia/Jakarta

---

## 1. Design Overview

TednCo Parkir adalah aplikasi manajemen parkir berbasis SaaS/PWA yang membantu operator parkir mengelola kendaraan masuk, kendaraan keluar, pembayaran, saldo prepaid, dan laporan operasional.

Desain harus mengutamakan:

1. **Speed** — petugas dapat menyelesaikan transaksi dengan cepat.
2. **Clarity** — informasi penting mudah dibaca dan dipahami.
3. **Consistency** — komponen dan pola interaksi konsisten.
4. **Accessibility** — nyaman digunakan di perangkat sentuh maupun desktop.
5. **Reliability** — status transaksi dan kesalahan sistem selalu jelas.

### Design direction

- Modern, clean, minimal.
- Mobile-first, desktop-friendly.
- Professional SaaS interface.
- Neutral background dengan satu warna aksen utama.
- Typography jelas dan mudah dibaca.
- Minim dekorasi yang tidak memiliki fungsi.
- Fokus pada pekerjaan operasional, bukan visual yang berlebihan.

Hindari gradient dekoratif, animasi berlebihan, glassmorphism, dan dashboard yang terlalu padat.

---

## 2. Design Tokens

### 2.1 Color Palette

| Token          | Hex       | Usage                    |
| -------------- | --------- | ------------------------ |
| Primary        | `#059669` | Main CTA, active state   |
| Primary Hover  | `#047857` | Hover primary            |
| Primary Light  | `#D1FAE5` | Selected background      |
| Background     | `#F8FAFC` | Application background   |
| Surface        | `#FFFFFF` | Cards, dialogs, panels   |
| Text Primary   | `#0F172A` | Headings, main content   |
| Text Secondary | `#64748B` | Supporting information   |
| Border         | `#E2E8F0` | Dividers, card borders   |
| Input Border   | `#CBD5E1` | Form fields              |
| Disabled       | `#94A3B8` | Disabled controls        |
| Focus          | `#059669` | Keyboard focus indicator |

### 2.2 Semantic Colors

| Status    | Foreground | Background |
| --------- | ---------- | ---------- |
| Success   | `#16A34A`  | `#F0FDF4`  |
| Warning   | `#D97706`  | `#FFFBEB`  |
| Danger    | `#DC2626`  | `#FEF2F2`  |
| Info      | `#2563EB`  | `#EFF6FF`  |
| Neutral   | `#64748B`  | `#F1F5F9`  |
| Overnight | `#7C3AED`  | `#F5F3FF`  |

Status tidak boleh disampaikan hanya melalui warna. Selalu gunakan teks status dan ikon bila diperlukan.

### 2.3 Typography

Font utama: **Inter**

| Style         | Size | Weight |
| ------------- | ---- | ------ |
| Page Title    | 24px | 700    |
| Section Title | 20px | 600    |
| Card Title    | 16px | 600    |
| Body          | 14px | 400    |
| Body Large    | 16px | 400    |
| Label         | 14px | 500    |
| Caption       | 12px | 400    |
| Button        | 14px | 600    |

Gunakan tabular numbers untuk nilai uang, durasi, dan angka statistik agar mudah dibandingkan.

### 2.4 Spacing

Gunakan sistem kelipatan 4px.

| Token | Value |
| ----- | ----- |
| 1     | 4px   |
| 2     | 8px   |
| 3     | 12px  |
| 4     | 16px  |
| 5     | 20px  |
| 6     | 24px  |
| 8     | 32px  |
| 10    | 40px  |
| 12    | 48px  |

### 2.5 Border Radius

- Small: 6px
- Medium: 10px
- Large: 12px
- Dialog: 16px
- Pill: 9999px

### 2.6 Shadows

Gunakan shadow ringan hanya ketika membantu hierarki visual.

- Cards: subtle shadow atau border.
- Dialog: medium shadow.
- Dropdown: medium shadow.
- Hindari shadow tebal pada seluruh komponen.

---

## 3. Responsive Layout

### 3.1 Breakpoints

| Device  | Width      |
| ------- | ---------- |
| Mobile  | < 640px    |
| Tablet  | 640–1023px |
| Desktop | ≥ 1024px   |

### 3.2 Mobile

- Single-column layout.
- Navigation mudah dijangkau.
- Primary action terlihat jelas.
- Tabel panjang berubah menjadi cards atau horizontal scrolling jika benar-benar diperlukan.
- Form menggunakan full-width fields.
- Checkout dan kendaraan masuk harus mudah digunakan dengan satu tangan.
- Hindari informasi penting tersembunyi di hover.

### 3.3 Desktop

- Sidebar navigation.
- Main content area dengan max-width yang nyaman.
- Data table untuk riwayat dan daftar operasional.
- Filter dapat tampil inline.
- Dialog untuk tindakan sederhana.
- Halaman tersendiri untuk workflow kompleks.

### 3.4 Layout Guidelines

- Mobile page padding: 16px.
- Desktop page padding: 24–32px.
- Card padding: 16–24px.
- Gap antarseksi: 24–32px.
- Minimum interactive touch target: 44×44px; target utama idealnya 48px.

---

## 4. Application Navigation

### 4.1 Main Navigation

1. Beranda
2. Kendaraan Terparkir
3. Riwayat Parkir
4. Prepaid
5. Laporan
6. Pengaturan

**Tambah Kendaraan** adalah primary quick action yang mudah diakses dari Beranda dan Kendaraan Terparkir.

### 4.2 Desktop Navigation

Gunakan sidebar berisi:

- Logo TednCo Parkir.
- Navigation items.
- Active navigation indicator.
- Location selector jika user memiliki akses ke lebih dari satu lokasi.
- Profile/account menu.
- Logout.

### 4.3 Mobile Navigation

Gunakan navigasi ringkas yang mempertahankan akses cepat ke fungsi utama.

Boleh menggunakan bottom navigation untuk destinasi yang paling sering dipakai, dengan menu tambahan untuk destinasi lain.

Jangan memaksakan seluruh enam menu dalam bottom navigation.

### 4.4 Location Context

Lokasi aktif harus terlihat jelas.

User yang hanya memiliki akses satu lokasi tidak perlu terus-menerus memilih lokasi.

Pergantian lokasi harus memperbarui data operasional sesuai izin user.

---

## 5. Page Specifications

### 5.1 Beranda / Dashboard

**Purpose:** Memberikan ringkasan operasional parkir.

#### Components

- Page heading dan lokasi aktif.
- Tombol **Tambah Kendaraan**.
- Total kendaraan sedang parkir.
- Kendaraan masuk hari ini.
- Kendaraan keluar hari ini.
- Pendapatan parkir hari ini, hanya jika role memiliki izin.
- Daftar aktivitas parkir terbaru.

#### Rules

- Dashboard harus sederhana.
- Tidak menampilkan kartu statistik prepaid khusus pada MVP.
- Jangan gunakan grafik kompleks.
- Statistik mengikuti lokasi aktif dan izin user.
- Jika data kosong, tampilkan empty state yang relevan.

---

### 5.2 Kendaraan Terparkir

**Purpose:** Melihat dan mengelola seluruh sesi parkir aktif.

#### Components

- Search nomor polisi.
- Filter jenis kendaraan: Semua, Motor, Mobil.
- Ringkasan jumlah kendaraan aktif.
- Tombol Tambah Kendaraan.
- Active vehicle list.

#### Vehicle Card / Row

Tampilkan:

- Nomor polisi (paling menonjol).
- Jenis kendaraan.
- Waktu masuk.
- Durasi parkir berjalan.
- Nama pelanggan jika tersedia.
- Status prepaid jika relevan.
- Action **Lihat Detail** atau **Checkout**.

#### Rules

- Search mendukung sebagian nomor polisi dan case-insensitive.
- Durasi berjalan hanya informasi, bukan dasar otomatis mengubah tarif.
- Jangan memuat seluruh riwayat dalam daftar aktif.
- Data selalu dibatasi tenant dan lokasi yang diizinkan.

---

### 5.3 Tambah Kendaraan

**Purpose:** Mencatat kendaraan masuk dengan cepat.

#### Form Fields

| Field           | Required |
| --------------- | -------- |
| Nomor Polisi    | Yes      |
| Jenis Kendaraan | Yes      |
| Nama Pelanggan  | No       |
| Nomor Telepon   | No       |
| Catatan         | No       |

#### Primary Action

**Simpan Kendaraan Masuk**

#### Interaction Rules

- Autofocus nomor polisi jika sesuai perangkat dan tidak mengganggu pengalaman mobile.
- Normalisasi nomor polisi dilakukan di server.
- Periksa duplikasi sesi aktif.
- Tampilkan pesan jika kendaraan sudah terparkir.
- Tombol submit memiliki loading state.
- Hindari double submission.
- Setelah berhasil, tampilkan konfirmasi dan data sesi parkir.
- Jangan menganggap berhasil sebelum server mengonfirmasi.

---

### 5.4 Detail Kendaraan Aktif

**Purpose:** Melihat detail sesi dan menjalankan tindakan operasional.

#### Information

- Nomor polisi.
- Jenis kendaraan.
- Waktu masuk.
- Durasi berjalan.
- Nama pelanggan dan kontak jika tersedia.
- Catatan.
- Status prepaid dan saldo bila user memiliki izin.

#### Actions

- Checkout.
- Edit informasi kendaraan.
- Batalkan sesi jika memenuhi aturan.
- Koreksi waktu masuk jika memiliki izin khusus.

#### Cancellation Dialog

Harus menampilkan:

- Identitas kendaraan.
- Pilihan alasan pembatalan.
- Catatan wajib untuk alasan Lainnya.
- Konfirmasi eksplisit.

Pembatalan tidak boleh memotong prepaid atau mencatat pendapatan.

---

### 5.5 Checkout Kendaraan

**Purpose:** Menghitung tarif, memilih pembayaran, dan menyelesaikan parkir.

#### Step 1 — Review Vehicle

- Nomor polisi.
- Jenis kendaraan.
- Waktu masuk.
- Durasi parkir.

#### Step 2 — Select Tariff

- Reguler.
- Menginap.

Jika memilih Menginap, tampilkan input jumlah malam dengan integer positif.

Tarif berasal dari konfigurasi lokasi dan jenis kendaraan.

#### Step 3 — Payment

Tampilkan:

- Tarif yang digunakan.
- Jumlah malam jika menginap.
- Total pembayaran.
- Metode pembayaran yang tersedia.

Payment methods:

- Tunai.
- QRIS.
- Prepaid, hanya jika aktif dan saldo mencukupi.

Jika prepaid tidak mencukupi, tampilkan saldo yang tersedia dan jelaskan bahwa pembayaran dapat dilakukan dengan Tunai atau QRIS.

Jangan tampilkan split payment.

#### Step 4 — Confirmation

Sebelum submit:

- Nomor polisi.
- Tarif.
- Total.
- Metode pembayaran.
- Tombol **Konfirmasi Pembayaran**.

Untuk QRIS, harus ada konfirmasi manual bahwa pembayaran telah diterima.

#### Completion State

Setelah server mengonfirmasi transaksi:

- Tampilkan status Berhasil.
- Nomor polisi.
- Nominal.
- Metode pembayaran.
- Waktu checkout.
- Tombol Kembali ke Kendaraan Terparkir.
- Akses ke detail transaksi.

Tidak perlu membuat struk atau PDF pada MVP.

#### Error Handling

Jika koneksi terputus atau server timeout:

- Jangan langsung menyatakan transaksi gagal atau berhasil.
- Periksa status transaksi terbaru sebelum mengizinkan percobaan ulang.
- Jangan melakukan pembayaran atau pemotongan prepaid ganda.

---

### 5.6 Riwayat Parkir

**Purpose:** Menampilkan sesi parkir selesai dan dibatalkan.

#### Components

- Search nomor polisi.
- Filter tanggal.
- Filter jenis kendaraan.
- Filter status.
- Filter metode pembayaran jika relevan.
- Table atau card list.

#### Columns

- Nomor polisi.
- Jenis kendaraan.
- Waktu masuk.
- Waktu keluar.
- Tarif.
- Pembayaran.
- Status.
- Petugas.

#### Detail

Halaman detail menampilkan snapshot transaksi historis.

Koreksi transaksi selesai hanya dapat dilakukan oleh role yang memiliki izin dan harus meminta alasan.

Jangan menyediakan tombol edit nominal bebas bagi staff.

---

### 5.7 Prepaid

**Purpose:** Mengelola akun saldo prepaid per kendaraan dan lokasi.

#### Prepaid List

- Search nomor polisi.
- Status aktif/nonaktif.
- Saldo.
- Jenis kendaraan.
- Lokasi.
- Last activity.

#### Prepaid Detail

- Identitas kendaraan.
- Saldo saat ini.
- Status akun.
- Riwayat ledger.
- Deposit.
- Pemakaian.
- Refund.
- Adjustment jika diizinkan.

#### Register Prepaid

Fields:

- Nomor polisi.
- Jenis kendaraan.
- Nama/telepon opsional.
- Deposit awal.
- Metode pembayaran.

Akun baru hanya aktif setelah deposit terkonfirmasi.

#### Deposit

- Nominal deposit.
- Metode pembayaran.
- Konfirmasi pembayaran.
- Loading dan success state.

#### Refund

Hanya owner/admin dengan izin.

Refund dialog harus menampilkan:

- Saldo tersedia.
- Nominal refund.
- Metode refund.
- Alasan.
- Konfirmasi.

Refund transfer dapat berstatus pending sampai penyelesaian terverifikasi.

Saldo tidak boleh negatif.

---

### 5.8 Laporan

**Purpose:** Menampilkan laporan operasional dan keuangan.

#### Date Filters

- Hari Ini.
- Kemarin.
- 7 Hari Terakhir.
- Bulan Ini.
- Bulan Lalu.
- Rentang Kustom.

#### Parking Report

- Pendapatan layanan parkir.
- Total kendaraan masuk.
- Total kendaraan keluar.
- Transaksi selesai.
- Pembatalan.
- Daftar transaksi.

#### Prepaid Report

- Total deposit.
- Total pemakaian prepaid.
- Total refund.
- Penyesuaian saldo.
- Total saldo prepaid outstanding.

Deposit prepaid tidak boleh dicampur dengan pendapatan layanan parkir.

#### MVP Restrictions

- Tidak perlu export CSV/Excel.
- Tidak perlu chart kompleks.
- Gunakan statistik ringkas dan tabel.

---

### 5.9 Pengaturan

Group settings menjadi:

1. Profil Usaha.
2. Lokasi Parkir.
3. Tarif Parkir.
4. Jam Operasional.
5. Pengguna dan Staff.
6. Hak Akses.
7. Langganan.
8. Akun Saya.

Menu dan tindakan hanya ditampilkan sesuai izin.

Jam operasional tidak boleh otomatis menentukan Reguler atau Menginap.

Tarif harus mendukung konfigurasi berbeda berdasarkan lokasi dan jenis kendaraan.

---

### 5.10 Platform Admin

Area administratif untuk pengelola TednCo Parkir.

Fitur utama:

- Daftar tenant.
- Detail tenant.
- Daftar subscription plan.
- Pengaturan harga dan batas plan.
- Subscription status.
- Invoice dan verifikasi pembayaran.
- Audit aktivitas administratif.

UI platform admin harus dibedakan secara jelas dari dashboard operator parkir.

Akses lintas tenant hanya untuk fungsi administratif yang sah dan diaudit.

---

## 6. Component System

### Keputusan library dan tema

- Gunakan **shadcn/ui** sebagai basis komponen aplikasi dan **Lucide React** untuk ikon.
- Sediakan pilihan tema **Light / Dark / System**; System mengikuti preferensi perangkat. Label UI Indonesia: Terang / Gelap / Sistem.
- Font Inter dan warna utama emerald `#059669` tetap berlaku. Palet yang tercantum saat ini adalah baseline Light; token Dark dan pengujian kontras diselesaikan pada fase UI.
- Keputusan ini belum merupakan implementasi. Instalasi shadcn/ui, ikon, dan theme provider ditunda ke fase UI; tidak termasuk penutupan Phase 1.

### 6.1 Buttons

Variants:

- Primary.
- Secondary.
- Outline.
- Ghost.
- Destructive.

States:

- Default.
- Hover.
- Focus.
- Disabled.
- Loading.

Satu section sebaiknya memiliki satu primary action utama.

### 6.2 Form Inputs

Components:

- Text Input.
- Number Input.
- Select.
- Search Input.
- Textarea.
- Radio Group.
- Checkbox.
- Date Picker.

Requirements:

- Visible labels.
- Required indicator jika relevan.
- Helper text bila diperlukan.
- Inline validation errors.
- Keyboard accessible.
- Error messages menjelaskan tindakan yang harus dilakukan.

### 6.3 Status Badges

Gunakan label yang jelas, misalnya:

- Aktif.
- Selesai.
- Dibatalkan.
- Menunggu Konfirmasi.
- Berhasil.
- Gagal.
- Prepaid Aktif.
- Prepaid Nonaktif.

Warna harus konsisten dengan semantic tokens.

### 6.4 Cards

Cards digunakan untuk:

- Statistik dashboard.
- Daftar kendaraan pada mobile.
- Ringkasan checkout.
- Saldo prepaid.
- Empty state.

Jangan membungkus setiap teks dalam card jika tidak diperlukan.

### 6.5 Tables

Desktop tables harus mendukung:

- Readable headers.
- Consistent column alignment.
- Numeric values right-aligned.
- Row actions.
- Empty state.
- Loading state.
- Pagination jika data besar.

Mobile boleh menggunakan card list.

### 6.6 Dialogs

Gunakan dialog untuk:

- Konfirmasi pembayaran.
- Pembatalan sesi.
- Refund.
- Tindakan destruktif.
- Konfirmasi perubahan penting.

Dialog harus memiliki judul, konteks, tombol batal, dan action yang eksplisit.

Jangan gunakan dialog bertingkat.

### 6.7 Toast Notifications

Toast untuk feedback nonkritis.

Examples:

- Kendaraan berhasil ditambahkan.
- Data berhasil diperbarui.
- Deposit berhasil dicatat.
- Perubahan berhasil disimpan.

Untuk error finansial atau status transaksi ambigu, gunakan pesan yang tetap terlihat pada halaman, bukan hanya toast sementara.

---

## 7. Loading, Empty, and Error States

### Loading

- Gunakan skeleton untuk daftar atau statistik.
- Loading indicator untuk button submit.
- Disable submit selama request sedang diproses.
- Jangan menampilkan data lama sebagai hasil baru tanpa indikator.

### Empty State

Examples:

**Belum ada kendaraan terparkir**

"Belum ada kendaraan yang sedang parkir di lokasi ini."

Action: Tambah Kendaraan.

**Belum ada riwayat transaksi**

"Transaksi parkir akan muncul di sini setelah checkout berhasil."

**Data tidak ditemukan**

"Tidak ada kendaraan yang cocok dengan pencarian Anda."

Action: Hapus Filter.

### Error State

Pesan error harus menjelaskan masalah dan langkah berikutnya.

Contoh:

- "Nomor polisi ini sudah memiliki sesi parkir aktif."
- "Saldo prepaid tidak mencukupi untuk pembayaran ini."
- "Pembayaran belum dapat dikonfirmasi. Periksa status transaksi sebelum mencoba kembali."
- "Anda tidak memiliki izin untuk melakukan tindakan ini."

Jangan menampilkan raw server errors kepada pengguna.

---

## 8. Interaction Guidelines

### 8.1 Financial Actions

Untuk checkout, deposit, refund, dan adjustment:

- Tampilkan ringkasan nominal sebelum konfirmasi.
- Gunakan loading state.
- Lindungi dari double submission.
- Jangan melakukan optimistic success.
- Tunggu hasil server.
- Jika hasil tidak pasti, cek status transaksi.

### 8.2 Editing

- Field yang diedit harus jelas.
- Simpan dan Batal harus tersedia.
- Perubahan penting harus diaudit.
- Koreksi transaksi selesai memerlukan izin khusus.

### 8.3 Destructive Actions

Gunakan konfirmasi eksplisit untuk:

- Pembatalan parkir.
- Penonaktifan prepaid.
- Refund.
- Perubahan data sensitif.

Tidak boleh menggunakan delete permanen untuk menyembunyikan riwayat operasional.

---

## 9. Accessibility

Requirements:

- Semantic HTML.
- Keyboard navigation.
- Visible focus indicator.
- Input labels terhubung dengan fields.
- Dialog focus management.
- Screen-reader-friendly status messages.
- Contrast sesuai WCAG AA sejauh memungkinkan.
- Minimum touch target 44×44px.
- Jangan mengandalkan warna saja.
- Hormati preferensi reduced motion.
- Hindari animasi yang menghambat pekerjaan petugas.

---

## 10. Localization

### Language

Default Bahasa Indonesia.

Gunakan istilah yang mudah dipahami petugas:

- Kendaraan Masuk.
- Kendaraan Terparkir.
- Checkout.
- Pembayaran.
- Riwayat Parkir.
- Deposit.
- Refund.
- Saldo Prepaid.

Jangan menggunakan istilah teknis database dalam UI.

### Currency

Gunakan format Indonesia.

Examples:

- Rp5.000
- Rp20.000
- Rp100.000

### Date and Time

Default timezone: `Asia/Jakarta`.

Examples:

- 17 Oktober 2026
- 17 Okt 2026, 14.35
- 2 jam 15 menit

Simpan timestamp secara konsisten di backend dan format berdasarkan timezone lokasi saat ditampilkan.

---

## 11. PWA Experience

TednCo Parkir menggunakan pendekatan PWA.

Requirements:

- Responsive layout.
- Installable application.
- App icon dan manifest.
- Mobile-friendly navigation.
- Online-first operation.
- Network error handling.

### Offline Restrictions

MVP tidak mendukung:

- Offline vehicle entry.
- Offline checkout.
- Offline prepaid deduction.
- Offline deposit/refund.
- Background transaction sync.

Jika offline, tampilkan pesan:

"Koneksi internet diperlukan untuk melakukan transaksi."

Jangan menyimpan transaksi finansial ke antrean offline.

---

## 12. Role-Based UI

UI harus mengikuti permission user.

Examples:

- Staff tanpa izin laporan keuangan tidak melihat nominal pendapatan.
- Staff tidak melihat action refund.
- Staff tidak melihat koreksi transaksi selesai tanpa izin.
- Pengaturan tarif hanya tersedia bagi role berwenang.
- Staff hanya melihat lokasi yang ditugaskan.
- Platform admin menggunakan akses administratif tersendiri.

**Important:** Menyembunyikan tombol bukan mekanisme keamanan. Semua permission harus diverifikasi ulang di server.

---

## 13. Implementation Guidelines

- Gunakan Next.js App Router.
- Gunakan Tailwind CSS v4.
- Gunakan Inter.
- Bangun reusable components secara bertahap.
- Hindari membuat design system yang terlalu besar sebelum diperlukan.
- Prioritaskan komponen yang benar-benar dipakai MVP.
- Pertahankan struktur dan kode existing yang masih relevan.
- Jangan menambahkan UI library besar tanpa alasan jelas.
- Ikuti aturan `AGENTS.md`.
- Baca dokumentasi Next.js lokal yang relevan sebelum implementasi.
- Jangan mengimplementasikan fitur di luar MVP hanya karena tersedia dalam library.

### Suggested Component Structure

```text
src/
  components/
    ui/
      button.tsx
      input.tsx
      select.tsx
      badge.tsx
      card.tsx
      dialog.tsx
    layout/
      app-shell.tsx
      sidebar.tsx
      mobile-navigation.tsx
      page-header.tsx
    parking/
      vehicle-card.tsx
      vehicle-form.tsx
      checkout-summary.tsx
    prepaid/
      prepaid-balance.tsx
      prepaid-ledger.tsx
```

Struktur di atas adalah rekomendasi, bukan kewajiban untuk langsung membuat semua file.

---

## 14. Design Acceptance Criteria

Desain MVP dianggap memenuhi spesifikasi jika:

- Seluruh workflow utama dapat digunakan pada mobile dan desktop.
- Kendaraan masuk dapat dicatat dengan langkah minimal.
- Nomor polisi mudah ditemukan.
- Checkout memperlihatkan tarif dan nominal secara jelas.
- Status pembayaran tidak ambigu.
- Refund dan pembatalan memerlukan konfirmasi.
- Saldo prepaid dan riwayatnya mudah dibaca.
- Data laporan membedakan pendapatan parkir dari deposit prepaid.
- Role dan lokasi aktif terlihat sesuai kebutuhan.
- Semua form memiliki validation feedback.
- Loading, empty, error, dan success states tersedia.
- Aplikasi tetap aman ketika koneksi terganggu.
- Tampilan konsisten menggunakan design tokens.
- Tidak ada fitur visual yang menghambat kecepatan operasional.

---

## 15. Design Principle Summary

**TednCo Parkir harus terasa seperti alat kerja yang cepat, jelas, dan dapat dipercaya.**

Prioritaskan efisiensi petugas, keterbacaan informasi, dan keamanan transaksi di atas dekorasi visual.

Setiap komponen harus memiliki fungsi yang jelas.
