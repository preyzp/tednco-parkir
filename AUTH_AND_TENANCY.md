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

## Development provisioning maintenance (2026-10-26)

Opt-in standalone CLI `scripts/provision-dev-owner.mjs` prepares one Owner/tenant/location only in dedicated `tednco_parkir_provision_dev`. Offline dry-run is the default; apply requires NODE_ENV=development, explicit enable/write-confirmation flags, secure runtime credentials, unique-index prerequisites and a MongoDB transaction. It uses official Better Auth hashPassword and the pinned adapter BSON credential schema; does not enable public signup or issue a login session. Existing users/memberships are never adopted or escalated, and the unique transaction marker prevents repeat creation. No platform_admin is provisioned. Full usage, recovery/cleanup instructions and test limits are in HANDOFF.md. No live provisioning has been executed or approved by preparing these scripts. Application session/tenant/location guards remain unchanged.

## P2.3A - Authorization foundation implemented (2026-10-26)

Bagian ini menggantikan pernyataan historis bahwa business DAL selalu memakai stub. Tidak ada perubahan Better Auth/session cryptography, schema persistence, provisioning atau database live.

### Trusted server context

`src/lib/dal/authorization.ts` adalah server-only. Setiap pemanggilan menggunakan `requireAuthenticatedSession()`, memvalidasi ID/expiry, lalu membaca ulang users (_id BSON ObjectId, status active) dengan projection _id/status/platformRole. Role tenant/permissions tidak diambil dari cookie snapshot, URL, header, form atau session payload. Database failures menjadi AppError SERVICE_UNAVAILABLE tanpa detail; missing/expired/deleted/inactive user UNAUTHENTICATED; pelanggaran scope FORBIDDEN.

`AuthorizationSelection` hanya menerima optional tenantId/locationId hex strings; extra keys (termasuk role/permissions) ditolak. Selection adalah input tidak tepercaya, bukan bukti izin. Tanpa tenantId hanya tepat satu membership aktif diterima. Dengan tenantId, query userId+tenantId harus menghasilkan tepat satu membership aktif; duplicate/missing/corrupt/foreign memberships ditolak. Runtime schema memeriksa BSON IDs, role/status, locationIds unik dan permission names yang dikenal. Tenant harus active. Tidak ada implicit first tenant/location atau cross-request cache.

`requireTenantContext(selection?)` hanya untuk owner, tanpa locationId, dan memberi scope tenant-wide. `requireLocationContext(selection?)` memverifikasi active location dengan tenantId dan _id/assignment. Owner dapat memakai semua lokasi aktif milik tenant; admin/staff hanya locationIds membership. Tanpa locationId harus tepat satu lokasi aktif yang diizinkan; zero/multiple results ditolak. Array assignment kosong bukan wildcard. Tidak ada selected-tenant cookie baru atau tenant switcher UI pada foundation ini.

### Least-privilege policy

Runtime permission policy terpusat di `src/lib/dal/permissions.ts`, memakai kontrak Permission existing. `requirePermission(name, selection?)` memuat ulang lokasi/context dan memeriksa izin; `requireTenantPermission` memakai owner-only tenant context. Jangan menerima context buatan caller sebagai bukti otorisasi.

| Role | Scope | Permissions |
|---|---|---|
| platform_admin | Platform only dari users.platformRole terbaru | requirePlatformAccess melindungi platform DAL allowlist existing. Tidak ada implicit membership/tenant operational access. Jika punya membership eksplisit, role tenant itu dinilai terpisah. |
| owner | Tenant membership aktif, seluruh lokasi aktif tenant | Semua permission yang dikenal pada tenant tersebut, termasuk memberships/locations/subscription management. |
| admin | Lokasi yang ditugaskan; tidak mendapat tenant-wide handle | Default operasional minimum; sensitive grants hanya dari memberships.permissions dan admin allowlist. |
| staff | Lokasi yang ditugaskan; tidak mendapat tenant-wide handle | Default operasional minimum; optional grants terbatas cancel/register/deposit/toggle prepaid. Refund, financial reports, balance adjustment, transaction corrections dan tenant administration tidak dapat diberikan ke staff lewat extra grants. |

