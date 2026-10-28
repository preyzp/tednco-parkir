# BUSINESS_RULES.md — TednCo Parkir

Dokumen ini merupakan sumber kebenaran untuk seluruh aturan bisnis TednCo Parkir. Implementasi aplikasi harus mengikuti aturan berikut dan tidak boleh membuat asumsi bisnis sendiri.

Jika ada perubahan aturan bisnis, perbarui dokumen ini sebelum atau bersamaan dengan perubahan kode.

---

## 1. Prinsip Umum

- Nama produk: **TednCo Parkir**.
- Bahasa antarmuka: Bahasa Indonesia.
- Zona waktu bisnis default: `Asia/Jakarta`.
- Mata uang: Rupiah (`IDR`).
- MVP berfokus pada operasional parkir kendaraan Motor dan Mobil.
- Sistem harus mendukung banyak tenant dan lokasi parkir.
- Seluruh transaksi dan saldo harus memiliki jejak audit yang jelas.
- Perhitungan finansial harus dilakukan dan divalidasi di server.
- Jangan mengandalkan nilai total, harga, saldo, atau identitas tenant yang dikirim browser tanpa validasi server.

### Istilah

| Istilah         | Pengertian                                                         |
| --------------- | ------------------------------------------------------------------ |
| Tenant          | Bisnis atau operator parkir yang menggunakan TednCo Parkir         |
| Lokasi          | Area parkir milik tenant                                           |
| Sesi parkir     | Catatan kendaraan sejak masuk sampai keluar                        |
| Kendaraan aktif | Kendaraan yang sesi parkirnya belum selesai atau dibatalkan        |
| Checkout        | Proses menyelesaikan sesi parkir dan memproses pembayaran          |
| Prepaid         | Saldo uang yang disimpan untuk pembayaran parkir di masa mendatang |
| Ledger          | Catatan setiap perubahan saldo prepaid                             |
| Tarif           | Harga layanan parkir yang berlaku pada suatu lokasi                |
| Audit log       | Catatan aktivitas penting untuk kebutuhan pemeriksaan              |

---

## 2. Identitas Kendaraan

### 2.1 Jenis kendaraan

MVP hanya mendukung:

- Motor
- Mobil

Struktur data harus memungkinkan jenis kendaraan ditambah pada masa mendatang tanpa mengubah logika bisnis secara menyeluruh.

### 2.2 Data kendaraan

Data kendaraan terdiri dari:

- Nomor polisi: wajib.
- Jenis kendaraan: wajib.
- Nama pelanggan: opsional.
- Nomor telepon: opsional.
- Catatan: opsional.

Nomor polisi adalah identitas utama kendaraan dalam operasional sehari-hari.

Nama dan nomor telepon pelanggan tidak boleh menjadi syarat untuk memasukkan kendaraan.

### 2.3 Normalisasi nomor polisi

Sistem harus menyimpan nomor polisi untuk tampilan dan menyediakan bentuk normalisasi untuk pencarian serta pencocokan.

Aturan normalisasi:

- Hilangkan spasi di awal dan akhir.
- Ubah huruf menjadi kapital.
- Hilangkan spasi internal untuk kebutuhan pencocokan.
- Pertahankan nomor polisi tampilan yang sesuai untuk dibaca pengguna.

Contoh:

- Input: `b 1234 xyz`
- Nomor polisi tampilan: dapat diformat sebagai `B 1234 XYZ`.
- Nilai pencocokan: `B1234XYZ`.

Jangan menganggap dua kendaraan berbeda hanya karena penulisan nomor polisinya menggunakan spasi atau kapitalisasi berbeda.

### 2.4 Kendaraan yang sedang parkir

Dalam tenant dan lokasi yang sama:

- Satu nomor polisi yang telah dinormalisasi hanya boleh memiliki satu sesi parkir aktif.
- Sistem harus menolak sesi baru jika kendaraan tersebut masih memiliki sesi aktif.
- Pemeriksaan duplikasi wajib dilakukan di server.
- Pencegahan duplikasi harus tetap aman ketika dua petugas mencoba memasukkan kendaraan yang sama secara bersamaan.
- Nomor polisi yang sama dapat memiliki riwayat sesi parkir berkali-kali setelah sesi sebelumnya selesai.

### 2.5 Pencarian kendaraan

Pencarian harus mendukung:

- Nomor polisi lengkap atau sebagian.
- Pencarian tanpa membedakan kapitalisasi.
- Filter jenis kendaraan.
- Filter status.
- Filter lokasi sesuai hak akses pengguna.

