# OPERATIONS.md — TednCo Parkir

Panduan operasional ringkas untuk development dan pilot: health check, log, gangguan koneksi, dan kesiapan demo. Dokumen ini tidak berisi credential atau token. Jangan pernah menempelkan URI MongoDB, password, atau `HEALTHCHECK_TOKEN` ke dokumen, chat, tiket, atau tangkapan layar.

## 1. Health check — `GET /api/health`

| Mode | Permintaan | Respons | Menyentuh database? |
|---|---|---|---|
| Liveness aplikasi | tanpa header `x-health-token` | `200 {"status":"ok"}` | Tidak |
| Database health | header `x-health-token` = `HEALTHCHECK_TOKEN` | `200 {"status":"healthy","database":"ok"}` atau `503 {"status":"unhealthy","database":"…"}` | Ya, 1 ping (di-cache) |
| Ditolak | token salah/kosong, atau `HEALTHCHECK_TOKEN` belum dikonfigurasi | `401 {"status":"unauthorized"}` | Tidak |

- **Liveness** hanya membuktikan proses Next.js menjawab. Liveness `ok` **bukan** berarti database sehat.
- **Database health** menjalankan `ping` MongoDB lewat koneksi aplikasi yang sama. Batas waktunya dari driver: ping ±2,5 detik bila sudah terhubung; bila koneksi belum ada, connect dibatasi 5 detik (`serverSelectionTimeoutMS`) lalu ping — total maksimal ±7,5 detik.
- Semua respons memakai `Cache-Control: no-store` dan tidak pernah memuat URI, host, nama database, credential, atau pesan error driver.
- Token salah dan token belum dikonfigurasi menghasilkan respons yang sama, sehingga konfigurasi server tidak dapat ditebak.

### Arti nilai `database`

| Nilai | Arti | Kemungkinan penyebab |
|---|---|---|
| `ok` (`healthy`) | Ping berhasil | — |
| `timeout` | Ping tidak selesai dalam batas waktu | Atlas lambat/beban tinggi, tidak ada primary (failover), jaringan lambat |
| `unreachable` | Tidak dapat terhubung ke cluster | IP belum ada di Atlas IP Access List, cluster di-pause/down, DNS/internet putus, TLS ditolak |
| `config` | Konfigurasi server tidak valid | `MONGODB_URI`/`MONGODB_DB_NAME` kosong atau salah format di environment |
| `error` | Server menjawab dengan error lain | Hak akses user database, perubahan Atlas; lihat log `code`/`codeName` |

### Cache 30 detik

Hasil database health (sehat **maupun** tidak sehat) disimpan 30 detik per proses server, dan permintaan bersamaan berbagi satu ping. Akibatnya:
- Monitoring yang sering tidak membebani Atlas M0 (maksimal ±1 ping per 30 detik per proses).
- Setelah Atlas pulih, status `unhealthy` bisa bertahan sampai 30 detik. Tunggu 30 detik sebelum menyimpulkan masalah masih ada.
- Restart server mengosongkan cache.

## 2. Mengonfigurasi `HEALTHCHECK_TOKEN`

1. Buat nilai acak minimal 32 karakter di terminal lokal (jangan ditempel ke tempat lain):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Tambahkan ke `.env.local` (development) atau secret environment deployment (pilot/production):
   ```
   HEALTHCHECK_TOKEN=<nilai-acak-minimal-32-karakter>
   ```
   Token yang kosong, kurang dari 32 karakter, atau diawali/diakhiri spasi dianggap **tidak dikonfigurasi** (database health nonaktif).
3. Restart dev server / redeploy agar environment terbaca.
4. Jangan commit `.env.local`. `.env.example` hanya berisi placeholder kosong.

## 3. Menguji health dengan aman

Gunakan variabel environment supaya token tidak tertulis di riwayat perintah atau output:

```bash
# Liveness (tanpa database)
curl -s -i http://localhost:3000/api/health

# Database health — token dibaca dari variabel shell, tidak diketik
curl -s -i -H "x-health-token: $HEALTHCHECK_TOKEN" http://localhost:3000/api/health
```

PowerShell (Windows PowerShell 5.1 dan 7; `curl.exe`, bukan alias `curl`):
```powershell
curl.exe -s -i -H "x-health-token: $env:HEALTHCHECK_TOKEN" http://localhost:3000/api/health
```
Isi `$HEALTHCHECK_TOKEN` / `$env:HEALTHCHECK_TOKEN` untuk sesi terminal itu saja dari nilai di `.env.local`, tanpa mencetaknya.

