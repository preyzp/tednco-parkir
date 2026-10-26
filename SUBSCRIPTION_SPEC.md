# SUBSCRIPTION_SPEC.md — TednCo Parkir

Dokumen ini mendefinisikan spesifikasi sistem langganan TednCo Parkir sebagai produk SaaS.

Sistem harus memungkinkan pengelola platform mengatur paket, harga, fitur, batas penggunaan, trial, dan status langganan melalui Web Admin tanpa perlu mengubah kode atau melakukan deployment ulang untuk perubahan konfigurasi yang didukung.

Sistem langganan dikembangkan setelah fondasi autentikasi, tenant, dan operasional parkir cukup stabil.

---

## 1. Tujuan

Sistem langganan bertujuan untuk:

- Mengelola paket yang tersedia untuk tenant.
- Mengatur harga bulanan dan tahunan.
- Menentukan fitur yang tersedia pada setiap paket.
- Mengatur batas penggunaan.
- Mendukung masa trial.
- Mencatat invoice dan pembayaran.
- Mengelola status langganan.
- Menyediakan informasi langganan pada dashboard tenant.
- Membatasi fitur berdasarkan langganan melalui validasi server.
- Memungkinkan perubahan paket tanpa merusak riwayat tagihan.

Harga dan struktur paket belum dianggap final sampai ditetapkan secara eksplisit oleh pemilik produk.

Jangan mengarang harga produksi atau menganggap contoh paket sebagai keputusan final.

---

## 2. Aktor

### 2.1 Platform Admin

Platform Admin mengelola konfigurasi langganan seluruh platform.

Hak akses meliputi:

- Membuat paket.
- Mengubah konfigurasi paket.
- Mengaktifkan atau menonaktifkan paket.
- Mengatur harga bulanan dan tahunan.
- Mengatur fitur paket.
- Mengatur batas penggunaan.
- Mengatur durasi trial.
- Melihat daftar langganan tenant.
- Mengubah status langganan sesuai kebijakan.
- Memverifikasi pembayaran manual.
- Mengelola invoice sesuai izin.
- Melihat riwayat perubahan konfigurasi.

### 2.2 Owner Tenant

Owner dapat melihat informasi langganan bisnisnya sendiri.

Hak akses meliputi:

- Melihat paket saat ini.
- Melihat fitur dan batas paket.
- Melihat tanggal mulai dan berakhirnya periode langganan.
- Melihat status langganan.
- Melihat invoice.
- Melihat status pembayaran.
- Mengajukan atau melakukan perpanjangan sesuai alur yang tersedia.
- Melihat informasi pembayaran manual jika metode tersebut diaktifkan.

Owner tidak boleh mengubah harga paket global atau status langganan tenant lain.

### 2.3 Admin dan Staff

Admin atau Staff tidak otomatis memiliki akses terhadap pengaturan langganan.

Akses diberikan hanya jika kebijakan produk dan permission mengizinkannya.

---

## 3. Paket Langganan

### 3.1 Struktur paket

Setiap paket memiliki:

- Nama.
- Kode unik.
- Deskripsi opsional.
- Harga bulanan.
- Harga tahunan.
- Daftar fitur.
- Batas penggunaan.
- Durasi trial.
- Status aktif atau nonaktif.
- Urutan tampilan.
- Waktu pembuatan dan pembaruan.

Contoh konseptual:

```ts
interface SubscriptionPlan {
  _id: ObjectId;
  name: string;
  code: string;
  description?: string;

  monthlyPrice: number;
  yearlyPrice: number;

  currency: "IDR";

  features: string[];
  limits: Record<string, number>;

  trialDays: number;

  status: "active" | "inactive";
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId;
}
```

Struktur aktual harus disesuaikan dengan implementasi database dan dokumen `DATABASE_SCHEMA.md`.

### 3.2 Pengaturan harga

Harga harus dapat diubah melalui Web Admin.

Ketentuan:

- Harga menggunakan integer Rupiah.
- Harga tidak boleh negatif.
- Perubahan harga tidak boleh mengubah invoice historis.
- Perubahan harga tidak otomatis mengubah harga periode langganan yang sudah berjalan.
- Harga yang ditampilkan kepada pengguna harus berasal dari data server.
- Harga yang digunakan untuk invoice harus ditentukan dan disimpan di server.

Jika perubahan harga hanya berlaku untuk pelanggan baru, sistem harus tetap mempertahankan ketentuan pelanggan lama sesuai periode langganan mereka.

### 3.3 Pengaktifan dan penonaktifan paket

Paket yang dinonaktifkan:

- Tidak ditawarkan untuk pendaftaran baru.
- Tetap dapat dirujuk oleh langganan historis.
- Tidak menghapus invoice atau pembayaran.
- Tidak otomatis menghentikan semua langganan yang sudah menggunakan paket tersebut.

Perubahan yang memengaruhi pelanggan aktif harus mengikuti kebijakan migrasi atau perubahan paket yang eksplisit.

### 3.4 Fitur dan batas paket

Paket dapat mengatur fitur dan limit, misalnya:

- Jumlah lokasi.
- Jumlah pengguna.
- Fitur laporan tertentu.
- Fitur prepaid.
- Fitur administrasi tertentu.

Nama fitur dan batas penggunaan harus berasal dari daftar yang didefinisikan dalam aplikasi.

Jangan menerima nama fitur arbitrer dari browser sebagai bukti bahwa fitur tersebut tersedia.

Jangan menawarkan fitur yang belum benar-benar diimplementasikan.

---

## 4. Durasi Trial

### 4.1 Konfigurasi

Platform Admin dapat mengatur durasi trial dalam satuan hari.

Nilai durasi trial harus berupa bilangan bulat nonnegatif.

Jika durasi trial nol, paket tidak memberikan trial.

### 4.2 Aktivasi trial

Ketika tenant mendapatkan trial:

- Sistem mencatat waktu mulai trial.
- Sistem menghitung waktu berakhir berdasarkan kebijakan yang ditetapkan.
- Status langganan menjadi `trialing`.
- Paket dan fitur yang berlaku harus jelas.
- Masa trial tidak boleh dimulai ulang hanya karena pengguna melakukan refresh atau login kembali.

Tenant hanya boleh mendapatkan trial sesuai kebijakan kelayakan yang berlaku.

Jangan mengasumsikan tenant dapat membuat banyak akun untuk mendapatkan trial berulang tanpa pembatasan.

### 4.3 Akhir trial

Saat trial berakhir:

- Sistem memperbarui atau mengevaluasi status langganan.
- Tenant menerima informasi mengenai status langganannya.
- Sistem menerapkan kebijakan akses yang berlaku.
- Data operasional tenant tetap dipertahankan.

Jangan menghapus data parkir, kendaraan, transaksi, atau ledger prepaid akibat trial berakhir.

---

## 5. Status Langganan

Status yang didukung:

| Status         | Arti                                      |
| -------------- | ----------------------------------------- |
| `trialing`     | Tenant sedang menjalani masa trial        |
| `active`       | Langganan aktif                           |
| `past_due`     | Pembayaran telah melewati jatuh tempo     |
| `grace_period` | Tenant sedang berada dalam masa toleransi |
| `suspended`    | Akses tertentu ditangguhkan               |
| `canceled`     | Langganan dibatalkan sesuai kebijakan     |
| `expired`      | Periode langganan telah berakhir          |

### 5.1 Status aktif

Tenant dengan langganan aktif dapat menggunakan fitur yang tersedia pada paketnya, selama tidak melanggar batas penggunaan dan aturan operasional lainnya.

### 5.2 Pembayaran terlambat

Status `past_due` menunjukkan bahwa kewajiban pembayaran belum diselesaikan sesuai ketentuan.

Sistem harus menampilkan informasi status dan instruksi yang relevan.

Status ini tidak boleh otomatis menghapus data atau membuat transaksi parkir historis tidak dapat dibaca.