Semua hasil harus dibatasi oleh tenant dan lokasi yang diizinkan.

---

## 3. Sesi Parkir

### 3.1 Pencatatan kendaraan masuk

Saat kendaraan masuk, sistem membuat sesi parkir yang minimal menyimpan:

- Tenant dan lokasi.
- Referensi kendaraan.
- Snapshot nomor polisi.
- Snapshot jenis kendaraan.
- Waktu masuk.
- Petugas yang mencatat kendaraan masuk.
- Status sesi.
- Catatan jika ada.

Waktu masuk dibuat berdasarkan waktu server, bukan waktu perangkat pengguna.

Sistem tidak boleh membiarkan browser menentukan waktu masuk tanpa validasi.

### 3.2 Status sesi

Gunakan status sesi yang eksplisit, minimal:

- `active`: kendaraan masih dalam sesi parkir.
- `completed`: sesi selesai melalui checkout.
- `canceled`: sesi dibatalkan sesuai aturan pembatalan.

Sesi yang selesai atau dibatalkan tidak boleh kembali menjadi sesi aktif melalui perubahan status biasa.

Jika diperlukan koreksi, gunakan alur koreksi khusus dengan otorisasi dan audit log.

### 3.3 Kendaraan yang sedang parkir

Daftar kendaraan aktif harus menampilkan informasi yang relevan:

- Nomor polisi.
- Jenis kendaraan.
- Waktu masuk.
- Durasi parkir.
- Nama pelanggan jika tersedia.
- Catatan jika tersedia.
- Informasi prepaid jika relevan dan pengguna memiliki izin.

Durasi dihitung dari waktu masuk sampai waktu saat daftar ditampilkan.

Durasi ini merupakan informasi operasional, bukan dasar otomatis untuk mengubah tarif.

### 3.4 Perubahan data sesi aktif

Data kendaraan atau sesi yang masih aktif dapat dikoreksi oleh pengguna yang memiliki izin.

Perubahan dapat mencakup:

- Nomor polisi.
- Jenis kendaraan.
- Nama pelanggan.
- Nomor telepon.
- Catatan.

Perubahan nomor polisi harus melalui pemeriksaan duplikasi sesi aktif.

Perubahan penting harus mencatat:

- Nilai sebelum perubahan.
- Nilai sesudah perubahan.
- Pengguna yang melakukan perubahan.
- Waktu perubahan.
- Alasan jika diwajibkan oleh jenis koreksi.

Koreksi waktu masuk dibatasi kepada pengguna yang memiliki izin khusus dan wajib memiliki alasan serta audit log.

### 3.5 Sesi selesai

Sesi yang sudah selesai:

- Tidak dapat diedit seperti sesi aktif.
- Tidak boleh diproses checkout kembali.
- Tidak boleh membuat transaksi pembayaran kedua.
- Hanya dapat dikoreksi melalui mekanisme khusus yang berizin dan diaudit.

---

## 4. Pembatalan Sesi Parkir

Pembatalan hanya diizinkan jika:

1. Sesi masih aktif.
2. Belum ada pembayaran parkir yang berhasil.
3. Kendaraan ternyata tidak benar-benar menggunakan layanan parkir.

Alasan pembatalan yang tersedia:

- Gangguan operasional.
- Pelanggan berubah pikiran.
- Kendaraan tidak jadi masuk atau tidak meninggalkan kendaraan.
- Salah memasukkan kendaraan.
- Lainnya.

Jika memilih "Lainnya", petugas wajib mengisi catatan alasan.

Saat pembatalan berhasil:

- Status sesi menjadi `canceled`.
- Simpan pengguna yang membatalkan.
- Simpan waktu pembatalan.
- Simpan alasan dan catatan.
- Sesi tidak lagi tampil di daftar kendaraan aktif.
- Sesi tetap tersedia di riwayat.
- Tidak ada pendapatan parkir yang diakui.
- Tidak ada saldo prepaid yang dipotong.

Pembatalan hanya dapat dilakukan oleh pengguna yang berwenang.

Pembatalan harus divalidasi di server untuk mencegah pembatalan sesi yang sudah selesai atau sudah dibayar.

---

## 5. Tarif Parkir

### 5.1 Jenis tarif

MVP menyediakan dua jenis tarif:

- `regular`: Reguler.
- `overnight`: Menginap.

Tarif dikonfigurasi berdasarkan tenant, lokasi, dan jenis kendaraan.

### 5.2 Tarif reguler

Tarif reguler menggunakan harga yang dikonfigurasi untuk jenis kendaraan dan lokasi terkait.

