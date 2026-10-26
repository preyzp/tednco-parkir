# AUTH_AND_TENANCY.md — TednCo Parkir

Dokumen ini mendefinisikan aturan autentikasi, sesi pengguna, keanggotaan tenant, otorisasi, permission, dan isolasi data untuk TednCo Parkir.

Dokumen ini wajib dibaca sebelum mengimplementasikan login, pengelolaan pengguna, middleware, server actions, route handlers, atau akses database yang membutuhkan autentikasi.

---

## 1. Tujuan Keamanan

Sistem harus memastikan bahwa:

- Pengguna hanya dapat mengakses akun dan tenant yang diizinkan.
- Pengguna hanya dapat mengakses lokasi sesuai role dan permission.
- Data bisnis tidak bocor antar-tenant.
- Akses ke tindakan finansial dibatasi sesuai otorisasi.
- Sesi pengguna dikelola secara aman.
- Perubahan role dan permission tidak dapat dilakukan sendiri oleh pengguna tanpa otorisasi.
- Semua operasi sensitif divalidasi di server.
- Akses lintas tenant oleh Platform Admin dibatasi dan dapat diaudit.

**Prinsip utama: autentikasi membuktikan siapa pengguna, sedangkan otorisasi menentukan apa yang boleh dilakukan pengguna.**

Pengguna yang berhasil login belum tentu berhak mengakses seluruh data atau fitur.

---

## 2. Teknologi Autentikasi

Gunakan library autentikasi yang terpelihara, kompatibel dengan versi Next.js yang digunakan, dan sesuai dengan kebutuhan aplikasi.

Sebelum implementasi:

1. Periksa dokumentasi lokal Next.js yang relevan.
2. Evaluasi library autentikasi yang kompatibel.
3. Pastikan dukungan session management, password hashing, logout, dan mekanisme pemulihan akun sesuai kebutuhan.
4. Dokumentasikan library yang dipilih dan cara integrasinya.
5. Hindari membuat sistem autentikasi kriptografi sendiri.

Jangan mengasumsikan library tertentu sudah terpasang sebelum memeriksa `package.json` dan implementasi yang tersedia.

### Prinsip implementasi

- Gunakan password hashing yang direkomendasikan library atau standar keamanan yang sesuai.
- Jangan menyimpan password dalam bentuk asli.
- Jangan menyimpan session token sebagai data yang dapat dibaca pengguna lain.
- Jangan membuat algoritma enkripsi atau hashing sendiri.
- Jangan mengandalkan validasi frontend untuk keamanan.
- Jangan mengirim password hash, session secret, atau token autentikasi ke browser melalui respons aplikasi.

---

## 3. Model Identitas

### 3.1 User

`User` merepresentasikan identitas pengguna di platform.

Satu user dapat menjadi anggota beberapa tenant.

Data minimum:

- ID.
- Nama.
- Email.
- Status akun.
- Informasi autentikasi sesuai library.
- Waktu pembuatan.
- Waktu pembaruan.
- Waktu login terakhir jika diperlukan.

Email harus dinormalisasi sesuai kebijakan aplikasi.

Email yang sama tidak boleh menghasilkan beberapa akun berbeda tanpa aturan identitas yang jelas.

### 3.2 Membership

`Membership` merepresentasikan hubungan user dengan tenant tertentu.

Membership menyimpan:

- User ID.
- Tenant ID.
- Role pada tenant tersebut.
- Status membership.
- Lokasi yang dapat diakses.
- Permission tambahan jika diperlukan.
- Waktu pembuatan dan pembaruan.

Role adalah konteks keanggotaan, bukan atribut global yang selalu sama untuk semua tenant.

Contoh:

Seorang pengguna dapat menjadi Owner pada bisnis parkir A dan Staff pada bisnis parkir B.

Role pada bisnis A tidak boleh memberikan akses otomatis ke bisnis B.

### 3.3 Platform Admin

Platform Admin adalah peran tingkat platform, bukan role operasional tenant biasa.

