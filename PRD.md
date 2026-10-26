# Product Requirements Document (PRD)

## TednCo Parkir

**Status:** MVP Planning
**Product Type:** Parking Management SaaS / Progressive Web App (PWA)
**Target Market:** Small parking businesses
**Default Timezone:** Asia/Jakarta
**Primary Language:** Indonesian

---

## 1. Product Overview

TednCo Parkir adalah aplikasi manajemen parkir yang membantu pemilik usaha parkir mengelola kendaraan masuk, kendaraan keluar, pembayaran, saldo prepaid, dan laporan operasional secara digital.

Aplikasi ini dirancang untuk menggantikan pencatatan manual menggunakan buku atau catatan kertas.

Fokus utama produk adalah kemudahan penggunaan, keakuratan transaksi, dan pencatatan yang dapat dipertanggungjawabkan.

TednCo Parkir dikembangkan sebagai SaaS agar dapat digunakan oleh beberapa bisnis parkir dengan data yang terisolasi satu sama lain.

## 2. Problem Statement

Usaha parkir skala kecil menghadapi beberapa masalah operasional:

- Pencatatan kendaraan masih dilakukan secara manual.
- Riwayat kendaraan sulit dicari.
- Kesalahan pencatatan tarif dan pembayaran dapat terjadi.
- Pemilik kesulitan memantau pendapatan harian.
- Saldo pelanggan prepaid sulit dilacak.
- Transaksi dan aktivitas staf sulit diaudit.
- Pemilik tidak selalu berada di lokasi untuk memantau operasional.

TednCo Parkir bertujuan mengatasi masalah tersebut melalui sistem pencatatan yang sederhana, terstruktur, dan dapat diakses melalui perangkat mobile maupun desktop.

## 3. Product Goals

Tujuan MVP:

1. Mempercepat pencatatan kendaraan masuk.
2. Menampilkan daftar kendaraan yang sedang terparkir.
3. Memudahkan pencarian berdasarkan pelat nomor.
4. Menghitung biaya parkir berdasarkan tarif yang dikonfigurasi.
5. Mencatat pembayaran kendaraan keluar.
6. Menyimpan riwayat transaksi secara konsisten.
7. Mengelola saldo prepaid berdasarkan kendaraan dan lokasi.
8. Menampilkan laporan pendapatan dan aktivitas operasional.
9. Mengatur pengguna dan hak akses.
10. Menjaga isolasi data antarbisnis.
11. Menyediakan pengalaman PWA yang nyaman di mobile dan desktop.

## 4. Target Users

### 4.1 Owner

Pemilik bisnis parkir yang membutuhkan kontrol terhadap operasional dan keuangan.

Kebutuhan utama:

- Melihat ringkasan operasional.
- Mengelola tarif dan jam operasional.
- Mengelola staf.
- Memantau transaksi dan pendapatan.
- Mengelola prepaid.
- Mengakses laporan.
- Mengelola pengaturan bisnis.

### 4.2 Business Admin

Pengguna yang membantu pemilik mengelola bisnis sesuai izin yang diberikan.

Kebutuhan utama:

- Mengelola operasional.
- Mengakses pengaturan tertentu.
- Membantu koreksi transaksi atau refund jika memiliki izin.

### 4.3 Staff

Petugas parkir yang menggunakan aplikasi untuk mencatat kendaraan dan memproses kendaraan keluar.

Kebutuhan utama:

- Mencatat kendaraan masuk dengan cepat.
- Melihat kendaraan yang masih terparkir.
- Mencari kendaraan berdasarkan pelat nomor.
- Memproses checkout.
- Mencatat pembayaran.
- Melihat informasi yang sesuai dengan izin aksesnya.

### 4.4 Platform Admin

Administrator platform TednCo Parkir yang mengelola tenant dan paket SaaS.

Kebutuhan utama:

- Mengelola akun bisnis.
- Mengatur paket langganan.
- Mengelola konfigurasi platform.
- Memantau status langganan.

Akses lintas tenant harus dibatasi dan diaudit.

## 5. MVP Scope

### 5.1 Authentication and Access Control

