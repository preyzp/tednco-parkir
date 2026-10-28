# DATABASE_SCHEMA.md — TednCo Parkir

Dokumen ini mendefinisikan rancangan database MongoDB untuk TednCo Parkir.

Tujuan utama:

- Mendukung banyak tenant dan lokasi.
- Menjaga isolasi data antarbisnis.
- Mencegah transaksi dan pemotongan saldo ganda.
- Menyimpan riwayat finansial yang dapat diaudit.
- Memungkinkan pengembangan fitur tanpa merusak data historis.

Dokumen ini menjadi acuan sebelum membuat model data, repository, query, dan migrasi.

---

## 1. Teknologi Database

Gunakan:

- MongoDB Atlas.
- MongoDB Node.js Driver resmi.
- TypeScript dengan tipe data yang eksplisit.
- Zod untuk validasi input dan konfigurasi yang sesuai.
- ObjectId untuk identifier dokumen, kecuali ada alasan teknis yang terdokumentasi untuk menggunakan tipe lain.

Jangan menambahkan ODM atau ORM baru tanpa alasan yang jelas dan persetujuan perubahan arsitektur.

### Prinsip penyimpanan

1. Data tenant harus memiliki `tenantId`.
2. Data operasional yang terkait lokasi harus memiliki `locationId`.
3. Nilai uang disimpan sebagai integer Rupiah, bukan floating point.
4. Timestamp disimpan sebagai BSON Date dalam UTC.
5. Konversi waktu untuk UI dan laporan menggunakan zona waktu bisnis atau lokasi.
6. Data historis transaksi harus menyimpan snapshot informasi yang diperlukan.
7. Dokumen finansial yang telah diposting tidak boleh dihapus atau diedit secara diam-diam.
8. Database harus memiliki index yang sesuai untuk pencarian, isolasi tenant, dan integritas bisnis.

---

## 2. Konvensi Data

### 2.1 Identifier

Gunakan `_id` sebagai identifier utama setiap dokumen.

Referensi ke dokumen lain menggunakan ObjectId.

Contoh:

- `tenantId`
- `locationId`
- `vehicleId`
- `parkingSessionId`
- `transactionId`
- `userId`

Semua identifier yang berasal dari input pengguna harus divalidasi sebelum digunakan dalam query.

### 2.2 Timestamp

Gunakan nama field berikut jika relevan:

- `createdAt`
- `updatedAt`
- `entryAt`
- `exitAt`
- `paymentAt`
- `canceledAt`
- `confirmedAt`

Semua timestamp disimpan dalam UTC.

UI mengonversi timestamp menjadi waktu lokal menggunakan konfigurasi zona waktu lokasi.

### 2.3 Nilai uang

Semua nominal disimpan sebagai integer Rupiah.

Contoh:

- Rp5.000 disimpan sebagai `5000`.
- Rp12.500 disimpan sebagai `12500`.

Hindari nilai uang bertipe floating point.

Untuk MVP, validasi batas nominal yang wajar agar nilai tidak melebihi kapasitas integer yang digunakan.

### 2.4 Status

Gunakan string union TypeScript atau enum yang konsisten.

Status harus memiliki arti bisnis yang jelas. Jangan menggunakan status yang sama untuk merepresentasikan kondisi berbeda.

### 2.5 Soft delete

Jangan menghapus data finansial atau historis yang dibutuhkan untuk audit.

Untuk data konfigurasi atau master tertentu, penonaktifan melalui `isActive` atau status lebih disarankan daripada penghapusan permanen.

---

## 3. Daftar Koleksi

Koleksi inti operasional:

1. `tenants`
2. `locations`
3. `users`
4. `memberships`
5. `vehicles`
6. `parkingSessions`
7. `tariffs`
8. `parkingTransactions`
9. `prepaidAccounts`
10. `prepaidLedger`
11. `auditLogs`

Koleksi pendukung:

12. `subscriptionPlans`
13. `subscriptions`
14. `subscriptionInvoices`
15. `subscriptionPayments`
16. `subscriptionOverrides`
17. `platformSettings`
18. `idempotencyKeys`

Gunakan koleksi sesuai kebutuhan implementasi. Jangan membuat seluruh fitur langganan kompleks sebelum alur parkir inti selesai.

---

## 4. tenants

Menyimpan data bisnis yang menggunakan TednCo Parkir.

Contoh struktur:

```ts
interface Tenant {
  _id: ObjectId;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Ketentuan:

- `slug` harus unik secara global.
- `timezone` default adalah `Asia/Jakarta`.
- Tenant yang ditangguhkan tidak boleh menjalankan operasi yang dilarang oleh status tenant.
- Menonaktifkan tenant tidak boleh menghapus data historisnya.

Index:

- Unique: `{ slug: 1 }`
- `{ status: 1 }`

---

## 5. locations

Menyimpan lokasi parkir milik tenant.

```ts
interface Location {
  _id: ObjectId;
  tenantId: ObjectId;
  name: string;
  address?: string;
  timezone: string;
  operatingHours?: {
    [day: string]: {
      open: string;
      close: string;
      isClosed: boolean;
    };
  };
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}
```

Ketentuan:

- Setiap lokasi harus terhubung ke satu tenant.
- Semua operasi lokasi harus memverifikasi kepemilikan tenant.
- Zona waktu lokasi dapat mengikuti konfigurasi tenant jika tidak ditetapkan secara khusus.
- Jam operasional tidak otomatis mengubah tarif atau status sesi parkir.

Index:

- `{ tenantId: 1, status: 1 }`
- `{ tenantId: 1, name: 1 }`

---

## 6. users

Menyimpan identitas pengguna platform.

```ts
interface User {
  _id: ObjectId;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  status: "active" | "inactive" | "locked";
  platformRole?: "platform_admin";
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}
```

Ketentuan:

- Email harus dinormalisasi sebelum penyimpanan dan pencarian.
- Email harus unik berdasarkan kebijakan autentikasi platform.
- Tidak ada `passwordHash` pada kontrak user baru; hash credential hanya dikelola Better Auth di `authAccounts.password` dan tidak boleh dikirim ke browser.
- Jangan menyimpan password asli.
- Jangan membuat sistem hashing atau session cryptography sendiri.
- Pengelolaan autentikasi harus mengikuti `AUTH_AND_TENANCY.md`.

Index:

- Unique: `{ email: 1 }`
- `{ status: 1 }`

Jika auth library yang dipilih memerlukan struktur pengguna atau koleksi berbeda, gunakan model yang kompatibel dan dokumentasikan pemetaannya. Jangan menduplikasi sistem autentikasi tanpa kebutuhan.

### 6.1 Kontrak auth P2.1B — Better Auth 1.7.13

`users` tetap satu-satunya koleksi identitas. Adapter resmi 1.7.13 menyimpan `_id` dan referenced `userId` sebagai BSON ObjectId, dan mengekspos hex string di API. Terbukti melalui adapter asli dengan DB mock: create/read/filter user reference. Tidak memakai custom ID generator atau migrasi string ID. `emailVerified` required, `image` optional/nullable; `status`, `platformRole`, `lastLoginAt` adalah additional fields server-owned. User baru default inactive; public signup dinonaktifkan. Tidak memberi membership saat login.

Koleksi pendukung auth global (bukan tenant-owned, tidak diakses melalui business DAL):

| Koleksi | Kontrak persistence |
|---|---|
| `authAccounts` | `_id: ObjectId`, `userId: ObjectId`, `accountId: string`, `providerId: string`, createdAt/updatedAt Date. Untuk email/password: providerId credential, hash scrypt hanya di password optional/nullable. Field optional library lain: accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope; tidak ada OAuth provider aktif. accountId adalah provider identity string, bukan BSON foreign key. |
| `authSessions` | `_id/userId: ObjectId`, token string, expiresAt/createdAt/updatedAt Date, optional/nullable ipAddress dan userAgent. Ini sesi login; `parkingSessions` tetap sesi parkir. |
| `authVerifications` | `_id: ObjectId`, identifier/value string, expiresAt/createdAt/updatedAt Date. Identifier disimpan hashed lewat opsi library; reset/email belum diaktifkan. Bukan reset-token store buatan aplikasi. |
| `authRateLimits` | `_id: ObjectId`, key string, count number, lastRequest number (epoch ms). Tidak memakai TTL Date untuk field epoch ini. |

Tipe account/session/verification/rateLimit diproyeksikan dari `better-auth/types` di `src/types/auth.ts`, hanya mengganti ID persistence dengan BSON. Tidak mengekspor DTO token/hash. Tidak ada user model kedua.

Index auth dikelola terpisah dari 31 index foundation melalui `authenticationIndexDefinitions()` / `setupAuthenticationIndexes()` di `src/lib/auth-indexes.ts`:

- Reuse **users_email_unique** dan **users_status** existing, tanpa rename/drop.
- authAccounts: **auth_accounts_provider_account_unique** (providerId+accountId unique), **auth_accounts_user** (userId).
- authSessions: **auth_sessions_token_unique** (token unique), **auth_sessions_user** (userId), **auth_sessions_expiry** (expiresAt).
- authVerifications: **auth_verifications_identifier** (identifier), **auth_verifications_expiry** (expiresAt).
- authRateLimits: **auth_rate_limits_key_unique** (key unique).

Total **10 index auth contracts** termasuk 2 users existing (8 tambahan). Core auth indexes menggunakan schema/table indexes yang sama dengan adapter; unique rate-limit key disuplai maintenance karena adapter 1.7.13 tidak otomatis membuat field-level indexes. Helper eksplisit tidak dipanggil oleh import/build/startup/route. Adapter dapat memastikan table indexes saat write pertama; nama/options sudah disamakan agar tidak menduplikasi users email. Provision seluruh indexes secara berizin sebelum melayani traffic auth, terutama unique rate-limit key. Tidak ada TTL index baru; expiry tetap ditegakkan library, lifecycle cleanup dapat direncanakan terpisah.

**Tidak ada data atau index Atlas yang diubah pada P2.1B.** Ini kontrak baru, bukan migrasi record lama. Legacy users.passwordHash dan field emailVerified yang belum ada memerlukan review/migrasi terpisah sebelum existing user login diaktifkan; jangan menyalin hash atau menciptakan credential/user baru otomatis. Tidak ada klaim live enforcement atau kecocokan hash legacy dari tes mock.

---

## 7. memberships

Menyimpan keanggotaan pengguna di suatu tenant.

```ts
interface Membership {
  _id: ObjectId;
  tenantId: ObjectId;
  userId: ObjectId;
  role: "owner" | "admin" | "staff";
  status: "active" | "inactive";
  locationIds: ObjectId[];
  permissions?: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

Ketentuan:

- Seorang pengguna dapat menjadi anggota beberapa tenant.
- Pengguna dapat memiliki role berbeda pada tenant berbeda.
- Owner memiliki akses ke seluruh lokasi tenant sesuai aturan aplikasi.
- Admin dan Staff dibatasi berdasarkan lokasi dan izin.
- `permissions` hanya digunakan untuk izin tambahan yang sudah didefinisikan sistem.
- Browser tidak boleh menentukan role atau izin yang berlaku.

Index:

- Unique: `{ tenantId: 1, userId: 1 }`
- `{ userId: 1, status: 1 }`
- `{ tenantId: 1, role: 1, status: 1 }`

---

## 8. vehicles

Menyimpan identitas kendaraan.

Kendaraan dapat digunakan kembali pada sesi parkir berikutnya.

```ts
interface Vehicle {
  _id: ObjectId;
  tenantId: ObjectId;
  plateNumber: string;
  normalizedPlate: string;
  type: "motor" | "mobil";
  customerName?: string;
  phone?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Ketentuan:

- `plateNumber` adalah nomor polisi untuk tampilan.
- `normalizedPlate` digunakan untuk pencocokan.
- Kendaraan berada dalam cakupan tenant.
- Kendaraan dapat diperbarui ketika data pelanggan berubah.
- Sesi parkir harus menyimpan snapshot informasi kendaraan yang diperlukan agar riwayat tidak berubah ketika data master kendaraan diperbarui.

Index:

- `{ tenantId: 1, normalizedPlate: 1 }`
- `{ tenantId: 1, type: 1 }`

Jangan membuat unique index yang melarang satu kendaraan memiliki banyak sesi historis.

Pencegahan sesi aktif ganda harus diterapkan secara terpisah pada `parkingSessions`, dengan strategi yang tetap aman terhadap request bersamaan.

---

## 9. parkingSessions

Menyimpan satu siklus parkir kendaraan.

```ts
interface ParkingSession {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  vehicleId: ObjectId;