Platform Admin mengelola hal-hal seperti:

- Tenant.
- Status tenant.
- Paket langganan.
- Status langganan.
- Konfigurasi platform.

Akses terhadap data operasional tenant harus dibatasi sesuai kebutuhan dan dicatat melalui audit log apabila dilakukan.

Jangan memberikan akses Platform Admin kepada pengguna biasa melalui parameter URL, input form, atau perubahan data dari browser.

---

## 4. Alur Login

Login menggunakan kredensial yang sesuai dengan mekanisme autentikasi terpilih.

Alur umum:

1. Pengguna memasukkan email dan password.
2. Server memvalidasi format input.
3. Server memeriksa batas percobaan login.
4. Sistem autentikasi memverifikasi kredensial.
5. Server memeriksa status akun.
6. Sistem membuat atau menetapkan sesi yang aman.
7. Pengguna diarahkan ke tenant dan lokasi yang dapat diakses.
8. Server tetap memvalidasi membership dan permission pada setiap operasi terlindungi.

Jika pengguna tidak memiliki membership aktif, aplikasi tidak boleh memberinya akses operasional tenant.

Respons login untuk kredensial yang salah tidak boleh membocorkan apakah email tertentu terdaftar, kecuali ada kebutuhan produk yang telah dianalisis dari sisi keamanan.

### Pengamanan login

Terapkan:

- Rate limiting.
- Validasi input.
- Penanganan error yang aman.
- Proteksi terhadap percobaan login berulang.
- Cookie sesi dengan konfigurasi aman jika menggunakan cookie.
- Pencatatan aktivitas keamanan yang relevan tanpa menyimpan rahasia autentikasi.

Jangan mengunci akun secara permanen hanya karena sejumlah percobaan login gagal. Gunakan kebijakan pembatasan yang mencegah penyalahgunaan sekaligus mengurangi risiko denial of service terhadap pengguna sah.

---

## 5. Pengelolaan Sesi

Sesi harus dikelola oleh mekanisme autentikasi yang dipilih.

Ketentuan:

- Gunakan mekanisme sesi yang didukung dan direkomendasikan library.
- Terapkan masa berlaku sesi yang jelas.
- Sediakan logout.
- Sediakan invalidasi sesi ketika diperlukan.
- Pastikan status akun dan membership tetap diperiksa pada operasi sensitif.
- Perubahan role atau permission harus berlaku sesuai kebijakan invalidasi atau pembaruan sesi.
- Jangan menyimpan token sesi di `localStorage` jika tersedia mekanisme cookie HttpOnly yang lebih sesuai.
- Jangan mengirim session secret ke browser.

Jika autentikasi menggunakan cookie:

- Gunakan `HttpOnly`.
- Gunakan `Secure` pada lingkungan HTTPS produksi.
- Gunakan `SameSite` yang sesuai.
- Batasi `Path` dan atribut cookie lain sesuai kebutuhan.
- Pertimbangkan perlindungan CSRF untuk operasi yang menggunakan autentikasi berbasis cookie.

Jangan membuat implementasi cookie atau session cryptography sendiri jika library autentikasi sudah menyediakan mekanisme yang aman.

### Logout

Logout harus mengakhiri sesi sesuai mekanisme yang digunakan.

Setelah logout:

- Halaman terlindungi tidak boleh tetap memberikan akses hanya karena sebelumnya sudah dibuka.
- Operasi server harus menolak sesi yang sudah tidak valid.
- Data sensitif tidak boleh tetap dapat diakses melalui request baru tanpa autentikasi.

---

## 6. Pemulihan Password

Sistem dapat menyediakan alur lupa password melalui email.

Persyaratan:

- Respons permintaan reset tidak membocorkan apakah suatu email terdaftar.
- Token reset harus acak, memiliki masa berlaku terbatas, dan hanya dapat digunakan satu kali.
- Token reset tidak boleh disimpan sebagai token plaintext jika implementasi dapat menyimpan representasi hash secara aman.
- Reset harus memvalidasi token di server.
- Setelah berhasil, token harus dinonaktifkan.
- Sesi lama harus ditangani sesuai kebijakan keamanan yang ditetapkan.
- Password baru harus memenuhi kebijakan password aplikasi.
- Password hash tidak boleh dikirim ke browser.

Jika layanan email belum dikonfigurasi, jangan membuat alur reset palsu yang menampilkan seolah-olah email sudah dikirim.

Owner atau Admin dapat membantu pemulihan akun Staff melalui alur administratif yang aman, tanpa perlu mengetahui password pengguna tersebut.

Reset password tidak boleh otomatis mengubah role atau permission.

---

## 7. Konteks Tenant Aktif

Setiap operasi tenant harus mempunyai konteks tenant yang telah divalidasi.

Konteks ini ditentukan dari:

1. Identitas pengguna yang sudah diautentikasi.
2. Membership aktif pengguna.
3. Tenant yang dipilih atau sedang digunakan.
4. Status tenant.
5. Lokasi aktif jika operasi membutuhkan lokasi.
6. Permission yang relevan.

Tenant ID yang dikirim browser hanya merupakan input pemilihan konteks, bukan bukti kepemilikan.

Server wajib memeriksa bahwa pengguna memang memiliki membership yang sah terhadap tenant tersebut.

### Pergantian tenant

Jika user tergabung dalam beberapa tenant:

- Tampilkan hanya tenant yang dapat diakses.
- Validasi tenant tujuan saat berpindah.
- Jangan membawa permission tenant sebelumnya ke tenant tujuan.
- Muat ulang konteks role, lokasi, dan permission setelah pergantian tenant.
- Pastikan semua request berikutnya menggunakan konteks baru yang tervalidasi.

---

## 8. Otorisasi Lokasi

Setiap membership harus memiliki cakupan lokasi yang jelas.

### Owner

Owner dapat mengakses seluruh lokasi aktif pada tenant miliknya sesuai aturan bisnis.

### Admin

Admin dapat mengakses lokasi sesuai permission dan cakupan yang ditetapkan.

### Staff

Staff hanya dapat mengakses lokasi yang ditugaskan kepadanya.

### Validasi

Untuk setiap operasi lokasi:

1. Validasi autentikasi.
2. Validasi membership.
3. Validasi tenant.
4. Validasi akses lokasi.
5. Validasi permission tindakan.
6. Jalankan operasi database dengan filter tenant dan lokasi.

Jangan menganggap pengguna berhak mengakses suatu lokasi hanya karena mengetahui `locationId`.

---

## 9. Role dan Permission

Role dasar:

- `platform_admin`
- `owner`
- `admin`
- `staff`

Gunakan permission eksplisit untuk tindakan sensitif.

Contoh permission:

- `vehicle.create`
- `vehicle.read`
- `vehicle.update_active`
- `parking.checkout`
- `parking.cancel`
- `parking.read_history`
- `tariff.read`
- `tariff.manage`
- `prepaid.read`
- `prepaid.register`
- `prepaid.deposit`
- `prepaid.toggle_status`
- `prepaid.refund`
- `prepaid.adjust_balance`
- `reports.read_operational`
- `reports.read_financial`
- `transactions.correct`
- `memberships.manage`
- `locations.manage`
- `subscription.manage`

Daftar ini adalah contoh penamaan permission yang dapat dijadikan acuan. Implementasi harus memiliki satu sumber definisi permission agar nama, default role, dan penggunaannya konsisten.

Jangan membuat pemeriksaan permission yang tersebar tanpa standar penamaan.

### Prinsip default

- Owner mendapatkan akses penuh pada tenant miliknya.
- Admin mendapatkan akses berdasarkan kebijakan role dan permission.
- Staff mendapatkan akses operasional yang diperlukan.
- Staff tidak mendapatkan izin refund secara default.
- Staff tidak mendapatkan izin koreksi transaksi selesai secara default.
- Akses laporan finansial dapat dibatasi.
- Izin deposit dan pengelolaan prepaid dapat dikonfigurasi.