- Login dan logout.
- Manajemen sesi yang aman.
- Pengguna dapat menjadi anggota beberapa tenant.
- Role dan permission berbasis tenant.
- Pembatasan akses berdasarkan lokasi.
- Pemulihan password melalui mekanisme yang aman.

### 5.2 Business and Location Management

- Profil bisnis.
- Pengelolaan lokasi parkir.
- Konfigurasi zona waktu.
- Konfigurasi jam operasional.
- Konfigurasi tarif berdasarkan lokasi dan jenis kendaraan.

### 5.3 Vehicle Entry

Petugas dapat mencatat kendaraan masuk.

Field wajib:

- Pelat nomor.
- Jenis kendaraan.

Field opsional:

- Nama pelanggan.
- Nomor telepon.
- Catatan kendaraan.

Jenis kendaraan MVP:

- Motor.
- Mobil.

Sistem harus mencegah kendaraan yang sama memiliki dua sesi parkir aktif pada tenant dan lokasi yang sama.

### 5.4 Active Parking

Aplikasi menampilkan kendaraan yang sedang terparkir.

Informasi utama:

- Pelat nomor.
- Jenis kendaraan.
- Waktu masuk.
- Durasi parkir.
- Nama pelanggan jika tersedia.
- Catatan jika tersedia.
- Informasi prepaid jika relevan.

Fitur:

- Pencarian pelat nomor.
- Filter jenis kendaraan.
- Detail kendaraan.
- Edit informasi sesi aktif sesuai permission.
- Pembatalan sesi yang memenuhi syarat.
- Checkout kendaraan.

### 5.5 Parking Checkout

Petugas memilih jenis tarif saat kendaraan keluar.

Jenis tarif:

- Reguler.
- Menginap.

Untuk tarif menginap, petugas wajib menentukan jumlah malam sebagai bilangan bulat positif.

Sistem menghitung biaya berdasarkan konfigurasi tarif yang berlaku.

Metode pembayaran:

- Cash.
- QRIS dengan konfirmasi manual.
- Prepaid jika saldo mencukupi dan akun aktif.

Setiap sesi hanya boleh diselesaikan satu kali.

### 5.6 Parking History

Riwayat menyimpan sesi parkir yang selesai maupun dibatalkan.

Informasi yang ditampilkan dapat meliputi:

- Pelat nomor.
- Jenis kendaraan.
- Waktu masuk.
- Waktu keluar.
- Tarif.
- Jumlah malam jika menginap.
- Biaya.
- Metode pembayaran.
- Status.
- Petugas yang memproses transaksi.

Transaksi yang sudah selesai tidak boleh diedit secara bebas. Koreksi harus mengikuti prosedur khusus dan tercatat dalam audit log.

### 5.7 Prepaid Management

Prepaid merupakan saldo uang yang dikaitkan dengan pelat nomor dan lokasi parkir tertentu.

Fitur:

- Registrasi kendaraan prepaid.
- Pencatatan deposit.
- Informasi saldo.
- Riwayat pergerakan saldo.
- Aktivasi dan deaktivasi.
- Pembayaran parkir menggunakan saldo prepaid.
- Refund sesuai permission.

Saldo hanya dipotong saat checkout prepaid berhasil.

Deposit prepaid tidak dihitung sebagai pendapatan jasa parkir.

### 5.8 Reports

Laporan parkir mencakup:

- Pendapatan jasa parkir.
- Kendaraan masuk.
- Kendaraan keluar.
- Transaksi selesai.
- Sesi yang dibatalkan.
- Detail transaksi.
- Filter berdasarkan tanggal.
- Filter metode pembayaran.
- Filter jenis tarif.
- Filter pelat nomor.
- Filter staf dan lokasi sesuai permission.

Laporan prepaid mencakup:

- Total deposit.
- Pemakaian saldo.
- Refund.
- Penyesuaian saldo.
- Total saldo prepaid yang masih menjadi kewajiban bisnis.

### 5.9 Settings

- Profil bisnis.
- Lokasi.
- Tarif.
- Jam operasional.
- Pengguna dan permission.
- Informasi langganan.