- Ping bersifat read-only; tidak ada data bisnis yang dibaca atau ditulis.
- Jangan menguji dengan cara mematikan Atlas, mengubah IP Access List, atau mengganti URI di environment yang dipakai orang lain.
- Jangan melakukan polling lebih sering dari 1 menit; untuk monitoring eksternal nanti, 5 menit sudah cukup.

## 4. Membaca log operasional

Server menulis satu baris JSON per gangguan ke `console.error` (terminal dev server; di development juga `.next/dev/logs/next-development.log`). Cari `"event":"operational_error"`:

```json
{"level":"error","event":"operational_error","operation":"parking.checkout","outcome":"unknown","phase":"lookup","category":"network","errorClass":"MongoNetworkError"}
```

| Field | Isi |
|---|---|
| `operation` | `vehicle.entry`, `parking.checkout`, `location.settings.update`, `index.verify`, `health.database`, `auth.session`, `auth.guard`, `dashboard.read`, `vehicles.read`, `checkout.read`, `settings.read` |
| `outcome` | `unavailable` (pasti tidak terjadi), `unknown` (mungkin sudah tersimpan), `resolved` (hasil tersimpan ditemukan kemudian) |
| `phase` | `connect`, `index`, `transaction`, `lookup`, `ping`, `read` |
| `category` | `timeout`, `network`, `server`, `unknown` — dari kelas error, bukan pesannya |
| `errorClass`, `code`, `codeName`, `labels`, `causeClass` | Hanya nilai dari allowlist / pola aman |

Log **tidak pernah** memuat message/stack driver, URI, host, credential, plat nomor, nominal, nama lokasi, atau id tenant. Saat berbagi log, salin baris JSON ini saja — jangan menyalin baris lain dari terminal yang mungkin memuat informasi environment.

Hasil bisnis (plat duplikat, validasi, `price_changed`, konflik pengaturan, login salah/401) **tidak** dicatat sebagai gangguan.

## 5. Membedakan sumber masalah

| Gejala | Kemungkinan | Langkah |
|---|---|---|
| Liveness gagal / tidak menjawab | Aplikasi/host mati, port salah, build gagal | Cek proses server dan terminal; restart |
| Liveness `ok`, health `unreachable` sejak awal, semua halaman "Layanan belum tersedia" | **IP Access List** Atlas belum memuat IP jaringan ini, atau internet/DNS putus | Cek IP publik saat ini di Atlas → Network Access; cek koneksi internet |
| Health `unreachable`/`timeout` setelah sebelumnya sehat, di semua jaringan | **Atlas** (cluster di-pause, maintenance, failover, insiden) | Cek Atlas UI dan status.mongodb.com |
| Health `timeout` sesekali, pulih sendiri | Jaringan lambat / beban M0 | Ulangi setelah 30 detik; pertimbangkan jaringan lain |
| Health `config` | Environment server salah | Periksa `MONGODB_URI`/`MONGODB_DB_NAME` (tanpa mencetak nilainya) |
| Health `ok`, tetapi satu fitur gagal | **Aplikasi** (bug, modul basi setelah HMR, index belum ada) | Lihat log `operation`; restart dev server; pesan "belum siap di server" = index belum ada |
| Login 401 padahal password benar | `MONGODB_DB_NAME` menunjuk database lain | Cocokkan nama database (lihat HANDOFF 2026-10-28) |
| HTTP 500 setelah mengubah server action | Modul HMR basi | Restart dev server |

## 6. Prosedur status "belum pasti" (unknown)

Status unknown berarti server tidak dapat memastikan apakah perubahan tersimpan. Aplikasi tidak pernah menampilkan sukses palsu.

### Kendaraan masuk — "Status pencatatan belum pasti"
1. Jangan langsung mencatat ulang. Tekan **Periksa daftar kendaraan** (mencari plat yang sama).
2. Plat muncul dengan status Parkir → sudah tercatat. Selesai.
3. Plat tidak muncul dan daftar tampil normal → catat ulang. Aman: unique index mencegah dua sesi aktif; jika ternyata sudah tercatat, pesan "masih tercatat parkir" muncul.
4. Daftar tidak dapat dimuat → database masih terganggu; catat plat dan jam masuk di kertas, ulangi setelah pulih.