UI boleh menyembunyikan tindakan yang tidak diizinkan, tetapi server tetap wajib menolak tindakan tersebut.

---

## 10. Isolasi Data Tenant

Semua data operasional harus dibatasi berdasarkan tenant.

Contoh data yang wajib dilindungi:

- Kendaraan.
- Sesi parkir.
- Tarif.
- Transaksi.
- Akun prepaid.
- Ledger prepaid.
- Pengguna tenant.
- Laporan.
- Pengaturan lokasi.

Setiap query tenant harus menggunakan `tenantId` yang berasal dari konteks server yang sudah diotorisasi.

Untuk data berbasis lokasi, query juga harus menggunakan cakupan lokasi yang sah.

### Contoh pola yang benar

```ts
const vehicle = await vehicles.findOne({
  _id: vehicleId,
  tenantId: authorizedTenantId,
});
```

### Contoh pola yang tidak aman

```ts
const vehicle = await vehicles.findOne({
  _id: vehicleId,
});
```

Pola kedua tidak cukup karena tidak membuktikan bahwa dokumen tersebut milik tenant yang sedang diakses.

### Aturan tambahan

- Jangan mengambil data tenant lain lalu hanya menyembunyikannya di frontend.
- Jangan menerima `tenantId` dari body request lalu langsung menggunakannya untuk query.
- Jangan menggunakan data dari satu tenant untuk menghitung laporan tenant lain.
- Jangan menganggap ObjectId yang sulit ditebak sebagai kontrol akses.
- Jangan memberikan akses lintas tenant melalui pencarian global biasa.

---

## 11. Server Actions dan Route Handlers

Setiap Server Action dan Route Handler yang mengakses data terlindungi wajib memvalidasi:

1. Identitas pengguna.
2. Status akun.
3. Membership aktif.
4. Tenant aktif.
5. Status tenant.
6. Lokasi yang diizinkan jika relevan.
7. Permission yang diperlukan.
8. Validitas input.
9. Kepemilikan data target.

Gunakan helper autentikasi dan otorisasi yang terpusat.

Contoh konseptual:

```ts
const context = await requireTenantContext();

await requirePermission(context, "parking.checkout");

const session = await parkingSessions.findOne({
  _id: sessionId,
  tenantId: context.tenantId,
  locationId: context.locationId,
  status: "active",
});
```

Nama helper tersebut merupakan contoh desain. Sesuaikan dengan struktur kode aktual.

Jangan mengandalkan middleware atau proteksi halaman sebagai satu-satunya lapisan keamanan.

Halaman yang tersembunyi bukan berarti endpoint atau Server Action-nya aman.

---

## 12. Keamanan Operasi Finansial

Operasi berikut membutuhkan pemeriksaan otorisasi dan konsistensi data yang lebih ketat:

- Checkout.
- Konfirmasi pembayaran QRIS.
- Deposit prepaid.
- Pemotongan saldo prepaid.
- Refund.
- Koreksi saldo.
- Koreksi transaksi selesai.
- Perubahan tarif.
- Pencatatan pembayaran langganan.

Ketentuan:

- Hitung total di server.
- Baca saldo terbaru di server.
- Validasi status transaksi dan sesi.
- Gunakan transaksi database atau mekanisme konsistensi yang setara.
- Cegah request ganda dengan idempotency.
- Catat tindakan sensitif melalui audit log.
- Jangan menganggap permintaan frontend sebagai bukti pembayaran telah diterima.

Jika otorisasi atau validasi gagal, operasi harus ditolak tanpa meninggalkan perubahan finansial parsial yang tidak tertangani.

---

## 13. Platform Admin dan Akses Lintas Tenant

Platform Admin memiliki kewenangan pengelolaan platform, tetapi tidak boleh menggunakan akses lintas tenant secara sembarangan.