Default admin/staff: vehicle.create/read/update_active, parking.checkout/read_history, tariff.read, prepaid.read, reports.read_operational. Tambahan staff yang diperbolehkan: parking.cancel, prepaid.register/deposit/toggle_status. Tambahan admin: semua tambahan staff, tariff.manage, prepaid.refund/adjust_balance, reports.read_financial, transactions.correct. Permission administrasi tenant tetap owner-only. Grant dikenal tetapi melampaui ceiling role tidak diterapkan; nama permission tidak dikenal menyebabkan membership ditolak. Policy ini konservatif sampai feature-specific permission configuration disediakan; tidak mengimplementasikan transaksi/fitur bisnisnya.

### DAL boundary and limits

`getTenantCollection(name, selection?)` dan `getLocationCollection(name, selection?)` memanggil real guards; allowlists, BSON scope snapshot dan mandatory $and tenant/location filters tetap. Platform audit scope tetap mengecualikan tenant/location audit records. Handles masih hanya menyediakan collectionName/scopedFilter, tanpa raw Collection/Db, CRUD, pipeline atau callback. Authorization lookup internal boleh membaca users/memberships/tenants/locations melalui koneksi lazy existing; jangan mengekspos raw getter ke business code.

Scope authorization bukan izin untuk arbitrary CRUD. Future repository operations harus memakai permission guard yang relevan dan scope sama, projection allowlist, recheck per request/operation; jangan menyimpan context/handle lintas request. Revocation concurrent dengan beberapa DB reads belum memiliki transaction snapshot/atomic mutation checks; financially significant mutations memerlukan feature-specific concurrency/transaction protection. Owner-only tenant handle sengaja menolak admin/staff meskipun semua lokasi saat ini ditugaskan. Platform tenant support/audited impersonation belum tersedia.

Verifikasi offline: 38 authorization tests (termasuk pengganti test stub fail-closed existing), existing DAL filter tests, native auth lifecycle dan UI suite; total **314 tests / 18 files lulus**, lint/typecheck/build lulus. Tidak membuktikan live Atlas index/data integrity atau concurrency. Live provisioning/index/schema/data review dan audit infrastructure tetap prerequisite terpisah. Tidak ada route business/dashboard baru; /app tetap placeholder identitas.

---

## P2.10 - Route protection dan pemilihan tenant/lokasi (2026-10-26)

Menggantikan catatan P2.3A bahwa belum ada selected-tenant cookie/switcher.

- **Proxy** `src/proxy.ts` (matcher `/app/:path*`) hanya cek optimistis keberadaan cookie sesi Better Auth (`getSessionCookie`), tanpa DB; tanpa cookie → redirect `/login`. Bukan bukti autentikasi.
- **Guard server per request:** setiap halaman `/app/*` memanggil `resolveActiveWorkspace()` (`src/lib/workspace.ts`) di dalam Suspense: verified session → `listAuthorizedWorkspaces()` → `requireLocationContext({tenantId, locationId})`. UNAUTHENTICATED → redirect `/login`; FORBIDDEN → state "Akses lokasi ditolak"; error lain → state tidak tersedia. Halaman/aksi `/app` baru wajib memakai helper ini (atau guard DAL), bukan proxy.
- **`listAuthorizedWorkspaces()`** (authorization.ts) mengembalikan opsi tampilan berupa string saja: membership aktif valid dan unik per tenant, tenant aktif, lokasi aktif tenant tersebut (owner semua; admin/staff hanya `locationIds` yang aktif dan milik tenant). Membership malformed/duplikat/tanpa assignment dilewati. platform_admin tanpa membership mendapat daftar kosong.
- **Pilihan lokasi** disimpan di cookie `tednco_workspace` = `userId.tenantId.locationId` (HttpOnly, SameSite=Lax, Secure di production, path `/`, 30 hari). Cookie hanya input pilihan tidak tepercaya: selalu divalidasi ulang; milik user lain diabaikan; tidak cocok lagi → forbidden. Cookie hanya ditulis oleh Server Action `selectWorkspace` setelah `requireLocationContext` sukses. Satu opsi → otomatis tanpa cookie; banyak opsi tanpa pilihan → `/app/pilih-lokasi`.
- Batasan: cookie tidak dihapus saat logout (aman karena terikat userId dan divalidasi ulang); belum ada audit log pergantian lokasi; konteks tidak di-cache lintas request.