Jangan mengasumsikan bahwa semua lokasi memiliki harga yang sama.

### 5.3 Tarif menginap

Tarif menginap menggunakan harga per malam yang dikonfigurasi.

Saat checkout dengan tarif Menginap:

- Petugas wajib memasukkan jumlah malam.
- Jumlah malam harus berupa bilangan bulat positif.
- Total dihitung berdasarkan tarif per malam dikalikan jumlah malam.

Rumus:

`total = tarifMenginapPerMalam × jumlahMalam`

Jumlah malam tidak boleh nol atau negatif.

### 5.4 Pemilihan tarif

Petugas memilih Reguler atau Menginap ketika checkout.

Sistem tidak boleh otomatis mengganti tarif menjadi Menginap hanya karena kendaraan melewati tengah malam atau melewati jam operasional.

Aturan ini disengaja agar petugas tetap dapat menyesuaikan transaksi dengan kondisi operasional sebenarnya.

#### Tarif, jam operasional, dan saran Menginap (keputusan operator 2026-10-27, final P4.6 2026-10-28)

**Pengaturan per lokasi**

- Owner mengatur tarif per lokasi dan per jenis kendaraan: Motor dan Mobil, masing-masing Reguler dan Menginap per malam. Lokasi berbeda boleh memiliki tarif berbeda.
- Nominal tarif berupa bilangan bulat Rupiah **Rp1–Rp10.000.000**.
- Owner mengatur satu jam buka dan jam tutup **harian** per lokasi (zona waktu lokasi). Jam tutup boleh melewati tengah malam (contoh buka 18.00, tutup 02.00). Jam buka dan jam tutup tidak boleh sama.
- Belum termasuk MVP: jadwal mingguan (jam berbeda per hari), hari libur, dan lokasi 24 jam.
- Lokasi yang belum diatur memakai default yang disetujui operator: Reguler Rp5.000 dan Menginap Rp10.000 per malam (sama untuk Motor dan Mobil), jam 05.00–00.00. Default bukan daftar harga produksi; pengaturan lokasi selalu didahulukan, dan sumbernya ("Tarif lokasi"/"Tarif default", "jam lokasi"/"jam default") ditampilkan.

**Saat checkout**

- Tarif dan jam operasional **terbaru** berlaku saat checkout, termasuk untuk kendaraan yang sudah parkir sebelum pengaturan diubah — bukan tarif pada saat kendaraan masuk.
- Sistem hanya **menyarankan** Reguler atau Menginap beserta jumlah malam. Owner tetap memilih tarif secara manual dan boleh menyesuaikan jumlah malam (bilangan bulat positif). Sistem tidak pernah mengganti tarif sendiri.
- Saran jumlah malam = banyaknya **jam tutup lokasi yang dilewati** selama parkir: setiap batas jam tutup antara waktu masuk dan waktu keluar dihitung satu malam. Keluar **tepat** pada jam tutup belum dihitung; masuk setelah jam tutup hanya menghitung jam tutup berikutnya. Jam tutup terbaru dipakai untuk seluruh masa parkir sesi yang masih aktif. Jam buka hanya informasi.
- Menginap **menggantikan** Reguler: total = tarif per malam × jumlah malam.
- Lebih dari satu tarif aktif untuk kombinasi yang sama, atau nominal di luar batas, memblokir checkout sampai Owner menyimpan ulang pengaturan.

**Setelah checkout**

- Transaksi yang sudah selesai menyimpan snapshot tarif dan jam operasional yang dipakai, dan **tidak berubah** walaupun tarif atau jam diubah kemudian.

**Format nominal**

- Nominal Rupiah ditampilkan dalam format Indonesia (id-ID): titik sebagai pemisah ribuan, koma sebagai pemisah desimal bila diperlukan; tarif tanpa pecahan. Contoh: `Rp5.000`, `Rp10.000.000`. Input tarif menampilkan titik ribuan saat diketik; nilai disimpan sebagai angka bulat.

### 5.5 Perubahan tarif

Tarif dapat diubah oleh pengguna yang memiliki izin.

Perubahan tarif tidak boleh mengubah transaksi yang sudah selesai.

Setiap transaksi harus menyimpan snapshot informasi tarif yang digunakan, termasuk:

- Jenis tarif.
- Jenis kendaraan.
- Harga satuan.
- Jumlah malam jika berlaku.
- Total akhir.
- Waktu transaksi.

Contoh harga hanya untuk pengujian atau dokumentasi, bukan harga produksi yang ditetapkan secara permanen.

### 5.6 Harga khusus dan diskon