Ketentuan:

- Pisahkan permission platform dari permission tenant.
- Jangan memberikan role platform hanya karena pengguna adalah Owner.
- Akses lintas tenant harus memiliki alasan yang sah.
- Batasi informasi yang diakses sesuai kebutuhan.
- Catat tindakan administratif yang sensitif.
- Jangan mengubah transaksi bisnis tenant secara diam-diam.
- Jangan membuat mekanisme impersonasi tanpa kebutuhan produk, kontrol akses, dan audit yang jelas.

Jika fitur dukungan pelanggan membutuhkan akses operasional suatu tenant, rancang alur khusus yang memiliki otorisasi, alasan, dan pencatatan audit.

---

## 14. Rate Limiting dan Proteksi Request

Terapkan rate limiting pada operasi yang rentan disalahgunakan, terutama:

- Login.
- Permintaan reset password.
- Validasi token autentikasi.
- Endpoint yang memproses tindakan finansial.
- Endpoint yang dapat digunakan untuk enumerasi data.

Rate limiting pada deployment multi-instance sebaiknya menggunakan mekanisme terdistribusi jika diperlukan.

Jangan hanya mengandalkan variabel memori lokal apabila beberapa instance server dapat memproses request.

Rate limiting tidak menggantikan autentikasi, otorisasi, validasi, atau idempotency.

---

## 15. Penanganan Error

Respons error harus memberikan informasi yang cukup untuk penggunaan aplikasi, tetapi tidak membocorkan detail internal.

Contoh kategori error:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `TENANT_NOT_FOUND`
- `LOCATION_ACCESS_DENIED`
- `VALIDATION_ERROR`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Gunakan status HTTP yang sesuai pada Route Handler.

Jangan mengirim:

- Stack trace produksi.
- Connection string MongoDB.
- Password hash.
- Token sesi.
- Secret environment.
- Detail internal yang membantu penyerang.

Untuk data lintas tenant, kebijakan respons `not found` atau `forbidden` harus diterapkan secara konsisten agar tidak membocorkan keberadaan data.

---

## 16. Audit dan Keamanan Administratif

Catat tindakan penting, termasuk:

- Login dan aktivitas keamanan yang relevan.
- Perubahan role.
- Perubahan permission.
- Penambahan atau penonaktifan membership.
- Perubahan cakupan lokasi.
- Perubahan konfigurasi tenant.
- Akses administratif lintas tenant jika terjadi.
- Koreksi transaksi dan tindakan finansial.

Jangan mencatat password atau token autentikasi.

Audit log harus dilindungi dari perubahan oleh pengguna operasional biasa.

Audit log bukan pengganti kontrol akses. Semua tindakan tetap harus diotorisasi sebelum dijalankan.

---

## 17. Environment dan Secret

Simpan kredensial dan secret di environment variable atau secret manager yang sesuai.

Contoh konfigurasi yang mungkin dibutuhkan:

- `MONGODB_URI`
- `MONGODB_DB`
- Secret yang dibutuhkan library autentikasi.
- Konfigurasi URL aplikasi.
- Kredensial email jika layanan reset password digunakan.

Gunakan `.env.example` hanya untuk nama variabel dan placeholder.

Jangan:

- Commit `.env.local`.
- Commit password database.
- Menaruh secret dalam file yang dikirim ke browser.
- Menggunakan awalan `NEXT_PUBLIC_` untuk secret server.
- Menyalin kredensial produksi ke lingkungan pengujian.
- Menampilkan secret di log.

Pastikan `.gitignore` mengecualikan file environment yang berisi secret dan tetap mengizinkan `.env.example`.

---

## 18. Pengujian Keamanan

Pengujian minimum:

### Authentication

- Pengguna tanpa sesi tidak dapat mengakses halaman terlindungi.
- Pengguna tanpa sesi tidak dapat menjalankan operasi terlindungi.
- Logout mengakhiri akses berdasarkan sesi yang sudah tidak valid.
- Reset password menggunakan token yang berlaku dan sekali pakai.
- Login mengikuti kebijakan rate limiting.