## P3.1A - Platform Admin foundation (2026-10-26)

- `/platform` (proxy matcher `/platform/:path*` optimistis) dirender di Suspense dan memanggil `requirePlatformAccess()` setiap request: fresh `users.platformRole === "platform_admin"` + user active. UNAUTHENTICATED → `/login`; FORBIDDEN → state "Akses Platform Admin ditolak"; error → unavailable. Membership tenant (Owner/Admin/Staff) tidak pernah memberi akses `/platform`; nilai platformRole tidak dikenal fail-closed.
- `/platform` tidak memberi data tenant. platform_admin tanpa membership mendapat `listAuthorizedWorkspaces()` kosong; `resolveActiveWorkspace()` lalu memeriksa `hasPlatformAccess()` (hanya pada state empty) dan `/app` serta `/app/pilih-lokasi` redirect ke `/platform`. Form login tetap menuju `/app`, sehingga landing diputuskan di server; Owner tidak terdampak. platform_admin dengan membership eksplisit dinilai hanya sesuai role membership itu di `/app`.
- Bootstrap development-only `scripts/bootstrap-platform-admin.mjs` (core `platform-admin-core.mjs`): DB `tednco_parkir_provision_dev`, opt-in development, konfirmasi terpisah `BOOTSTRAP_PLATFORM_ADMIN`, satu transaksi snapshot/majority menulis marker `…002`, user `platformRole: "platform_admin"` dan credential Better Auth (`hashPassword`, `accountId = userId hex`). Menolak email existing (case-insensitive), platform_admin kedua, marker existing, credential key existing; tidak pernah update/promote akun. Tidak membuat tenant/membership. Belum ada audit log aksi platform; impersonation/tenant support tetap belum tersedia.

## 2. Teknologi Autentikasi

Gunakan library autentikasi yang terpelihara, kompatibel dengan versi Next.js yang digunakan, dan sesuai dengan kebutuhan aplikasi.

Sebelum implementasi:

1. Periksa dokumentasi lokal Next.js yang relevan.
2. Evaluasi library autentikasi yang kompatibel.
3. Pastikan dukungan session management, password hashing, logout, dan mekanisme pemulihan akun sesuai kebutuhan.
4. Dokumentasikan library yang dipilih dan cara integrasinya.
5. Hindari membuat sistem autentikasi kriptografi sendiri.

Jangan mengasumsikan library tertentu sudah terpasang sebelum memeriksa `package.json` dan implementasi yang tersedia.

### Keputusan P2.1 — riset/desain, 2026-10-26

Snapshot riset di bawah dipertahankan; hasil implementasi terkini ada pada bagian P2.1B berikut.

**Dipilih: Better Auth + official MongoDB adapter, email/password dan database-backed sessions.** Seleksi/desain selesai; instalasi/setup belum dimulai, sehingga checklist integrasi P2.1 belum complete. Scope sesi ini hanya riset dan dokumentasi, tanpa dependency, implementasi, koneksi/write Atlas, atau perubahan business logic.

| Kriteria MVP | Auth.js | Better Auth |
|---|---|---|
| Password lifecycle | Credentials menyerahkan persistence, hashing, reset dan rate limiting ke aplikasi. | Email/password dan hashing tersedia dalam library; aplikasi tetap menyediakan layanan email dan policy. |
| Session | Credentials hanya mendukung JWT sessions menurut API reference; adapter database tidak menghilangkan batasan itu. | Database sessions dan revocation sesuai kebutuhan logout/penonaktifan akun. |
| Integrasi | Next.js dan MongoDB adapter tersedia; layak untuk existing Auth.js/OAuth, tetapi lebih banyak integrasi password untuk proyek ini. | App Router dan official MongoDB adapter, tanpa ORM atau crypto aplikasi sendiri. |
| Maintenance | Tetap mendapat security patches/urgent fixes di bawah tim Better Auth. | Maintainer merekomendasikan Better Auth untuk proyek baru; dipilih karena kebutuhan MVP, bukan klaim otomatis lebih aman. |