Petugas tidak boleh bebas mengubah total pembayaran.

Harga khusus atau diskon hanya dapat digunakan oleh pengguna yang memiliki izin.

Setiap perubahan harus mencatat:

- Harga sebelum perubahan.
- Harga setelah perubahan.
- Alasan.
- Pengguna yang melakukan perubahan.
- Waktu perubahan.

---

## 6. Checkout dan Pembayaran

### 6.1 Alur checkout

Alur dasar checkout:

1. Petugas memilih kendaraan aktif.
2. Sistem menampilkan informasi sesi.
3. Petugas memilih tarif Reguler atau Menginap.
4. Jika Menginap, petugas memasukkan jumlah malam.
5. Server menghitung total berdasarkan konfigurasi tarif.
6. Sistem menampilkan total pembayaran.
7. Petugas memilih metode pembayaran yang tersedia.
8. Server memvalidasi ulang sesi, tarif, izin, dan metode pembayaran.
9. Server memproses transaksi secara aman.
10. Sesi ditandai selesai setelah pembayaran atau penggunaan prepaid berhasil diproses.
11. Sistem menampilkan detail transaksi.

Jangan menandai sesi selesai hanya karena tombol checkout ditekan.

### 6.2 Metode pembayaran

MVP mendukung:

- `cash`: Tunai.
- `qris`: QRIS dengan konfirmasi manual.
- `prepaid`: Saldo prepaid.

Metode prepaid hanya tersedia jika saldo dan status prepaid memenuhi persyaratan.

### 6.3 Pembayaran tunai

Untuk pembayaran tunai:

- Server menentukan jumlah tagihan.
- Petugas memasukkan nominal uang yang diterima jika diperlukan.
- Nominal yang diterima harus cukup untuk menutup tagihan.
- Sistem menghitung kembalian.
- Jumlah pembayaran dan kembalian harus divalidasi.

Kembalian bukan pendapatan tambahan.

### 6.4 Pembayaran QRIS

QRIS pada MVP hanya dicatat sebagai pembayaran yang dikonfirmasi secara manual.

Ketentuannya:

- Membuat transaksi QRIS tidak berarti pembayaran berhasil.
- Sesi tidak boleh diselesaikan hanya karena metode QRIS dipilih.
- Petugas harus memverifikasi penerimaan pembayaran terlebih dahulu.
- Konfirmasi disimpan bersama identitas petugas dan waktu konfirmasi.
- Jangan mengklaim sistem sudah terintegrasi dengan payment gateway.

Integrasi QRIS otomatis dapat ditambahkan pada fase berikutnya.

### 6.5 Pencegahan transaksi ganda

Satu sesi hanya boleh diselesaikan satu kali.

Sistem harus mencegah:

- Checkout berulang.
- Dua transaksi sukses untuk satu sesi.
- Pemotongan saldo prepaid ganda.
- Pemrosesan ganda akibat tombol ditekan berkali-kali.
- Pemrosesan ganda akibat retry jaringan.

Gunakan mekanisme transaksi database, idempotency, atau pengamanan setara sesuai kemampuan infrastruktur.

Jika hasil permintaan tidak diketahui karena timeout, periksa status transaksi terlebih dahulu sebelum mengulangi pemrosesan.

### 6.6 Pembayaran berhasil

Setelah pembayaran berhasil:

- Simpan transaksi.
- Simpan metode pembayaran.
- Simpan jumlah yang dibayar.
- Simpan waktu pembayaran.
- Simpan petugas yang memproses atau mengonfirmasi pembayaran.
- Simpan snapshot tarif.
- Simpan referensi sesi parkir.
- Tandai sesi sebagai `completed`.
- Pastikan seluruh perubahan penting konsisten.

Jika penyimpanan transaksi gagal, sistem tidak boleh menampilkan keberhasilan palsu.

### 6.7 Koreksi transaksi selesai

Petugas biasa tidak dapat mengubah tarif atau jumlah transaksi yang sudah selesai.

Koreksi hanya dapat dilakukan oleh pengguna yang memiliki izin khusus.

Koreksi wajib memiliki alasan dan audit log.

Jangan mengubah transaksi lama secara diam-diam atau menghapus jejak transaksi sebelumnya.

---

## 7. Aturan Prepaid

### 7.1 Definisi

Prepaid adalah saldo uang yang disimpan untuk membayar layanan parkir di masa mendatang.

Prepaid bukan:

- Paket jumlah kunjungan.
- Paket jumlah hari.
- Tiket parkir.
- Pembayaran otomatis pada saat kendaraan masuk.