### 5.3 Grace period

Masa toleransi dapat diberikan sebelum pembatasan lebih ketat diberlakukan.

Durasi dan perilaku grace period harus dapat ditentukan melalui konfigurasi atau kebijakan platform yang terdokumentasi.

Jangan mengarang durasi produksi tanpa keputusan produk.

### 5.4 Suspended

Status suspended menunjukkan tenant sedang dibatasi berdasarkan kebijakan platform.

Akses yang dibatasi harus ditentukan secara eksplisit.

Pertahankan kemampuan administratif yang diperlukan untuk melihat informasi langganan, menyelesaikan pembayaran, atau menghubungi dukungan jika sesuai kebijakan.

### 5.5 Canceled dan expired

Status canceled dan expired tidak berarti data tenant harus dihapus.

Sistem harus tetap mempertahankan data historis dan mencegah kehilangan data akibat perubahan status langganan.

---

## 6. Kebijakan Akses Ketika Langganan Berubah

Penerapan pembatasan langganan harus dilakukan melalui kebijakan akses terpusat.

Jangan menyebarkan pemeriksaan status langganan secara tidak konsisten di berbagai halaman.

### Prinsip utama

1. Autentikasi dan membership tetap harus valid.
2. Permission pengguna tetap diperiksa.
3. Fitur yang tidak tersedia pada paket harus ditolak di server.
4. Batas penggunaan harus divalidasi di server.
5. Data historis tidak boleh dihapus akibat perubahan langganan.
6. Pengguna harus memperoleh informasi yang jelas ketika suatu fitur tidak tersedia.

### Perhatian terhadap operasional parkir

Sistem parkir menangani kendaraan dan uang pelanggan.

Karena itu, pembatasan langganan tidak boleh diterapkan secara sembarangan hingga menyebabkan:

- Kendaraan aktif tidak dapat diproses keluar.
- Transaksi yang sudah dibayar menjadi tidak konsisten.
- Saldo prepaid hilang.
- Data transaksi tidak dapat ditelusuri.
- Operasi finansial yang sedang berjalan menjadi rusak.

Jika tenant ditangguhkan, desain harus mempertimbangkan alur penyelesaian sesi aktif, akses riwayat yang diperlukan, dan kewajiban terhadap saldo prepaid.

Detail kebijakan pembatasan harus diputuskan sebelum implementasi enforcement produksi.

---

## 7. Batas Penggunaan

Batas penggunaan dikonfigurasi per paket.

Contoh jenis limit:

- `maxLocations`
- `maxUsers`
- `maxActiveSessions`
- `maxMonthlyTransactions`

Daftar di atas adalah contoh dan tidak otomatis menjadi limit produksi.

### 7.1 Validasi limit

Sebelum membuat resource baru:

1. Ambil langganan tenant yang berlaku.
2. Tentukan paket dan override yang sah.
3. Hitung penggunaan saat ini dengan query server.
4. Validasi apakah operasi masih diizinkan.
5. Jalankan pembuatan resource jika memenuhi syarat.

Untuk resource yang rentan dibuat secara bersamaan, gunakan pengamanan konsistensi yang sesuai agar limit tidak mudah terlewati akibat race condition.

### 7.2 Limit yang berubah

Jika limit paket diturunkan hingga penggunaan saat ini melebihi batas:

- Jangan menghapus resource yang sudah ada secara otomatis.
- Tampilkan kondisi penggunaan saat ini.
- Terapkan aturan untuk pembuatan resource baru.
- Berikan jalur untuk menyelesaikan konflik sesuai kebijakan produk.

---

## 8. Invoice

Invoice mencatat tagihan langganan.

Data minimum:

- Tenant.
- Langganan.
- Nomor invoice.
- Nominal.
- Mata uang.
- Periode tagihan.
- Snapshot paket dan harga.
- Tanggal penerbitan.
- Tanggal jatuh tempo.
- Status invoice.
- Waktu pembayaran jika lunas.

Status invoice dapat mencakup:

- `draft`
- `issued`
- `paid`
- `void`
- `overdue`

### Aturan invoice

- Nomor invoice harus unik sesuai cakupan yang ditetapkan.
- Invoice yang telah diterbitkan mempertahankan nominal historisnya.
- Perubahan harga paket tidak mengubah invoice yang sudah diterbitkan.
- Invoice tidak boleh dianggap lunas hanya karena pengguna menekan tombol pembayaran.
- Perubahan status invoice harus mengikuti aturan otorisasi.
- Invoice yang dibatalkan harus tetap memiliki jejak sesuai kebijakan penyimpanan.

---

## 9. Pembayaran Langganan

### 9.1 Metode pembayaran MVP

MVP dapat menggunakan pembayaran manual yang dikonfirmasi oleh Platform Admin.

Metode pembayaran harus mencerminkan metode yang benar-benar didukung.

Jangan menampilkan integrasi payment gateway otomatis jika belum diimplementasikan.

### 9.2 Alur pembayaran manual

Alur konseptual:

1. Tenant melihat invoice.
2. Tenant mengikuti instruksi pembayaran.
3. Tenant melakukan pembayaran di luar sistem jika metode manual digunakan.
4. Tenant mengirimkan informasi atau bukti pembayaran jika fitur tersebut tersedia.
5. Platform Admin memverifikasi pembayaran.
6. Sistem mencatat hasil verifikasi.
7. Invoice diperbarui menjadi lunas jika pembayaran valid.
8. Status langganan diperbarui sesuai aturan.
9. Riwayat pembayaran tersimpan.

Mengunggah bukti pembayaran tidak otomatis berarti pembayaran telah diterima.

### 9.3 Catatan pembayaran

Setiap pembayaran harus mencatat:

- Tenant.
- Invoice.
- Nominal.
- Metode pembayaran.
- Status.
- Referensi pembayaran jika tersedia.
- Petugas yang mengonfirmasi.
- Waktu konfirmasi.
- Waktu pembuatan.

Pembayaran yang telah dikonfirmasi tidak boleh dihapus diam-diam.

### 9.4 Pencegahan pembayaran ganda

Sistem harus mencegah satu pembayaran diproses berulang kali untuk melunasi invoice yang sama secara tidak sengaja.

Validasi status invoice dan pembayaran harus dilakukan di server.

---

## 10. Perpanjangan Langganan

Perpanjangan memperbarui periode langganan berdasarkan pembayaran yang sah atau tindakan administratif yang diizinkan.

Ketentuan:

- Tanggal mulai dan akhir periode harus jelas.
- Pembayaran yang belum dikonfirmasi tidak boleh memperpanjang langganan.
- Perpanjangan tidak boleh membuat periode ganda akibat request berulang.
- Invoice historis tetap tersimpan.
- Status langganan diperbarui sesuai kebijakan.
- Jika langganan memiliki periode aktif, kebijakan penambahan periode harus konsisten dan terdokumentasi.

Jangan menggunakan tanggal dari browser sebagai sumber kebenaran perpanjangan.

---

## 11. Perubahan Paket

Perubahan paket dapat mencakup upgrade atau downgrade.

Untuk MVP, alur perubahan paket boleh dilakukan secara manual oleh Platform Admin selama perubahan tercatat dan konsisten.

Ketentuan:

- Paket tujuan harus valid dan aktif sesuai kebijakan.
- Harga dan limit paket baru harus diambil dari data server.
- Perubahan harus memiliki waktu berlaku yang jelas.
- Invoice historis tidak boleh berubah.
- Snapshot periode langganan sebelumnya tetap tersedia.
- Perubahan fitur tidak boleh membuat data lama hilang.
- Perubahan paket harus tercatat di audit log.

Prorata otomatis, pengembalian selisih biaya, dan penjadwalan downgrade dapat dikembangkan kemudian jika memang dibutuhkan.

---

## 12. Web Admin Platform

Web Admin harus menyediakan pengelolaan langganan secara terpusat.