  plateNumberSnapshot: string;
  normalizedPlateSnapshot: string;
  vehicleTypeSnapshot: "motor" | "mobil";

  customerNameSnapshot?: string;
  phoneSnapshot?: string;
  notes?: string;

  entryAt: Date;
  exitAt?: Date;

  status: "active" | "completed" | "canceled";

  enteredBy: ObjectId;
  completedBy?: ObjectId;
  canceledBy?: ObjectId;

  canceledAt?: Date;
  cancellationReason?: string;
  cancellationNote?: string;

  transactionId?: ObjectId;

  createdAt: Date;
  updatedAt: Date;
}
```

Ketentuan:

- Satu sesi mewakili satu kunjungan parkir.
- Sesi yang telah selesai tidak boleh digunakan kembali.
- Sesi yang dibatalkan tetap disimpan.
- Sesi aktif tidak boleh memiliki transaksi parkir sukses yang sudah selesai.
- Sesi selesai harus memiliki informasi checkout yang konsisten.
- Sesi yang dibatalkan tidak menghasilkan pendapatan atau pemotongan prepaid.
- Koreksi sesi selesai harus mengikuti prosedur koreksi khusus dan audit log.

Index:

- `{ tenantId: 1, locationId: 1, status: 1, entryAt: -1 }`
- `{ tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1, entryAt: -1 }`
- `{ tenantId: 1, transactionId: 1 }`

### Pencegahan sesi aktif ganda

Persyaratan bisnis:

Satu kendaraan tidak boleh mempunyai dua sesi aktif pada tenant dan lokasi yang sama.

Implementasi dapat menggunakan unique partial index yang sesuai dengan struktur koleksi, atau mekanisme konsistensi lain yang terbukti aman.

Jika menggunakan unique partial index pada kombinasi tenant, lokasi, dan nomor polisi ternormalisasi:

- Pastikan index hanya berlaku untuk dokumen dengan `status: "active"`.
- Pastikan nilai `normalizedPlateSnapshot` selalu tersedia dan telah dinormalisasi.
- Tangani duplicate-key error sebagai konflik bisnis yang dapat ditampilkan dengan jelas.
- Jangan hanya mengandalkan pemeriksaan awal `findOne`, karena dua request dapat lolos bersamaan.

Validasi dan index harus mengikuti aturan yang sama.

---

## 10. tariffs

Menyimpan konfigurasi tarif per tenant, lokasi, dan jenis kendaraan.

```ts
interface Tariff {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  vehicleType: "motor" | "mobil";
  tariffType: "regular" | "overnight";
  amount: number;
  currency: "IDR";
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId;
}
```

Ketentuan:

- `amount` adalah tarif reguler atau tarif per malam untuk tarif menginap.
- Nilai harus berupa integer positif.
- Harga tidak boleh di-hardcode sebagai harga produksi.
- Perubahan tarif tidak mengubah transaksi historis.
- Setiap perubahan tarif penting dicatat pada audit log.

Index:

- `{ tenantId: 1, locationId: 1, vehicleType: 1, tariffType: 1, status: 1 }`

Jika aplikasi membutuhkan lebih dari satu versi tarif aktif, tentukan aturan tanggal berlaku sebelum implementasi. Untuk MVP, hindari ambiguitas dengan memastikan pemilihan tarif aktif konsisten.

---

## 11. parkingTransactions

Menyimpan transaksi pembayaran layanan parkir.

```ts
interface ParkingTransaction {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  parkingSessionId: ObjectId;