### 7.2 Kepemilikan saldo

Saldo prepaid terkait dengan kendaraan yang dikenali melalui nomor polisi yang dinormalisasi dan lokasi parkir tertentu.

Nomor polisi yang sama pada lokasi berbeda dapat memiliki saldo prepaid berbeda.

Saldo prepaid tidak boleh digunakan lintas lokasi.

### 7.3 Pendaftaran prepaid

Data minimal:

- Nomor polisi.
- Jenis kendaraan.
- Nominal deposit awal.
- Metode deposit.
- Petugas yang mencatat.
- Waktu transaksi.

Nama dan nomor telepon bersifat opsional.

Pendaftaran dapat menggunakan data kendaraan yang sudah ada.

Prepaid baru aktif setelah deposit awal berhasil dikonfirmasi dan dicatat.

Nominal deposit harus lebih besar dari nol.

Tidak ada paket deposit tetap pada MVP.

### 7.4 Deposit prepaid

Deposit dapat dilakukan menggunakan:

- Tunai.
- QRIS dengan konfirmasi manual.

Deposit QRIS belum boleh menambah saldo sebelum pembayaran diverifikasi.

Setiap deposit harus menghasilkan catatan ledger yang memuat:

- Nominal.
- Jenis aktivitas.
- Waktu.
- Petugas.
- Metode pembayaran.
- Status.
- Referensi transaksi terkait jika ada.

Pengguna yang dapat mencatat deposit ditentukan melalui konfigurasi izin.

### 7.5 Waktu pemotongan saldo

Saldo prepaid tidak dipotong ketika:

- Kendaraan masuk.
- Kendaraan melewati tengah malam.
- Kendaraan masih terparkir.
- Hari parkir berganti.

Saldo hanya dipotong saat checkout berhasil menggunakan metode pembayaran Prepaid.

### 7.6 Checkout dengan prepaid

Ketentuan metode pembayaran:

| Kondisi prepaid                    | Metode checkout yang tersedia |
| ---------------------------------- | ----------------------------- |
| Tidak terdaftar                    | Tunai atau QRIS               |
| Tidak aktif                        | Tunai atau QRIS               |
| Aktif dan saldo mencukupi          | Prepaid, Tunai, atau QRIS     |
| Aktif tetapi saldo tidak mencukupi | Tunai atau QRIS               |

Jika saldo prepaid tidak mencukupi:

- Jangan memotong sebagian saldo.
- Jangan membuat saldo negatif.
- Jangan menyelesaikan checkout menggunakan prepaid.
- Petugas dapat memilih Tunai atau QRIS.

Jika petugas memilih Tunai atau QRIS, saldo prepaid tetap tersimpan.

Sistem tidak boleh otomatis menonaktifkan prepaid karena saldo tidak mencukupi.

### 7.7 Pemotongan saldo

Saat checkout menggunakan prepaid:

1. Server membaca status prepaid terbaru.
2. Server menghitung ulang total tagihan.
3. Server memastikan saldo mencukupi.
4. Server memastikan sesi masih aktif.
5. Server memproses pemotongan saldo dan pencatatan transaksi secara konsisten.
6. Server mencatat ledger debit.
7. Server menyelesaikan sesi.

Semua operasi harus terlindungi dari pemrosesan ganda dan kondisi dua checkout bersamaan.

Saldo tidak boleh menjadi negatif.

### 7.8 Penonaktifan prepaid

Prepaid dapat dinonaktifkan oleh pengguna yang memiliki izin.

Saat dinonaktifkan:

- Saldo tidak dihapus.
- Riwayat transaksi tidak dihapus.
- Prepaid tidak tersedia sebagai metode pembayaran baru.
- Kendaraan tetap dapat membayar menggunakan Tunai atau QRIS.

Jika diaktifkan kembali, saldo sebelumnya dapat digunakan sesuai saldo yang masih tersedia.

### 7.9 Ledger saldo

Saldo saat ini tidak boleh menjadi satu-satunya sumber informasi perubahan saldo.

Setiap perubahan harus tercatat sebagai ledger, termasuk:

- Deposit.
- Pemotongan untuk parkir.
- Refund.
- Koreksi saldo yang diizinkan.

Setiap ledger mencatat nominal, jenis aktivitas, saldo sebelum dan sesudah jika memungkinkan, waktu, pelaku, alasan jika relevan, serta referensi transaksi.

Catatan ledger yang sudah diposting tidak boleh dihapus atau diubah diam-diam.

Koreksi dilakukan dengan transaksi penyesuaian yang dapat diaudit.