### 12.1 Pengelolaan paket

Platform Admin dapat:

- Melihat daftar paket.
- Membuat paket.
- Mengedit paket.
- Mengatur harga.
- Mengatur fitur.
- Mengatur limit.
- Mengatur durasi trial.
- Mengubah urutan tampilan.
- Mengaktifkan atau menonaktifkan paket.

### 12.2 Pengelolaan tenant

Platform Admin dapat melihat:

- Nama tenant.
- Status tenant.
- Paket aktif.
- Status langganan.
- Tanggal mulai periode.
- Tanggal akhir periode.
- Informasi invoice yang relevan.
- Riwayat pembayaran yang diperlukan.

Akses ke informasi tenant harus dibatasi sesuai kebutuhan administrasi.

### 12.3 Pengelolaan pembayaran

Platform Admin yang memiliki izin dapat:

- Melihat pembayaran yang menunggu verifikasi.
- Memeriksa informasi pembayaran.
- Mengonfirmasi pembayaran yang valid.
- Menolak pembayaran yang tidak valid dengan alasan.
- Melihat riwayat tindakan.

Semua perubahan finansial dan administratif yang sensitif harus dicatat.

---

## 13. Dashboard Tenant

Dashboard tenant dapat menampilkan ringkasan:

- Nama paket.
- Status langganan.
- Tanggal berakhir.
- Fitur yang tersedia.
- Penggunaan resource yang dibatasi.
- Informasi invoice yang belum lunas.
- Ajakan memperpanjang atau meningkatkan paket jika relevan.

Informasi harus diambil dari data yang sudah divalidasi server.

Jangan menampilkan status aktif berdasarkan nilai yang hanya disimpan di state frontend.

---

## 14. Audit Log Langganan

Catat perubahan penting seperti:

- Pembuatan paket.
- Perubahan harga.
- Perubahan fitur atau limit.
- Pengaktifan atau penonaktifan paket.
- Pemberian trial.
- Perubahan status langganan.
- Perubahan periode langganan.
- Penerbitan atau pembatalan invoice.
- Konfirmasi atau penolakan pembayaran.
- Perubahan paket tenant.
- Pemberian override khusus tenant.

Audit log minimal mencatat:

- Aktor.
- Waktu.
- Tindakan.
- Objek yang diubah.
- Nilai sebelum dan sesudah jika relevan.
- Alasan jika diwajibkan.

Jangan menyimpan rahasia autentikasi atau informasi sensitif yang tidak diperlukan.

---

## 15. Model Data

Gunakan koleksi yang didefinisikan pada `DATABASE_SCHEMA.md`:

- `subscriptionPlans`
- `subscriptions`
- `subscriptionInvoices`
- `subscriptionPayments`
- `subscriptionOverrides`
- `platformSettings`
- `auditLogs`

Jika dibutuhkan, struktur data dapat disesuaikan dengan kebutuhan implementasi aktual.

Namun, setiap perubahan harus mempertahankan:

- Isolasi tenant.
- Konsistensi pembayaran.
- Snapshot harga historis.
- Riwayat perubahan status.
- Audit untuk tindakan administratif.

Jangan membuat koleksi tambahan hanya untuk menduplikasi informasi yang sudah tersedia tanpa alasan yang jelas.

---

## 16. Keamanan dan Otorisasi

Seluruh tindakan langganan harus memvalidasi role dan permission di server.

Ketentuan:

- Hanya Platform Admin yang berwenang mengubah paket global.
- Owner hanya dapat membaca atau mengelola langganan tenant miliknya sesuai fitur yang tersedia.
- Tenant tidak dapat mengubah harga invoice sendiri.
- Tenant tidak dapat mengonfirmasi pembayaran sendiri jika alur mensyaratkan verifikasi Platform Admin.
- Browser tidak dapat mengubah status langganan secara langsung.
- Endpoint administratif harus dilindungi autentikasi dan otorisasi.
- Akses lintas tenant harus dibatasi dan diaudit.

Pemeriksaan UI tidak menggantikan validasi server.