  plateNumberSnapshot: string;
  vehicleTypeSnapshot: "motor" | "mobil";

  tariffSnapshot: {
    tariffType: "regular" | "overnight";
    amountPerUnit: number;
    nightCount?: number;
    totalAmount: number;
    currency: "IDR";
  };

  paymentMethod: "cash" | "qris" | "prepaid";

  amountDue: number;
  amountPaid: number;
  cashReceived?: number;
  changeAmount?: number;

  status: "pending" | "completed" | "voided";

  processedBy: ObjectId;
  paymentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Ketentuan:

- Snapshot tarif disimpan untuk keperluan riwayat.
- `amountDue` dihitung dan divalidasi di server.
- `amountPaid` merepresentasikan jumlah yang dialokasikan untuk tagihan.
- `cashReceived` dan `changeAmount` digunakan untuk pembayaran tunai jika relevan.
- QRIS hanya berstatus selesai setelah dikonfirmasi.
- Pembayaran prepaid harus mempunyai ledger debit yang terkait.
- Sesi tidak boleh mempunyai lebih dari satu transaksi pembayaran sukses.
- Transaksi yang telah selesai tidak boleh dihapus untuk memperbaiki kesalahan.
- Gunakan mekanisme idempotency atau pengamanan setara untuk mencegah transaksi ganda.

Index:

- Unique: `{ tenantId: 1, parkingSessionId: 1 }` jika model yang dipilih hanya mengizinkan satu dokumen transaksi final per sesi.
- `{ tenantId: 1, locationId: 1, paymentAt: -1 }`
- `{ tenantId: 1, status: 1, createdAt: -1 }`
- `{ tenantId: 1, plateNumberSnapshot: 1, paymentAt: -1 }`

Jika kebutuhan masa depan mengharuskan beberapa percobaan pembayaran per sesi, pisahkan payment attempts dari transaksi final dan gunakan unique index berdasarkan status atau identifier idempotency yang sesuai.

Jangan mengizinkan beberapa transaksi `completed` untuk satu sesi.

Implementasi P4.5 (2026-10-27, checkout Tunai Owner):

- Field tambahan: `idempotencyKey` (UUID dari layar checkout; retry identik oleh aktor yang sama mengembalikan hasil sebelumnya) dan `tariffSnapshot.source` (`"location"` | `"default"`). Pengamanan setara koleksi `idempotencyKeys` untuk operasi ini: satu sesi hanya dapat diselesaikan sekali, sehingga key cukup disimpan pada dokumen transaksi final.
- Satu transaksi MongoDB: insert transaksi `completed` + update bersyarat sesi (`status: "active"` → `completed`, `exitAt`, `completedBy`, `transactionId`) + audit `parking.checkout`. Checkout ditolak (fail closed) sampai unique partial index `{ tenantId, parkingSessionId }` (`status: "completed"`) tersedia.
- MVP tunai: `amountDue = amountPaid = total`; `cashReceived`/`changeAmount` tidak diisi.

---

## 12. prepaidAccounts

Menyimpan status dan saldo prepaid kendaraan pada lokasi tertentu.

```ts
interface PrepaidAccount {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  vehicleId: ObjectId;

  normalizedPlate: string;
  plateNumberSnapshot: string;

  balance: number;
  status: "active" | "inactive";

  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy: ObjectId;
}
```

Ketentuan:

- Saldo disimpan sebagai integer Rupiah.
- Saldo tidak boleh negatif.
- Saldo berlaku hanya untuk lokasi yang tercatat.
- Satu kendaraan hanya boleh memiliki satu akun prepaid per tenant dan lokasi.
- Akun yang dinonaktifkan tetap menyimpan saldo dan riwayat.
- Saldo harus konsisten dengan ledger yang telah diposting, setelah memperhitungkan aturan pembukaan saldo dan penyesuaian yang terdokumentasi.

Index:

- Unique: `{ tenantId: 1, locationId: 1, vehicleId: 1 }`
- `{ tenantId: 1, locationId: 1, normalizedPlate: 1 }`
- `{ tenantId: 1, locationId: 1, status: 1, balance: 1 }`

Jika akun harus tetap ditemukan berdasarkan nomor polisi meskipun data master kendaraan berubah, pertahankan aturan pencocokan dan referensi kendaraan secara konsisten.

---

## 13. prepaidLedger

Menyimpan setiap perubahan saldo prepaid.

```ts
interface PrepaidLedgerEntry {
  _id: ObjectId;
  tenantId: ObjectId;
  locationId: ObjectId;
  prepaidAccountId: ObjectId;

  type: "deposit" | "parking_debit" | "refund" | "adjustment";

  amount: number;
  balanceBefore: number;
  balanceAfter: number;

  status: "pending" | "posted" | "reversed";

  paymentMethod?: "cash" | "qris" | "prepaid";
  referenceType?: "parking_transaction" | "deposit" | "refund" | "adjustment";
  referenceId?: ObjectId;

  reason?: string;
  performedBy: ObjectId;
  createdAt: Date;
  postedAt?: Date;
}
```

Ketentuan:

- `amount` harus mengikuti konvensi tanda yang konsisten.
- Rekomendasi: simpan `amount` sebagai nominal positif dan tentukan arah saldo berdasarkan `type`.
- Deposit menambah saldo.
- Parking debit mengurangi saldo.
- Refund mengurangi saldo yang dikembalikan kepada pelanggan.
- Adjustment mengikuti arah perubahan yang tercatat dan harus memiliki alasan.
- Ledger yang sudah `posted` tidak boleh diedit atau dihapus secara diam-diam.
- Kesalahan ledger diperbaiki dengan transaksi pembalik atau penyesuaian yang dapat diaudit.
- Setiap operasi saldo harus memiliki referensi idempotency atau mekanisme pencegahan duplikasi yang setara.

Index:

- `{ tenantId: 1, prepaidAccountId: 1, createdAt: -1 }`
- `{ tenantId: 1, locationId: 1, type: 1, createdAt: -1 }`
- `{ tenantId: 1, referenceType: 1, referenceId: 1 }`

Untuk mencegah satu transaksi parkir menghasilkan beberapa debit, tambahkan unique index yang sesuai pada referensi transaksi untuk ledger debit yang telah diposting, atau gunakan model idempotency yang memiliki jaminan konsistensi setara.

Jangan mengandalkan pemeriksaan di UI untuk mencegah pemotongan saldo ganda.

---

## 14. auditLogs

Menyimpan jejak tindakan penting.

```ts
interface AuditLog {
  _id: ObjectId;
  tenantId?: ObjectId;
  locationId?: ObjectId;
  actorId: ObjectId;

  action: string;
  entityType: string;
  entityId: ObjectId;

  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;

  requestId?: string;
  createdAt: Date;
}
```

Ketentuan:

- Gunakan action yang konsisten dan terdokumentasi.
- Hindari menyimpan informasi sensitif yang tidak diperlukan.
- Jangan mencatat password, token sesi, atau rahasia autentikasi.
- Catatan audit finansial harus dapat ditelusuri ke transaksi terkait.
- Pengguna operasional biasa tidak boleh mengubah atau menghapus audit log.

Index:

- `{ tenantId: 1, createdAt: -1 }`
- `{ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 }`
- `{ actorId: 1, createdAt: -1 }`

---

## 15. idempotencyKeys

Digunakan untuk mencegah pemrosesan ulang operasi sensitif akibat retry atau request ganda.

```ts
interface IdempotencyKey {
  _id: ObjectId;
  tenantId: ObjectId;
  actorId: ObjectId;

  key: string;
  operation: string;
  requestHash: string;

  status: "processing" | "completed" | "failed";
  resourceType?: string;
  resourceId?: ObjectId;

  createdAt: Date;
  expiresAt?: Date;
}
```

Ketentuan:

- Key harus terikat pada tenant, aktor, dan jenis operasi yang sesuai.
- Request dengan key sama tetapi payload berbeda harus ditolak.
- Request ulang yang identik harus mengembalikan hasil sebelumnya jika operasi sudah selesai.
- Gunakan unique index yang sesuai pada kombinasi tenant, aktor, operasi, dan key.
- Jangan menghapus key terlalu cepat jika penghapusan memungkinkan operasi finansial diproses ulang.
- Kebijakan TTL hanya boleh digunakan jika aman untuk periode retry yang dipilih.

---

## 16. Langganan

Fitur langganan dapat dikembangkan setelah alur inti parkir stabil.

### 16.1 subscriptionPlans

```ts
interface SubscriptionPlan {
  _id: ObjectId;
  name: string;
  code: string;

  monthlyPrice: number;
  yearlyPrice: number;

  features: string[];
  limits: Record<string, number>;

  trialDays: number;
  status: "active" | "inactive";
  displayOrder: number;

  createdAt: Date;
  updatedAt: Date;
}
```

Harga dan limit harus dapat diubah melalui Web Admin.

Validasi harga dan limit dilakukan di server.

### 16.2 subscriptions

```ts
interface Subscription {
  _id: ObjectId;
  tenantId: ObjectId;
  planId: ObjectId;

  status:
    | "trialing"
    | "active"
    | "past_due"
    | "grace_period"
    | "suspended"
    | "canceled"
    | "expired";

  billingCycle: "monthly" | "yearly";

  periodStart: Date;
  periodEnd: Date;

  planSnapshot: {
    name: string;
    price: number;
    features: string[];
    limits: Record<string, number>;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

Simpan snapshot harga dan ketentuan agar perubahan paket tidak mengubah ketentuan periode yang telah berjalan.

### 16.3 subscriptionInvoices

```ts
interface SubscriptionInvoice {
  _id: ObjectId;
  tenantId: ObjectId;
  subscriptionId: ObjectId;