## 6. Navigation Structure

Menu utama yang direncanakan:

1. Home
2. Kendaraan Terparkir
3. Riwayat Parkir
4. Prepaid
5. Laporan
6. Pengaturan

Tombol **Kendaraan Masuk** harus mudah ditemukan dan dapat menjadi tindakan utama pada dashboard.

Dashboard tidak perlu menampilkan kartu khusus prepaid. Informasi prepaid tersedia di daftar/detail kendaraan dan menu Prepaid.

Platform Admin menggunakan area logis terpisah dari operasional bisnis.

## 7. Subscription Management

TednCo Parkir dirancang sebagai SaaS dengan paket langganan yang dapat dikonfigurasi.

Rancangan mendukung:

- Harga bulanan.
- Harga tahunan.
- Batas jumlah pengguna.
- Batas jumlah lokasi.
- Fitur berdasarkan paket.
- Masa trial.
- Status langganan.
- Override khusus tenant.

Harga dan batas paket belum ditetapkan secara final.

Implementasi langganan tidak boleh menghambat penyelesaian fitur inti parkir.

## 8. Explicitly Out of Scope

Fitur berikut tidak termasuk MVP:

- Mode offline dengan antrean transaksi.
- Sinkronisasi data setelah offline.
- Cetak struk.
- Struk PDF.
- Struk melalui WhatsApp.
- Integrasi printer.
- Foto kendaraan.
- Pembukaan dan penutupan shift kasir.
- Rekonsiliasi uang kas.
- Pembayaran campuran.
- Konfirmasi QRIS otomatis.
- Payment gateway untuk pembayaran parkir.
- Paket prepaid berbasis jumlah kunjungan.
- Paket prepaid berbasis jumlah hari.
- Pemakaian saldo prepaid lintas lokasi.
- Ekspor CSV atau Excel.
- Grafik analitik lanjutan.

Fitur di luar cakupan ini dapat dipertimbangkan setelah MVP diuji dalam operasional nyata.

## 9. Non-Functional Requirements

### Security

- Data setiap tenant harus terisolasi.
- Pemeriksaan permission dilakukan di server.
- Password dan sesi ditangani menggunakan solusi autentikasi yang sesuai.
- Operasi finansial harus terlindungi dari duplikasi.
- Aktivitas penting harus tercatat dalam audit log.

### Reliability

- Aplikasi tidak boleh mengonfirmasi transaksi berhasil sebelum server mengonfirmasi penyimpanan.
- Sistem harus mencegah checkout ganda.
- Sistem harus menjaga konsistensi saldo prepaid.

### Usability

- Antarmuka mobile-first.
- Tombol utama mudah dijangkau.
- Formulir sederhana.
- Pesan validasi jelas.
- Status loading, error, dan koneksi bermasalah ditampilkan dengan jelas.

### Maintainability

- TypeScript strict.
- Validasi input terpusat.
- Aturan bisnis dipisahkan dari komponen UI.
- Pengujian otomatis untuk aturan penting.
- Dokumentasi diperbarui ketika keputusan berubah.

## 10. MVP Acceptance Criteria

MVP dapat dianggap memenuhi kebutuhan awal apabila:

1. Petugas dapat mencatat kendaraan masuk.
2. Daftar kendaraan aktif dapat dicari berdasarkan pelat nomor.
3. Sistem mencegah duplikasi sesi aktif.
4. Tarif checkout dihitung berdasarkan konfigurasi yang benar.
5. Pembayaran tercatat dengan status yang konsisten.
6. Satu sesi tidak dapat diselesaikan dua kali.
7. Saldo prepaid tidak dapat menjadi negatif.
8. Deposit prepaid tidak dihitung sebagai pendapatan parkir.
9. Refund dan penyesuaian saldo memiliki catatan audit.
10. Pengguna tidak dapat mengakses data tenant atau lokasi tanpa izin.
11. Laporan memisahkan aktivitas kendaraan dan pendapatan berdasarkan waktu yang tepat.
12. Aplikasi lolos pemeriksaan lint, build, dan pengujian yang relevan.