---

## 17. Pengujian

Pengujian minimum:

1. Paket yang dinonaktifkan tidak ditawarkan untuk tenant baru.
2. Perubahan harga tidak mengubah invoice historis.
3. Trial tidak dimulai ulang hanya karena login ulang.
4. Trial yang berakhir tidak menghapus data operasional.
5. Invoice tidak menjadi lunas tanpa pembayaran yang valid.
6. Tenant tidak dapat mengonfirmasi pembayaran sendiri jika tidak diizinkan.
7. Pembayaran ganda tidak memperpanjang periode dua kali.
8. Perubahan paket tidak menghapus data historis.
9. Limit paket divalidasi di server.
10. Penggunaan yang melebihi limit ditangani sesuai kebijakan.
11. Staff tidak dapat mengakses pengaturan langganan tanpa izin.
12. Tenant A tidak dapat melihat invoice tenant B.
13. Status langganan yang berubah tidak merusak transaksi parkir aktif.
14. Perubahan konfigurasi paket tercatat di audit log.

---

## 18. Urutan Implementasi

Langganan bukan prioritas pertama untuk MVP operasional parkir.

Urutan yang disarankan:

### Tahap 1 — Persiapan

- Definisikan model paket.
- Definisikan status langganan.
- Tentukan aturan akses.
- Tentukan kebijakan trial.
- Tentukan batas penggunaan yang benar-benar diperlukan.

### Tahap 2 — Pengelolaan paket

- Daftar paket.
- Pembuatan dan pengeditan paket.
- Pengaturan harga.
- Pengaturan fitur dan limit.
- Pengaturan status paket.

### Tahap 3 — Langganan tenant

- Aktivasi trial.
- Penetapan paket.
- Status langganan.
- Periode langganan.
- Ringkasan langganan pada dashboard.

### Tahap 4 — Invoice dan pembayaran

- Pembuatan invoice.
- Pembayaran manual.
- Verifikasi pembayaran.
- Perpanjangan.
- Riwayat pembayaran.

### Tahap 5 — Enforcement

- Pemeriksaan fitur.
- Pemeriksaan limit.
- Penanganan kedaluwarsa.
- Penanganan suspended.
- Pengujian agar transaksi parkir tetap konsisten.

### Tahap 6 — Pengembangan lanjutan

Jika dibutuhkan:

- Payment gateway.
- Pembayaran berulang otomatis.
- Prorata.
- Upgrade atau downgrade terjadwal.
- Notifikasi pengingat pembayaran.
- Laporan pendapatan langganan.

Jangan mengerjakan semua fitur lanjutan sebelum fitur inti parkir siap digunakan.

---

## 19. Aturan untuk AI Coding Agent

Sebelum mengimplementasikan langganan:

1. Baca dokumen ini.
2. Baca `PRD.md`.
3. Baca `BUSINESS_RULES.md`.
4. Baca `DATABASE_SCHEMA.md`.
5. Baca `AUTH_AND_TENANCY.md`.
6. Periksa model dan implementasi yang sudah ada.
7. Validasi seluruh perubahan finansial di server.
8. Tambahkan pengujian.
9. Jalankan pemeriksaan kode yang tersedia.
10. Perbarui dokumentasi ketika kebijakan berubah.

Jangan:

- Mengarang harga paket produksi.
- Mengubah invoice historis akibat perubahan harga.
- Menganggap bukti pembayaran sebagai pembayaran terkonfirmasi.
- Membiarkan tenant mengubah status langganan sendiri.
- Menghapus data tenant karena langganan berakhir.
- Menerapkan limit hanya melalui frontend.
- Memblokir penyelesaian transaksi aktif tanpa kebijakan yang jelas.
- Membuat fitur pembayaran otomatis palsu yang sebenarnya belum terintegrasi.

Jika aturan harga, trial, atau pembatasan akses belum ditentukan, dokumentasikan keputusan yang masih terbuka dan jangan menganggapnya sebagai kebijakan produksi final.