### 7.10 Pendapatan dan deposit prepaid

Deposit prepaid bukan pendapatan layanan parkir yang langsung diakui.

Contoh:

- Pelanggan deposit Rp100.000.
- Pelanggan menggunakan saldo Rp20.000 untuk parkir.
- Sisa saldo Rp80.000.

Laporan harus membedakan:

- Deposit masuk.
- Pemakaian saldo untuk layanan parkir.
- Refund.
- Penyesuaian saldo.
- Total saldo prepaid yang masih menjadi kewajiban.

Jangan menjumlahkan deposit dan pemakaian prepaid sebagai dua pendapatan terpisah untuk layanan yang sama.

---

## 8. Refund Prepaid

### 8.1 Otorisasi

Refund hanya dapat dilakukan oleh Owner atau Admin yang memiliki izin.

Staff tidak dapat melakukan refund secara default.

### 8.2 Aturan refund

Refund harus:

- Mengacu pada saldo yang tersedia.
- Memiliki nominal positif.
- Tidak melebihi saldo yang dapat dikembalikan.
- Tidak membuat saldo negatif.
- Mencatat alasan.
- Mencatat pelaku dan waktu.
- Menghasilkan ledger refund.
- Memiliki status yang jelas.

MVP memprioritaskan refund penuh. Refund sebagian dapat didukung jika alurnya tetap aman dan tercatat.

### 8.3 Metode dan status refund

Refund dapat dilakukan secara tunai atau melalui transfer sesuai kemampuan operasional.

Refund tunai dianggap selesai setelah uang diserahkan dan dikonfirmasi oleh petugas berwenang.

Refund melalui transfer dapat memiliki status tertunda sampai transfer diverifikasi.

Refund yang masih tertunda tidak boleh diproses kembali sebagai refund baru untuk jumlah yang sama tanpa pemeriksaan status.

### 8.4 Refund dan sesi aktif

Jika kendaraan memiliki sesi parkir aktif, sesi tersebut harus diselesaikan atau ditangani terlebih dahulu sebelum refund penuh yang memerlukan penonaktifan prepaid.

Refund tidak otomatis menonaktifkan prepaid.

Penonaktifan dilakukan sebagai tindakan terpisah oleh pengguna yang memiliki izin.

---

## 9. Riwayat dan Laporan

### 9.1 Riwayat parkir

Riwayat parkir harus menampilkan sesi yang telah selesai dan dibatalkan.

Informasi minimum:

- Nomor polisi.
- Jenis kendaraan.
- Waktu masuk.
- Waktu keluar jika selesai.
- Jenis tarif.
- Jumlah malam jika Menginap.
- Total transaksi.
- Metode pembayaran.
- Status sesi.
- Petugas terkait.

Sesi yang dibatalkan tidak menghasilkan pendapatan.

### 9.2 Filter tanggal

Filter tanggal yang disediakan:

- Hari ini — default.
- Kemarin.
- 7 Hari Terakhir, termasuk hari ini.
- Bulan Ini.
- Bulan Lalu.
- Rentang tanggal khusus.

Semua batas tanggal harus dihitung berdasarkan zona waktu lokasi atau zona waktu bisnis yang dikonfigurasi.

### 9.3 Dasar penghitungan tanggal

Gunakan waktu yang sesuai untuk setiap metrik:

- Aktivitas kendaraan masuk berdasarkan `entryAt`.
- Aktivitas kendaraan keluar berdasarkan `exitAt`.
- Pendapatan pembayaran berdasarkan `paymentAt`.

Contoh:

Kendaraan masuk hari Senin dan keluar hari Selasa.

- Aktivitas masuk dihitung pada hari Senin.
- Aktivitas keluar dihitung pada hari Selasa.
- Pendapatan dihitung pada tanggal pembayaran berhasil, yaitu hari Selasa.

Jangan menggunakan satu timestamp untuk semua jenis laporan.

### 9.4 Laporan parkir

Metrik minimum:

- Pendapatan layanan parkir.
- Jumlah kendaraan masuk.
- Jumlah kendaraan keluar.
- Jumlah transaksi selesai.
- Jumlah pembatalan.

Detail transaksi harus bisa diperiksa sesuai izin pengguna.

### 9.5 Laporan prepaid

Metrik minimum:

- Total deposit.
- Total pemakaian saldo.
- Total refund.
- Total koreksi saldo.
- Total saldo prepaid yang masih tersimpan.

Laporan prepaid harus dipisahkan secara jelas dari pendapatan layanan parkir.