### Checkout — "Status pembayaran belum pasti"
1. Jangan meminta pembayaran lagi dan jangan memproses kendaraan yang sama di perangkat lain.
2. Tekan **Periksa status transaksi**.
3. Halaman menampilkan struk/selesai → pembayaran tercatat. Selesai.
4. Masih aktif → tekan konfirmasi lagi **di halaman yang sama** (kunci idempotensi sama; hasil lama dikembalikan bila ternyata sudah tersimpan). Setelah reload pun, pembayaran kedua tetap dicegah (update bersyarat + unique index).
5. Database masih terganggu → simpan uang tunai dan catat plat, nominal, dan jam di kertas; selesaikan checkout setelah pulih. Jangan mengubah data langsung di Atlas.

### Pengaturan — "Status penyimpanan belum pasti"
1. Tekan **Muat ulang pengaturan** dan periksa nilai yang tampil.
2. Sudah sesuai → selesai. Belum → simpan lagi. Penyimpanan dengan revisi lama ditolak sebagai konflik, jadi tidak ada penulisan ganda.

### Petunjuk "Server masih memproses"
Muncul bila permintaan berjalan lebih dari 10 detik. Tunggu; jangan menutup atau memuat ulang halaman. Transaksi dibatasi ±20 detik oleh driver, setelah itu muncul hasil pasti atau status belum pasti.

## 7. Pemulihan setelah gangguan koneksi

1. Pastikan health `healthy` (tunggu 30 detik cache bila sebelumnya `unhealthy`).
2. Bila sumbernya IP Access List: tambahkan IP yang benar di Atlas → Network Access (hindari `0.0.0.0/0`).
3. Restart dev server bila sempat ada perubahan kode/HMR atau error 500.
4. Tinjau setiap kejadian unknown selama gangguan (log `outcome:"unknown"`, catatan kertas): verifikasi di daftar kendaraan/checkout, lalu selesaikan lewat aplikasi.
5. Jangan mengedit atau menghapus data langsung di Atlas; koreksi finansial memakai alur aplikasi dengan audit.
6. Catat kejadian (waktu, gejala, kategori log, tindakan) di HANDOFF.md bila signifikan.

## 8. Checklist sebelum demo client

- [ ] Cluster Atlas aktif (tidak di-pause) dan tidak ada maintenance terjadwal.
- [ ] IP jaringan demo sudah ada di Atlas IP Access List; siapkan hotspot cadangan dan IP-nya juga.
- [ ] `MONGODB_DB_NAME` menunjuk database development yang benar.
- [ ] `HEALTHCHECK_TOKEN` terpasang; `GET /api/health` dengan token → `healthy`.
- [ ] Dev server di-restart bersih sebelum demo (tanpa modul HMR basi), atau build terbaru lulus.
- [ ] Index wajib sudah terverifikasi read-only di database demo (11 index; lihat HANDOFF). Dry-run bawaan `scripts/setup-parking-indexes.mjs` bersifat offline dan **tidak** memeriksa Atlas. Tanpa index, pencatatan/checkout/pengaturan menampilkan "belum siap di server".
- [ ] Akun Owner demo bisa login; lokasi demo aktif.
- [ ] Tarif dan jam operasional lokasi demo sesuai skenario.
- [ ] Alur masuk → daftar → checkout → pengaturan sudah dicoba di browser yang akan dipakai, mobile dan light/dark.
- [ ] Rencana cadangan: tangkapan layar alur dan catatan kertas bila koneksi gagal saat demo.

## 9. Keterbatasan saat ini

- **Atlas M0 (free tier):** shared cluster tanpa SLA; kapasitas dan koneksi terbatas; dapat di-pause bila lama tidak aktif; fitur backup terkelola terbatas. Cocok untuk development/demo, bukan pilot dengan data nyata — rencanakan tier berbayar dan backup sebelum pilot (perlu persetujuan biaya).
- **Monitoring eksternal belum aktif.** Health endpoint sudah siap; layanan uptime eksternal (mis. paket gratis) dan alert Atlas belum dipasang — perlu persetujuan dan URL yang dapat dijangkau dari luar.
- Ping berkala **tidak** menjamin Atlas tidak pause/downtime.
- Transaksi Better Auth (login/session) masih memakai batas retry bawaan driver (120 detik).
- Error di root layout masih memakai halaman error bawaan Next.js (belum ada `global-error.tsx`).