Sumber: [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials), [batas Credentials/JWT](https://authjs.dev/reference/core/providers/credentials), [pengumuman maintenance](https://better-auth.com/blog/authjs-joins-better-auth). Kedua library tetap memerlukan authorization tenant/lokasi aplikasi.

### Compatibility, dependency dan environment

- Metadata npm read-only pada 2026-10-26: Better Auth stable **1.7.13**, peer Next.js `^14 || ^15 || ^16`, React/React DOM `^18 || ^19`, MongoDB `^6 || ^7`. Stack aktual Next.js **16.4.3**, React **19.3.0**, MongoDB **7.7.0**, TypeScript **5.9.3**, Node **24.11.1**. Peer ranges cocok; TypeScript/build/runtime dengan library belum diuji karena belum diinstal.
- Auth.js npm latest **4.24.15**, beta **5.0.0-beta.32**; keduanya mencantumkan peer Next.js 16/React 19. Jangan menyamakan dokumentasi v5 dengan release stable v4. Metadata: [Better Auth](https://www.npmjs.com/package/better-auth), [Mongo adapter](https://www.npmjs.com/package/@better-auth/mongo-adapter), [next-auth](https://www.npmjs.com/package/next-auth).
- Rencana setup: pin exact **`better-auth@1.7.13` + `@better-auth/mongo-adapter@1.7.13`**, setelah recheck patch/advisory saat implementasi. Gunakan paket adapter resmi sesuai [MongoDB guide](https://better-auth.com/docs/adapters/mongo). Reuse `mongodb`, `zod`, `server-only`; tanpa Mongoose, Prisma, Redis, bcrypt/argon2 tambahan, atau auth library kedua.
- Env server rencana: **`BETTER_AUTH_SECRET`** (acak berentropi tinggi, minimum 32 karakter), **`BETTER_AUTH_URL`**, dan **`MONGODB_URI` / `MONGODB_DB_NAME`** existing. Tidak memakai `MONGODB_DB`/`AUTH_SECRET` provisional sebagai konfigurasi paralel. Validasi lazy melalui `src/lib/env.ts`; template diselaraskan pada setup, tanpa mengubah `.env.local`. Lihat [installation](https://better-auth.com/docs/installation).

### Pemetaan satu user dan satu session store

Gunakan `modelName` eksplisit untuk mencegah koleksi default `user` di samping `users`. Koleksi auth adalah identitas global, tanpa tenantId; hubungan tenant tetap hanya di `memberships`. Nama berikut adalah rencana, bukan koleksi yang sudah dibuat.

| Model library → koleksi | Tanggung jawab |
|---|---|
| user → `users` existing | Identitas tunggal; pertahankan name/email/timestamps/status/platformRole/lastLoginAt, tambah emailVerified dan optional image. |
| account → `authAccounts` baru | Metode login per user; hash hanya pada password dengan providerId credential. Bukan user kedua atau prepaid account. |
| session → `authSessions` baru | Sesi login library: userId/token/expiry/metadata. Jangan menambah session atau JWT store aplikasi paralel; berbeda dari parkingSessions. |
| verification → `authVerifications` baru | Verifikasi/reset library; tidak membuat reset-token store kedua. |
| rateLimit → `authRateLimits` baru | Shared counters untuk database rate limiter deployment multi-instance. |

Model names, additional fields dan core schema didukung [database concepts](https://better-auth.com/docs/concepts/database). **Schema perlu alignment:** `users.passwordHash` masih wajib pada `DATABASE_SCHEMA.md` dan `src/types/documents.ts`; pada setup ubah kontrak menjadi hash library-owned di `authAccounts.password`, tanpa dua sumber hash. Sesuaikan UserDto/type tests/CoreDocuments.users. Status dan platformRole server-owned (`input: false`), tidak dapat diubah lewat profile endpoints, tanpa default privilege tinggi. DTO aplikasi tidak mengekspos credential/session secrets.

Pertahankan ObjectId untuk identitas/referensi domain, termasuk memberships.userId. String ID API divalidasi sebelum dikonversi. Setup wajib membuktikan representasi BSON `_id`/`userId` adapter pinned lewat round-trip tests; jangan mengasumsikan string FK sama dengan ObjectId atau mengubah seluruh referensi bisnis. Tipe auth mengikuti adapter, bukan model user/session buatan sendiri. Ini acceptance gate yang belum terverifikasi.

Index rencana: gunakan ulang unique users.email/status; unique session token dan lookup userId/expiry; account providerId+accountId dan userId; verification identifier/expiry; unique rate-limit key. Final definitions mengikuti adapter pinned dan tes concurrency. TTL hanya cleanup, bukan validasi expiry. MongoDB tidak membutuhkan CLI SQL migration, tetapi docs/schema/types dan controlled index setup tetap perlu diselaraskan. Tidak auto-create index saat import/startup. Existing records/hash compatibility diperiksa melalui prosedur terpisah sebelum migrasi nyata; riset ini tidak mengasumsikan database kosong.

### Session, password dan security choices

- MongoDB-backed sessions; cookie library **HttpOnly**, **Secure** pada HTTPS, **SameSite Lax**. Proposal P2.4: expiry **7 hari**, refresh **1 hari**, sesuai defaults library; uji policy sebelum selesai. **Cookie cache off**, tanpa secondary storage/JWT plugin. Logout/revocation diperiksa server; role/permission tidak dipercaya dari cookie snapshot. Lihat [sessions](https://better-auth.com/docs/concepts/session-management).
- Gunakan **scrypt bawaan library**, tanpa custom hashing/crypto. Saat P2.5 pilih `revokeSessionsOnPasswordReset: true`, reset expiry/single-use, dan identifier hashing via opsi library `verification.storeIdentifier: hashed`; buktikan dengan tes sebelum digunakan. Provider email belum dipilih: jangan mengaktifkan reset palsu. Lihat [email/password](https://better-auth.com/docs/authentication/email-password) dan [verification options](https://better-auth.com/docs/reference/options).
- Tetapkan base URL/origin allowlist spesifik dan pertahankan CSRF/cookie protections library. Verifikasi payload get-session/client; gunakan response shaping library bila diperlukan agar token/hash tidak bocor lewat DTO/log aplikasi. Jangan mengasumsikan seluruh response library sudah sesuai kontrak aplikasi. Lihat [security](https://better-auth.com/docs/reference/security).
- Login awal melalui HTTP handler library agar limiter berlaku; direct `auth.api` **tidak otomatis terkena rate limiting**. Pilih storage database shared; uji atomic/concurrent limits dan trusted proxy/IP sebelum deployment, tanpa memory-only untuk multi-instance. Credential Server Actions nanti wajib mendapat limit setara. Lihat [rate limiting](https://better-auth.com/docs/concepts/rate-limit).
- Disable public email signup selama setup sampai provisioning berizin dirancang; bukan keputusan menutup onboarding owner selamanya. Tanpa organization/admin plugins: tenant, owner/admin/staff, platform_admin, locationIds dan permissions tetap milik model aplikasi. Login tidak otomatis memberi membership.

### Integration points dan next implementation task

**Berikutnya: P2.1 lanjutan — Better Auth Foundation Setup dan Schema Alignment.**

1. Recheck versi/advisory lalu pin dependency, selaraskan DATABASE_SCHEMA, User/DTO/type tests, collection/index contracts dan env template. Buat factory auth **server-only/lazy** menggunakan existing `getDb()` dan shared `getMongoClient()`, tanpa koneksi saat import/build atau MongoClient kedua. Beri adapter client untuk transaksi Atlas. Before hooks aman terhadap retry; email/side effects setelah commit. Jangan tutup shared client per request.
2. Mount Node handler `src/app/api/auth/[...all]/route.ts` via `toNextJsHandler`; client terpisah `src/lib/auth-client.ts` via better-auth/react bila diperlukan. Server session memakai `await headers()`. Jika Server Actions memerlukan Set-Cookie, gunakan `nextCookies()` terakhir dan rate limiting setara. Ikuti [Next.js integration](https://better-auth.com/docs/integrations/next). Session/authorization tidak boleh masuk cross-user `use cache`; proxy Next.js 16 hanya redirect awal.
3. Business DAL tetap fail-closed: `requireTenantContext`, `requireLocationContext`, `requirePlatformAccess` belum dibuka pada setup. Auth adapter diberi akses terbatas pada global auth collections agar login tidak bergantung pada sesi yang belum ada; jangan menambahkan raw DB escape hatch ke business DAL. P2.6–P2.9 nanti memuat user aktif, membership, tenant/lokasi dan permission terbaru di server. PlatformRole terpisah dari role tenant.
4. Reuse Zod dan AppError/pesan Indonesia pada boundary aplikasi. Route library mempertahankan protokol/cookie/header-nya; jangan membungkus response hingga Set-Cookie/CSRF rusak. Login UI P2.2, logout P2.3, session P2.4, reset/email P2.5, tenancy/security P2.6–P2.12 tetap task bertahap.

Acceptance setup: satu users dan satu auth-session store, mapping ObjectId/model/credential teruji, privilege client ditolak, import/build tidak mengakses DB, unit tests/lint/typecheck/build lulus. Live adapter/index tests hanya pada database test terisolasi dengan persetujuan eksplisit. Riset ini belum membuktikan runtime/schema enforcement atau auth end-to-end.

### Prinsip implementasi

#### P2.2A — Login Backend dan Session Integration (2026-10-26)

Backend tetap menggunakan **Better Auth 1.7.13** dan getAuth() existing; tidak ada auth system/session store baru. Snapshot P2.1B di bawah bersifat historis; kontrak HTTP terkini adalah proyeksi aplikasi berikut, bukan raw payload native Better Auth.

| Endpoint | Kontrak aplikasi |
|---|---|
| POST `/api/auth/sign-in/email` | Request email/password dan opsi resmi diteruskan ke handler library. Library memverifikasi password, CSRF/origin, rate limit dan menerbitkan cookie. Sukses `{ ok: true, user }`; user hanya id/name/email/emailVerified/image optional. Token, account records, password hashes, role/tenant/location claims dan redirect payload tidak dikembalikan. |
| GET `/api/auth/get-session` | Handler resmi memvalidasi cookie dan session, termasuk refresh cookie sesuai policy. Aplikasi memeriksa ID/userId/expiry dan user terkini dengan filter BSON `_id` + `status: active`. Sukses `{ ok: true, user, session: { expiresAt } }`, expiry ISO UTC. Sesi tidak valid/hilang/expired atau user inactive/locked/deleted menghasilkan standar 401 UNAUTHENTICATED. |
| POST `/api/auth/sign-out` | Handler resmi menghapus sesi dan cookie. Aplikasi melakukan official getSession ulang menggunakan cookie request asli dengan cookie cache/refresh disabled; sukses `{ ok: true }` hanya bila sesi tidak lagi valid. Logout tanpa sesi sudah bersifat idempotent. |

Cookie Set-Cookie (termasuk refresh/deletion dan multiple cookies) dipertahankan dari library; seluruh response no-store. Error native dipetakan ke AppError/normalizeError: validation 400, unauthenticated 401, forbidden 403, RATE_LIMITED 429 dan unexpected/unavailable 503, tanpa raw message/record. Retry headers limiter dipertahankan. Endpoint native lain (misalnya list-sessions/list-accounts/sign-up/reset) belum diekspos dan mengembalikan 404; pembukaan fitur berikutnya harus eksplisit. GET login/logout bukan mutasi yang diizinkan. Future login UI harus memakai kontrak aplikasi ini; jangan mengasumsikan native client response berisi token/session record lengkap.

**Logout persistence caveat versi pinned:** signOut native menangkap beberapa error database dan masih dapat mengembalikan success. Post-check authoritative di route mencegah false success: bila sesi masih valid atau pemeriksaan gagal, return 503. Cookie mungkin sudah dibersihkan oleh library walau revocation belum terkonfirmasi; client tidak boleh mengklaim server logout sukses atau melakukan retry diam-diam. Tidak ada custom token verification/deletion logic.

Server helpers baru di `src/lib/auth-session.ts`:

- `getCurrentSession(requestHeaders?)` memakai `await headers()` bila tidak diberi server request headers, lalu official `auth.api.getSession` dengan disableCookieCache/disableRefresh. Tanpa cookie langsung null; result valid harus cocok dengan ID/userId/expiry dan user aktif terbaru. Return hanya safe identity/expiry, bukan raw auth session. Tidak ada cache lintas request, tenant selection, membership, role, atau location grants.
- `requireAuthenticatedSession(requestHeaders?)` menghasilkan projection yang sama atau AppError UNAUTHENTICATED; auth/database failures menjadi SERVICE_UNAVAILABLE. Hanya official APIError 401 dianggap penolakan sesi, bukan object arbitrary yang mengaku memiliki statusCode. Cookie presence sendiri bukan autentikasi.
- Resolver server-only internal hanya menerima hasil official Better Auth; tidak boleh dipanggil dengan payload/claims browser. Header tenantId/locationId/role tidak digunakan untuk mengisi identity atau authorization. User projection dibentuk allowlist dari query user aktif, bukan seluruh dokumen user.
- RSC helper tidak memperbarui expiry karena tidak dapat meneruskan Set-Cookie; HTTP get-session menjadi boundary refresh. Cleanup expired sessions tetap dapat dilakukan library. Jangan memasukkan hasil/credential helper ke cross-user use cache atau menganggap helper selalu read-only terhadap lifecycle sesi library.

Secure/HttpOnly/SameSite cookie settings dan cache-off tetap. `disableOriginCheck: false` dan `disableCSRFCheck: false` ditetapkan eksplisit, termasuk untuk test runtime (library memiliki relaxed origin default pada NODE_ENV=test). Production limiter tetap enabled/database; login tidak dipindahkan ke direct server auth.api yang melewati limiter HTTP.

Tes terisolasi mencakup real library password verification, signed cookie, session refresh, invalid credentials/email nonexistence dengan error sama, forged/expired/revoked sessions, replay setelah logout, swallowed logout failure, native/DB error sanitization, active-user checks, data allowlist, dan real DAL tetap fail-closed setelah login valid. Persistence dan akun hanya fixture mock; limiter dinonaktifkan pada instance lifecycle test untuk mengisolasi alur, bukan konfigurasi produksi. Rate-limit status/header propagation diuji terpisah; shared DB limiter concurrency/live enforcement belum dibuktikan.

Tidak membuat akun, mengakses Atlas, migrasi data, login UI, atau implementasi tenant/location authorization. Provisioning/index/schema legacy dan auth environment harus diverifikasi sebelum live use. P2.2A backend selesai; P2.2 UI, kebijakan lifecycle P2.4 lengkap, P2.5 reset dan P2.6–P2.12 tenancy/security tetap bertahap. Next: **P2.2B — Login UI**, tanpa menganggap login memberi akses operasional tenant.

#### P2.1B — foundation terpasang (2026-10-26)

- Better Auth dan official Mongo adapter **1.7.13** dipin exact; peer Next.js 16, React 19, MongoDB 7 sesuai installed Next.js 16.4.3/React 19.3.0/driver 7.7.0. TypeScript 5.9.3 tetap. `better-auth/minimal` digunakan tanpa ORM baru yang dipakai aplikasi; paket utama membawa adapter/transitive dependencies-nya sendiri.
- `getAuth()` pada `src/lib/auth.ts` adalah server-only lazy promise factory: validasi env auth, reuse `getDb()`/`getMongoClient()`, initialize library dan await context hanya saat dipanggil, reuse sukses/pending, reset kegagalan untuk retry. Tidak membuka koneksi/index pada import/build. Error init dan route tidak mencetak raw driver error/secret; library logging dan telemetry disabled. Shared client tidak ditutup oleh auth.
- Node catch-all `src/app/api/auth/[...all]/route.ts` meneruskan GET/POST dan mempertahankan response/cookie library; failure tak tertangani menghasilkan fixed 503 Indonesia. Runtime memakai default Node, tanpa explicit runtime export yang tidak kompatibel dengan Cache Components existing. Tidak ada login UI, auth client, Server Actions credential, atau tenant/location permission implementation.
- Email/password enabled, scrypt library default tanpa override, public signup disabled, account linking disabled; belum ada provisioning atau password reset email provider. Hook session creation menolak ID tidak valid dan user yang tidak aktif (filter BSON _id/status di server). Pemeriksaan status pada setiap operasi sensitif tetap tanggung jawab secure session/DAL fase berikutnya, bukan klaim diselesaikan oleh hook ini.
- Session database, cookie cache off, expiry 7 hari/updateAge 1 hari. Cookie HttpOnly/SameSite Lax/Path /, Secure pada HTTPS. `getAuthEnv()` wajib secret minimal 32 karakter tanpa whitespace tepi dan origin eksplisit tanpa userinfo/path/query/hash; produksi hanya HTTPS, HTTP hanya loopback di luar produksi. `.env.example` canonical baru; `env.example` lama diselaraskan. `getServerEnv()` database tetap independen dari auth secret. `.env.local` tidak diubah.
- Satu users existing, hash hanya pada authAccounts.password; emailVerified/image ditambahkan pada kontrak tipe. `src/types/auth.ts` memakai tipe library dengan BSON projection, bukan auth model paralel. Adapter asli dengan DB mock membuktikan ObjectId primary/reference/query round-trip. Tidak ada migrasi ID atau data; existing record/hash compatibility belum diverifikasi.
- `auth-schema.ts` memusatkan model names/additional fields/table indexes. Field status/platformRole/lastLoginAt client input ditolak/diabaikan sesuai parser library, tidak dikembalikan pada user profile response. Koleksi baru kontrak: authAccounts/authSessions/authVerifications/authRateLimits. Rincian schema/index di DATABASE_SCHEMA bagian 6.1; 10 index contracts termasuk 2 users existing.
- Adapter 1.7.13 otomatis memastikan **table indexes** saat write pertama, bukan semua field indexes. Helper maintenance auth menurunkan definitions dari schema library dan menambahkan unique rate-limit key yang wajib diprovision eksplisit sebelum traffic. Helper tidak dijalankan dalam task ini; index enforcement/concurrency live belum dibuktikan. Rate limiter database enabled termasuk development, tanpa custom storage atau bypass; trusted proxy/IP dan multi-instance behavior masih perlu verifikasi deployment.
- Business DAL authorization tetap fail-closed, tidak dimodifikasi. Tidak ada role tenant/plugin organization/admin baru. Auth global adapter terpisah dari business DAL dan tidak menambahkan raw access escape hatch. Library API mempertahankan payload/protokol normalnya, termasuk token pada beberapa native auth responses; aplikasi tidak membuat DTO credential. Pembatasan response client/session yang diperlukan harus diverifikasi pada P2.2/P2.4, jangan mengekspor seluruh auth session ke UI.
- Instalasi pnpm selesai menautkan paket tetapi exit 1 dengan blocked existing unrs-resolver@1.12.2. Tidak approve/rebuild script. File baru minimumReleaseAgeExclude yang dibuat pnpm dihapus agar tidak menjadi kebijakan permanen. Peringatan ESLint deprecated existing tetap; tidak upgrade unrelated dependencies.
- Next: **P2.2 — Implementasi login**, didahului pemeriksaan provisioning/index/schema existing sebelum live use. P2.3 logout, P2.4 status/session refresh/revocation/response filtering, P2.5 reset/email dan P2.6–P2.12 tenancy/security tetap terpisah. Tidak ada klaim Phase 2 complete atau readiness production.

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
- `MONGODB_DB_NAME`
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