### 9.6 Batasan laporan MVP

MVP tidak wajib menyediakan:

- Ekspor Excel.
- Ekspor CSV.
- Grafik finansial kompleks.
- Rekonsiliasi otomatis dengan penyedia pembayaran.

Jangan menambahkan fitur tersebut sebelum kebutuhan dasar terpenuhi.

---

## 10. Pengaturan Jam Operasional

Jam operasional disimpan sebagai konfigurasi bisnis atau lokasi.

Jam operasional digunakan untuk informasi dan kebutuhan operasional.

Jam operasional tidak secara otomatis:

- Menyelesaikan sesi parkir.
- Membuat sesi baru.
- Mengubah tarif reguler menjadi Menginap.
- Memotong saldo prepaid.
- Membuat transaksi pembayaran.

Perubahan jam operasional tidak boleh mengubah transaksi historis.

MVP (P4.6): jam operasional adalah satu jam buka dan jam tutup harian per lokasi, diatur Owner, dan hanya dipakai untuk saran jumlah malam saat checkout (lihat §5.4). Jam terbaru berlaku untuk sesi aktif. Jadwal mingguan, hari libur, dan lokasi 24 jam belum didukung.

---

## 11. Peran dan Izin

### 11.1 Platform Admin

Platform Admin mengelola tingkat platform, seperti:

- Tenant.
- Paket langganan.
- Status langganan.
- Konfigurasi platform.

Akses lintas tenant harus dibatasi sesuai kebutuhan dan dicatat melalui audit log jika menyentuh data operasional.

### 11.2 Owner

Owner memiliki akses penuh terhadap tenant miliknya, termasuk:

- Operasional parkir.
- Pengaturan lokasi.
- Tarif.
- Pengguna dan izin.
- Laporan.
- Prepaid.
- Refund sesuai kebijakan sistem.
- Pengaturan langganan tenant.

Owner tidak perlu berganti role untuk melakukan pekerjaan operasional biasa.

### 11.3 Admin

Admin menjalankan tugas administratif sesuai izin yang diberikan.

Akses ke laporan finansial, refund, koreksi transaksi, dan pengaturan sensitif harus ditentukan oleh permission yang eksplisit.

### 11.4 Staff

Staff menjalankan operasional pada lokasi yang ditugaskan, termasuk sesuai izin:

- Mencatat kendaraan masuk.
- Melihat kendaraan aktif.
- Memproses checkout.
- Mengedit data sesi aktif.
- Membatalkan sesi yang memenuhi syarat.
- Mencatat deposit jika memiliki izin.
- Melihat data prepaid jika memiliki izin.

Staff tidak boleh secara default:

- Melakukan refund.
- Mengubah transaksi selesai.
- Mengubah tarif global.
- Mengelola langganan.
- Mengakses data tenant atau lokasi yang tidak diizinkan.

### 11.5 Izin khusus

Izin berikut dapat dikonfigurasi:

- Melihat saldo dan detail prepaid.
- Mendaftarkan prepaid.
- Mencatat deposit.
- Mengaktifkan atau menonaktifkan prepaid.
- Melihat laporan finansial.
- Mengoreksi transaksi.
- Melakukan refund.
- Mengoreksi saldo.

Menyembunyikan tombol di UI tidak cukup untuk melindungi tindakan sensitif. Server wajib memvalidasi izin pada setiap permintaan.

---

## 12. Multi-Tenant dan Multi-Lokasi

Setiap data bisnis harus memiliki identitas tenant yang jelas.

Data operasional yang terkait lokasi juga harus menyimpan referensi lokasi jika relevan.

Ketentuan:

- Pengguna hanya dapat mengakses tenant tempat ia menjadi anggota.
- Pengguna hanya dapat mengakses lokasi yang diizinkan.
- Tenant ID tidak boleh dipercaya hanya karena dikirim dari browser.
- Setiap query dan mutasi tenant harus menggunakan konteks tenant hasil autentikasi dan otorisasi server.
- Perubahan tenant atau lokasi aktif harus divalidasi.
- ID data dari tenant lain tidak boleh memberikan akses ke data tersebut.
- Saldo prepaid tidak dapat digunakan lintas lokasi.
- Laporan harus mengikuti cakupan tenant dan lokasi pengguna.

Jangan mengandalkan filter di frontend sebagai perlindungan isolasi data.

---

## 13. Audit Log

Audit log wajib tersedia untuk tindakan penting, termasuk:

- Perubahan tarif.
- Perubahan data kendaraan atau sesi yang signifikan.
- Koreksi waktu masuk.
- Pembatalan sesi.
- Koreksi harga atau diskon.
- Koreksi transaksi selesai.
- Deposit prepaid.
- Pemotongan saldo prepaid.
- Refund.
- Koreksi saldo.
- Perubahan izin pengguna.
- Perubahan konfigurasi tenant yang sensitif.
- Perubahan status langganan.

Informasi audit minimal:

- Tenant.
- Lokasi jika relevan.
- Aktor.
- Jenis tindakan.
- Jenis dan ID objek.
- Waktu.
- Ringkasan perubahan sebelum dan sesudah jika relevan.
- Alasan jika diwajibkan.

Jangan menyimpan password, token sesi, atau rahasia autentikasi di audit log.

Audit log tidak boleh dapat diubah oleh pengguna operasional biasa.

---

## 14. Langganan

### 14.1 Prinsip

Langganan mengatur akses tenant terhadap fitur dan batas penggunaan TednCo Parkir.

Pengaturan paket harus dapat dikelola melalui Web Admin tanpa perlu deploy ulang untuk perubahan harga atau batas paket.

### 14.2 Status langganan

Status yang didukung:

- `trialing`
- `active`
- `past_due`
- `grace_period`
- `suspended`
- `canceled`
- `expired`

Aturan transisi status harus dikelola secara eksplisit.

### 14.3 Perubahan paket

Harga dan ketentuan langganan harus disimpan sebagai snapshot pada invoice atau periode langganan yang sesuai.

Perubahan paket tidak boleh mengubah invoice historis.

Fitur yang tidak tersedia pada paket tidak boleh hanya disembunyikan di frontend; backend juga harus memvalidasi hak akses fitur.

### 14.4 Data dan masa kedaluwarsa

Langganan yang kedaluwarsa tidak boleh menghapus data operasional tenant.

Pembatasan akses karena status langganan harus memiliki aturan yang jelas dan tidak boleh menyebabkan kehilangan data.

Pembayaran manual dapat digunakan pada MVP.

Integrasi payment gateway dan pembayaran berulang otomatis bukan syarat untuk menyelesaikan fitur inti parkir.

Harga dan batas paket belum dianggap final sampai ditentukan secara eksplisit.

---

## 15. Aturan Konsistensi Data

Seluruh operasi finansial harus dirancang agar konsisten ketika terjadi:

- Dua petugas memproses sesi yang sama.
- Tombol ditekan berulang kali.
- Permintaan dikirim ulang.
- Koneksi terputus setelah server memproses transaksi.
- Saldo berubah bersamaan.
- Dua checkout menggunakan saldo prepaid yang sama.
- Pembayaran QRIS belum dikonfirmasi.

Gunakan transaksi database dan/atau mekanisme atomic update yang sesuai dengan MongoDB dan deployment yang digunakan.

Jangan menganggap semua operasi otomatis atomik hanya karena menggunakan MongoDB.

Jika operasi memerlukan transaksi multi-dokumen, pastikan deployment MongoDB mendukungnya. Jika tidak, rancang mekanisme konsistensi yang sesuai sebelum implementasi.

Nilai total, saldo, status sesi, dan status pembayaran harus divalidasi kembali di server.

---

## 16. Aturan Implementasi untuk AI Coding Agent

Sebelum mengimplementasikan fitur bisnis:

1. Baca bagian relevan dari dokumen ini.
2. Periksa struktur data dan implementasi yang sudah ada.
3. Identifikasi risiko duplikasi transaksi, saldo, dan isolasi tenant.
4. Implementasikan validasi di server.
5. Tambahkan pengujian untuk kondisi normal dan kondisi gagal.
6. Jalankan lint, typecheck, test, dan build yang tersedia.
7. Perbarui dokumen jika keputusan bisnis berubah.

Jangan:

- Mengarang aturan tarif.
- Mengasumsikan jam operasional menentukan tarif menginap.
- Memotong prepaid pada saat kendaraan masuk.
- Menganggap deposit prepaid sebagai pendapatan parkir.
- Menganggap QRIS berhasil tanpa konfirmasi.
- Membiarkan saldo negatif.
- Memproses satu sesi dua kali.
- Menghapus riwayat transaksi demi memperbaiki data.
- Membuka akses lintas tenant berdasarkan ID yang dikirim browser.
- Mengubah aturan bisnis secara diam-diam.

Jika ada aturan yang belum jelas, pilih solusi yang paling aman untuk data dan uang, dokumentasikan asumsi tersebut, lalu minta konfirmasi sebelum menerapkan perubahan yang mengubah perilaku bisnis.