### Tenant isolation

- Tenant A tidak dapat membaca kendaraan tenant B.
- Tenant A tidak dapat mengubah sesi tenant B.
- Tenant A tidak dapat membaca transaksi tenant B.
- Tenant A tidak dapat mengakses saldo prepaid tenant B.
- Mengganti `tenantId` di request tidak memberikan akses tambahan.

### Location authorization

- Staff tidak dapat membaca lokasi yang tidak ditugaskan.
- Staff tidak dapat checkout kendaraan pada lokasi yang tidak diizinkan.
- Staff tidak dapat mengakses laporan lokasi lain tanpa izin.

### Permissions

- Staff tidak dapat melakukan refund tanpa izin.
- Staff tidak dapat mengoreksi transaksi selesai tanpa izin.
- Pengguna tidak dapat menaikkan role sendiri.
- Perubahan permission tidak dapat dilakukan melalui manipulasi request biasa.

### Financial integrity

- Checkout ganda ditolak.
- Pemotongan prepaid ganda dicegah.
- QRIS yang belum dikonfirmasi tidak dianggap lunas.
- Saldo prepaid tidak dapat menjadi negatif.
- Request dengan idempotency key sama tetapi payload berbeda ditolak.

---

## 19. Urutan Implementasi

Implementasikan secara bertahap:

### Tahap 1 — Pemilihan auth library

- Periksa dokumentasi Next.js yang terpasang.
- Pilih library yang kompatibel.
- Dokumentasikan keputusan.
- Tentukan struktur user dan session.

### Tahap 2 — Autentikasi dasar

- Login.
- Logout.
- Session management.
- Proteksi halaman dan operasi server.
- Penanganan error.

### Tahap 3 — Tenant dan membership

- Model membership.
- Pemilihan tenant aktif.
- Validasi membership.
- Pemilihan lokasi aktif.
- Validasi cakupan lokasi.

### Tahap 4 — Permission

- Helper otorisasi terpusat.
- Role Owner, Admin, dan Staff.
- Permission untuk tindakan sensitif.
- Pengujian otorisasi.

### Tahap 5 — Pemulihan akun

- Reset password.
- Token sekali pakai.
- Integrasi email jika tersedia.
- Pengujian keamanan.

### Tahap 6 — Hardening

- Rate limiting.
- Audit log.
- Pengujian isolasi tenant.
- Pengujian tindakan finansial.
- Pemeriksaan secret dan konfigurasi deployment.

Jangan menunda isolasi tenant sampai aplikasi sudah memiliki banyak fitur.

---

## 20. Aturan untuk AI Coding Agent

Sebelum mengubah autentikasi atau otorisasi:

1. Baca dokumen ini.
2. Baca `BUSINESS_RULES.md`.
3. Baca `DATABASE_SCHEMA.md`.
4. Periksa library dan implementasi autentikasi yang sudah ada.
5. Periksa seluruh jalur akses server yang terdampak.
6. Tambahkan pengujian untuk akses yang sah dan tidak sah.
7. Jalankan pemeriksaan kode yang tersedia.
8. Dokumentasikan perubahan arsitektur yang relevan.

Jangan:

- Membuat sistem session cryptography sendiri.
- Mengandalkan proteksi frontend.
- Memercayai `tenantId`, role, atau permission dari browser.
- Membuat query tenant tanpa filter kepemilikan.
- Menganggap Platform Admin dan Owner sebagai role yang sama.
- Mengizinkan pengguna mengubah permission sendiri.
- Menganggap semua operasi multi-dokumen otomatis atomik.
- Membocorkan rahasia melalui log atau respons error.

Jika ada keputusan keamanan yang belum jelas, pilih pendekatan paling aman dan terdokumentasi. Jangan menurunkan keamanan hanya agar fitur lebih cepat selesai.