  invoiceNumber: string;
  amount: number;
  currency: "IDR";

  status: "draft" | "issued" | "paid" | "void" | "overdue";

  issuedAt?: Date;
  dueAt?: Date;
  paidAt?: Date;

  planSnapshot: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}
```

Invoice yang telah diterbitkan harus mempertahankan nilai historisnya.

### 16.4 subscriptionPayments

```ts
interface SubscriptionPayment {
  _id: ObjectId;
  tenantId: ObjectId;
  invoiceId: ObjectId;

  amount: number;
  method: "manual" | "cash" | "bank_transfer" | "qris";

  status: "pending" | "confirmed" | "rejected";

  reference?: string;
  confirmedBy?: ObjectId;
  confirmedAt?: Date;

  createdAt: Date;
}
```

MVP dapat menggunakan konfirmasi pembayaran manual.

### 16.5 subscriptionOverrides

Digunakan untuk pengecualian paket atau limit khusus tenant jika fitur tersebut diperlukan.

```ts
interface SubscriptionOverride {
  _id: ObjectId;
  tenantId: ObjectId;
  features?: string[];
  limits?: Record<string, number>;
  expiresAt?: Date;
  reason: string;
  createdBy: ObjectId;
  createdAt: Date;
}
```

### 16.6 platformSettings

Menyimpan konfigurasi platform yang dapat dikelola melalui Web Admin.

```ts
interface PlatformSetting {
  _id: ObjectId;
  key: string;
  value: unknown;
  updatedBy: ObjectId;
  updatedAt: Date;
}
```

Jangan menyimpan rahasia autentikasi atau kredensial database di koleksi pengaturan yang dapat diakses pengguna biasa.

---

## 17. Index dan Integritas

Index bukan hanya untuk performa. Index juga dapat membantu menegakkan aturan bisnis.

Sebelum membuat index:

1. Tentukan query yang benar-benar digunakan.
2. Tentukan kombinasi tenant dan lokasi yang diperlukan.
3. Tentukan apakah index harus unique.
4. Pastikan aturan partial index sesuai dengan status dokumen.
5. Pastikan aplikasi menangani duplicate-key error.
6. Uji perilaku pada request bersamaan.

Jangan membuat unique index tanpa memeriksa data yang sudah ada dan konsekuensi bisnisnya.

Jika index gagal dibuat karena data duplikat, perbaiki data secara terkontrol sebelum melanjutkan deployment.

---

## 18. Transaksi MongoDB

Operasi berikut dapat melibatkan beberapa dokumen dan membutuhkan transaksi database atau mekanisme konsistensi yang setara:

### Checkout tunai atau QRIS

- Validasi sesi aktif.
- Buat transaksi parkir.
- Perbarui status sesi.
- Catat audit jika relevan.

### Checkout prepaid

- Validasi sesi aktif.
- Validasi status dan saldo prepaid terbaru.
- Buat transaksi parkir.
- Potong saldo.
- Buat ledger debit.
- Selesaikan sesi.

### Deposit prepaid

- Validasi metode pembayaran.
- Konfirmasi pembayaran.
- Tambah saldo.
- Buat ledger deposit.

### Refund prepaid

- Validasi izin dan saldo.
- Proses refund atau tandai pending sesuai metode.
- Perbarui saldo ketika refund benar-benar diposting.
- Buat ledger refund.
- Catat audit.

Gunakan transaksi MongoDB jika tersedia dan sesuai dengan konfigurasi deployment.

Jika operasi multi-dokumen tidak dapat menggunakan transaksi, jangan menganggap beberapa write terpisah sudah aman. Rancang strategi pemulihan, idempotency, dan konsistensi yang eksplisit sebelum implementasi.

---

## 19. Keamanan Query

Semua operasi tenant harus mengikuti prinsip berikut:

- Ambil identitas pengguna dari sesi autentikasi yang tervalidasi.
- Tentukan tenant aktif dari membership yang sah.
- Validasi akses lokasi.
- Tambahkan `tenantId` pada setiap query data tenant.
- Tambahkan `locationId` jika operasi dibatasi ke lokasi tertentu.
- Validasi kepemilikan objek sebelum mengubah atau menghapusnya.
- Jangan menggunakan ID dari browser sebagai bukti kepemilikan.
- Jangan memberikan akses ke seluruh tenant hanya karena pengguna mengetahui ObjectId.

Contoh pola konseptual:

```ts
const session = await parkingSessions.findOne({
  _id: sessionId,
  tenantId: authorizedTenantId,
  locationId: authorizedLocationId,
});
```

`authorizedTenantId` dan `authorizedLocationId` harus berasal dari proses otorisasi server, bukan diterima begitu saja dari input browser.

---

## 20. Validasi Data

Gunakan Zod atau mekanisme validasi terpusat yang setara untuk memvalidasi input.

Validasi minimal meliputi:

- Format ObjectId.
- Nomor polisi.
- Jenis kendaraan.
- Status yang diizinkan.
- Nominal Rupiah.
- Jumlah malam.
- Metode pembayaran.
- Alasan pembatalan.
- Alasan koreksi.
- Identitas tenant dan lokasi.
- Batas panjang nama, catatan, dan nomor telepon.

Validasi server tetap wajib meskipun frontend sudah melakukan validasi.

---

## 21. Strategi Pengujian Database

Tambahkan pengujian untuk kasus berikut:

1. Tenant tidak dapat membaca data tenant lain.
2. Staff tidak dapat mengakses lokasi yang tidak ditugaskan.
3. Nomor polisi yang sama tidak dapat mempunyai dua sesi aktif pada lokasi yang sama.
4. Sesi yang selesai tidak dapat di-checkout ulang.
5. Tarif yang berubah tidak mengubah transaksi historis.
6. Saldo prepaid tidak dapat menjadi negatif.
7. Deposit tidak boleh menambah saldo dua kali.
8. Checkout prepaid tidak boleh memotong saldo dua kali.
9. QRIS yang belum dikonfirmasi tidak boleh dianggap lunas.
10. Refund tidak boleh melebihi saldo yang tersedia.
11. Pembatalan tidak boleh membuat pendapatan atau pemotongan prepaid.
12. Laporan pendapatan menggunakan waktu pembayaran yang benar.
13. Ledger dan saldo tetap konsisten ketika terjadi kegagalan operasi.
14. Index unik dan penanganan konflik berjalan sesuai aturan.

Gunakan database pengujian yang terisolasi. Jangan menjalankan pengujian yang berpotensi menghapus atau mengubah data produksi.

---

## 22. Urutan Implementasi

Implementasikan model database secara bertahap:

### Tahap 1 — Fondasi

- Koneksi MongoDB.
- Konfigurasi environment.
- Validasi konfigurasi.
- Helper database.
- Penanganan error.
- Index awal.

### Tahap 2 — Tenant dan autentikasi

- `tenants`
- `locations`
- `users`
- `memberships`

### Tahap 3 — Operasional parkir

- `vehicles`
- `parkingSessions`
- `tariffs`
- `parkingTransactions`

### Tahap 4 — Prepaid

- `prepaidAccounts`
- `prepaidLedger`
- Idempotency untuk operasi finansial.

### Tahap 5 — Audit dan laporan

- `auditLogs`
- Query laporan.
- Filter tanggal dan lokasi.

### Tahap 6 — Langganan

- `subscriptionPlans`
- `subscriptions`
- `subscriptionInvoices`
- `subscriptionPayments`
- `subscriptionOverrides`
- `platformSettings`

Jangan membuat seluruh koleksi sekaligus hanya demi menyelesaikan dokumen. Implementasikan sesuai fase produk dan kebutuhan fitur.

---

## 23. Aturan untuk AI Coding Agent

Sebelum mengubah skema:

1. Baca dokumen ini.
2. Periksa implementasi database yang sudah ada.
3. Periksa apakah perubahan memengaruhi data historis.
4. Periksa index dan constraint terkait.
5. Periksa isolasi tenant dan lokasi.
6. Periksa konsistensi transaksi finansial.
7. Tambahkan atau perbarui pengujian.
8. Dokumentasikan perubahan yang memengaruhi arsitektur.

Jangan:

- Menyimpan uang menggunakan floating point.
- Menghapus transaksi historis demi memperbaiki data.
- Mengandalkan frontend untuk integritas database.
- Membuat index unik tanpa mempertimbangkan status dan aturan bisnis.
- Membiarkan satu transaksi prepaid diproses lebih dari satu kali.
- Menggunakan tenant ID dari browser tanpa otorisasi.
- Menganggap setiap operasi multi-dokumen otomatis atomik.
- Mengubah skema besar-besaran tanpa alasan yang terdokumentasi.

Jika struktur implementasi yang sudah ada berbeda dari dokumen ini, jangan langsung menulis ulang semuanya. Identifikasi perbedaan, jelaskan dampaknya, lalu pilih perubahan paling kecil yang tetap memenuhi aturan bisnis.
