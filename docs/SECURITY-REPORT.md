# Laporan Security Test & Hardening — basego

Tanggal: 2026-10-27 · Cakupan: `backend/` (Go), `webadmin/` (React), `docker-compose.yml`, Dockerfile, CI, `mobile/` (hanya review kode, lihat batasan).

## Ringkasan

| | Sebelum | Sesudah |
|---|---|---|
| `govulncheck` (kode terjangkau) | **8 kerentanan** (excelize ×2, x/net ×5, x/text ×1) | **0** |
| `npm audit` | **15** (9 high, 6 moderate) | **0** |
| Temuan logika/otorisasi (manual) | 6 critical/high (termasuk **C1**, ditemukan belakangan lewat load test) | 0 yang diketahui |
| Test otomatis | 1 paket Go, 3 file vitest | 6 paket Go, 4 file vitest + 28 skenario E2E (sekali jalan) |

Semua perubahan diverifikasi dengan: `go build`, `go vet`, `go test`, `govulncheck`, `gosec`, `npm test`, `npm run build`, `npm audit`, dan **uji end-to-end pada stack Docker sungguhan** (Postgres 18 + Redis 8 + backend + nginx) di project compose terpisah (`bgsec`, port lain, sudah dihapus). Stack `basego-*` milik kamu tidak disentuh.

---

## 1. Temuan keamanan & perbaikan

### Critical / High

| # | Temuan | Dampak | Perbaikan |
|---|---|---|---|
| **C1** | **Pengecekan permission tidak pernah efektif.** `guard()` di `main.go` memanggil `sessionAuth(c)`, yang berakhir dengan `c.Next()`; akibatnya handler route **dieksekusi lebih dulu**, baru `RequirePermission` jalan dan menempelkan 403 pada respons yang sudah terkirim. Ada sejak kode awal (HEAD `e4cf074`). | **Semua user yang login bisa melakukan apa saja** di route ber-`guard`: baca/tulis/hapus users, roles, settings, tiket, membersihkan log. Respons terlihat 403 tapi data sudah berubah (terbukti: staf tanpa izin membuat role, HTTP 201). Hanya aturan yang dicek di dalam service (superadmin) yang tetap bekerja. | Pengecekan auth & permission dipisah dari `c.Next()` (`authenticate`, `checkPermission`) dan digabung di `middleware.NewGuard`: keduanya selesai **sebelum** handler jalan. Aksi tak dikenal ditolak (fail-closed). Terverifikasi: staf tanpa izin → 403 pada GET/POST/PUT/DELETE dan **tidak ada data berubah**; staf dengan izin `view` hanya bisa GET. Test regresi: `middleware/guard_test.go`. |
| H1 | **Privilege escalation di modul Users.** Siapa pun dengan izin `users:edit` bisa mengganti password/email/status superadmin, memberi dirinya role superadmin, atau membuat user superadmin. Proteksi hanya ada di `Delete` dan `UpdateStatus`, tidak di `Update`/`Create`/`avatar`. | Takeover akun superadmin oleh staf biasa | Guard `ErrSuperadminRequired` di `Create`, `Update`, `UploadAvatar`: target superadmin atau role superadmin hanya boleh oleh superadmin (403). |
| H2 | **Privilege escalation di modul Roles.** `roles:create` bisa membuat role `is_superadmin=true` (bypass semua permission). | Eskalasi ke superadmin | `Create` role superadmin hanya untuk superadmin. |
| H3 | **Kredensial hardcoded di seeder.** `admin@example.com / Admin@12345` dan sebuah akun **superadmin pribadi** (`rinoaprisedo@gmail.com / password!!`) dibuat di setiap deploy; juga ter-prefill di login mobile (debug) dan tertulis di README. | Backdoor di tiap deployment yang lupa ganti password | Akun pribadi dihapus dari seeder; password admin dari `SEED_ADMIN_PASSWORD` atau **acak, dicetak sekali**. Prefill mobile dan dokumentasi dibersihkan. |
| H4 | **IP spoofing melewati rate limit & login lockout.** Gin default mempercayai semua proxy, jadi `X-Forwarded-For: <acak>` mengganti `ClientIP()`. | Brute-force login tanpa batas | `TRUSTED_PROXIES` (default kosong = tidak percaya header). Terverifikasi E2E: XFF diputar → tepat 5 gagal lalu 429. |
| H5 | **Dependency rentan** (excelize, x/net HTTP/2, x/text, vite, undici, react-router, zod, dll). | DoS / bug parser | Lihat bagian 2. |

### Medium

| # | Temuan | Perbaikan |
|---|---|---|
| M1 | **Upload mempertahankan ekstensi dari klien.** `evil.html` berisi magic bytes PNG disimpan sebagai `.html` dan disajikan `/uploads` sebagai HTML (stored XSS di origin API). | Ekstensi diturunkan dari tipe hasil sniff (`.jpg/.png/.webp`). Terverifikasi E2E. |
| M2 | **Password reset token disimpan plaintext** di DB dan **dicetak ke log di production**. | Token di-hash (SHA-256) di DB; log hanya di non-production; semua token lain milik email itu dihanguskan setelah dipakai; sesi DB dibersihkan. Terverifikasi: reset OK, replay & hash-sebagai-token ditolak. |
| M3 | **Session token mentah disimpan di tabel `sessions`** (replay bila DB bocor). | Disimpan sebagai hash SHA-256. |
| M4 | **`SessionAuth` tidak memeriksa status/hapus user** (komentar kode mengklaim ya). Sesi Redis tetap hidup walau user dinonaktifkan/dihapus lewat jalur tak terduga. | Cek per-request: user ada, belum dihapus, `status=active`. Terverifikasi: user suspended → 401. |
| M5 | **Password admin tanpa policy.** `POST/PUT /users` menerima `"1"`; status bebas (`"banana"`). | Policy dibagi lewat `utils.ValidatePasswordPolicy` (8–72 byte, huruf besar, angka, simbol); status divalidasi. |
| M6 | **Enumerasi email lewat timing login** (email tak dikenal merespons tanpa bcrypt). | Hash dummy bcrypt dengan cost yang sama. |
| M7 | **CSV/Excel formula injection** pada export users (`=HYPERLINK(...)` di nama). | Sel diawali `=,+,-,@,tab,CR` diprefiks `'`. |
| M8 | **Counter rate-limit bisa abadi**: `INCR` lalu `EXPIRE` terpisah; proses mati di antaranya → client terkunci selamanya. | `INCR + EXPIRE NX` dalam satu transaksi. Terverifikasi: semua key punya TTL. |
| M9 | **Container jalan sebagai root; `.env` ikut ter-`COPY` ke image**; `swag@latest` tak terkunci; `npm install` bukan `npm ci`; base image usang (Go 1.26, Alpine 3.20, Node 20 EOL, nginx 1.27). | Lihat bagian 3. **Jika image lama pernah di-push ke registry, rotasi semua secret di `backend/.env`.** |

### Bug fungsional yang ditemukan sambil audit

- **Maintenance mode mengunci semua orang, termasuk superadmin.** Middleware berjalan sebelum `SessionAuth`, jadi flag superadmin tidak pernah terisi → login pun 503, mode tidak bisa dimatikan dari UI. Sekarang superadmin dikenali dari cookie sesi; `POST /auth/login`, `GET /settings/public`, `GET /version` dikecualikan. Terverifikasi E2E.
- `.env.example` (port 8500/5433/6379) tidak cocok dengan compose (8800/5401/6301) → backend di Docker mendengarkan port salah bila `.env` disalin dari contoh. Disamakan, dan compose memaksa `APP_PORT`.
- Permintaan awalmu — **superadmin menghapus superadmin lain** — sudah benar dan kini terverifikasi E2E (self-delete tetap diblokir).

---

## 2. Versi package

### Go (`backend/go.mod`)
| Package | Sebelum | Sesudah |
|---|---|---|
| golang.org/x/net | 0.56.0 | 0.61.0 |
| golang.org/x/crypto | 0.54.0 | 0.58.0 |
| golang.org/x/text | 0.40.0 | 0.43.0 |
| github.com/xuri/excelize/v2 | 2.11.0 | 2.11.1-0.20261026… (commit `master`; **fix kerentanan hanya ada di sini**, belum ada rilis tag) |
| github.com/redis/go-redis/v9 | 9.21.0 | 9.23.0 |
| github.com/gin-contrib/cors | 1.7.7 | 1.7.9 |
| gorm.io/driver/postgres | 1.6.0 | 1.6.3 |
| jackc/pgx/v5 | 5.9.2 | 5.11.0 |
| go-sql-driver/mysql | 1.8.1 | 1.10.1 |
| quic-go, validator, mongo-driver, dll. (indirect) | — | terbaru |

`gin` 1.12.0, `gorm` 1.31.2, `swag` 1.16.6 sudah versi terbaru. Satu advisory `x/crypto` (GO-2026-5932) belum punya fix upstream; `govulncheck` memastikan kodemu tidak memanggilnya.

### npm (`webadmin/`)
| Package | Sebelum | Sesudah |
|---|---|---|
| vite | 6.4.3 | 6.4.5 |
| zod | 3.25.x | **4.6.7** (major) |
| @hookform/resolvers | 3.10.0 | **5.9.2** (major, wajib untuk zod 4) |
| react-router-dom | 6.30.4 | **7.18.4** (major) |
| axios, react-query, react-hook-form, postcss, autoprefixer, vitest, dll. | — | terbaru dalam range |

Tiga major di atas dipilih karena advisory-nya hanya bisa ditutup dengan major. Dipastikan tidak ada regresi: 14 test lolos (termasuk test baru `Login.test.jsx` yang menjalankan react-hook-form + resolvers + zod 4 + router 7 bersamaan) dan `vite build` sukses.

**Sengaja tidak dinaikkan** (bukan keamanan, risiko breaking tinggi): React 19, Vite 8, Tailwind 4, Vitest 5, lucide-react 1.x, date-fns 4, zustand 5.

### Docker / compose / CI
| Komponen | Sebelum | Sesudah |
|---|---|---|
| Go builder | golang:1.26-alpine | golang:1.27-alpine3.24 |
| Runtime backend | alpine:3.20 (root) | alpine:3.24, user `app` non-root, HEALTHCHECK |
| Node builder | node:20-alpine (EOL) | node:24-alpine3.24 (LTS), `npm ci` |
| Web server | nginx:1.27 (root, :80) | nginx-unprivileged:1.30 (non-root, :8080), `server_tokens off` |
| Redis | 7-alpine | 8-alpine |
| Postgres | 18-alpine | 18-alpine (sudah terbaru) |
| swag di Docker | `@latest` | `@v1.16.6` |
| GitHub Actions | checkout v4, setup-go v5, setup-node v4 (Node 20) | v7 / v7 / v7 (Node 24) |

---

### Ditambahkan setelah load test

- **Timeout HTTP server** (`ReadHeaderTimeout`, dst.) + graceful shutdown — sebelumnya `router.Run()` tanpa timeout (rentan Slowloris).
- **Batas concurrency bcrypt** (503 + `Retry-After` bila penuh): banjir login sebelumnya menurunkan throughput API ±9x.
- **Lockout per akun** (`RATE_LIMIT_LOGIN_ACCOUNT`), dicek sebelum bcrypt; email di-hash di Redis. Trade-off: akun bisa dikunci pihak lain (lihat `LOAD-TEST-REPORT.md`).
- **Cache otorisasi** dengan invalidasi eksplisit; semantik keamanannya diuji (pencabutan izin, suspend, maintenance berlaku seketika; multi-instance ≤ 5 dtk).

## 3. Perubahan Docker & compose

- Postgres & Redis hanya bind ke `127.0.0.1` (sebelumnya semua interface, Redis tanpa password).
- Password Postgres: `${POSTGRES_PASSWORD:-password}`, dibaca juga oleh backend sehingga tidak bisa tidak sinkron. **Set `POSTGRES_PASSWORD` untuk lingkungan apa pun selain laptopmu.**
- `no-new-privileges` di semua service; `cap_drop: ALL` di backend & webadmin.
- Volume `appdata:/app/storage` agar upload bertahan antar rebuild (sebelumnya hilang).
- `env_file` backend jadi opsional (`required: false`); healthcheck diberi timeout/retries.
- `.dockerignore` baru untuk backend & webadmin (mencegah `.env`/`node_modules` masuk image).
- Port webadmin berubah: `8801:8080` (host tetap 8801).

---

## 4. Cara verifikasi (E2E, 28 skenario, semua lulus)

> **Koreksi jujur:** versi pertama laporan ini menyatakan tidak ada temuan otorisasi tersisa. Itu keliru: skenario E2E awal memakai staf yang *sudah diberi* izin, sehingga bug C1 tidak terlihat (skenario "staf tidak bisa…" lolos karena guard di level service, bukan karena permission). C1 baru ketahuan saat menyiapkan load test dengan staf tanpa izin. Setelah fix, skenario "tanpa izin" ditambahkan (lihat C1). Hal ini juga berarti **audit sebelumnya hanya meninjau kode secara terpisah-pisah, tidak menelusuri urutan eksekusi middleware**; sebaiknya ada review independen tambahan.

Login superadmin · buat role & user staf · staf **tidak bisa**: reset password superadmin, suspend superadmin, naikkan diri ke superadmin, buat user/role superadmin, hapus superadmin · staf tetap bisa edit user biasa · superadmin bisa hapus superadmin lain, tidak bisa hapus diri sendiri · password lemah & status invalid ditolak · avatar `evil.html` tersimpan `.png` · user suspended langsung 401 lalu bisa login lagi setelah aktif · maintenance: user biasa 503, superadmin lolos, login tetap bisa, bisa dimatikan · XFF diputar tetap terkena rate limit · token reset ter-hash, replay ditolak · TTL semua key Redis ada · token sesi di DB berupa hash 64 karakter.

Test permanen yang ditambahkan: `utils/password_test.go`, `storage/local_test.go`, `middleware/maintenance_test.go`, `modules/users/export_test.go`, `main_test.go` (trusted proxy), `webadmin/src/pages/auth/Login.test.jsx`.

---

## 5. Yang perlu kamu lakukan / perhatikan

1. **Database yang sudah ada tidak diubah.** Akun lama `admin@example.com / Admin@12345` dan `rinoaprisedo@gmail.com / password!!` kemungkinan masih ada di DB lokal/staging/produksi. **Ganti password atau hapus.** Token reset password lama (plaintext) tidak akan cocok lagi setelah deploy (masa berlakunya hanya 1 jam). Sesi login aktif di Redis tetap berlaku; baris `sessions` lama di DB masih berisi token mentah dan bisa dibersihkan (`DELETE FROM sessions;`).
2. **Di belakang reverse proxy / load balancer, isi `TRUSTED_PROXIES`** (IP/CIDR proxy). Jika dibiarkan kosong di sana, semua user terlihat berasal dari IP proxy dan berbagi satu kuota rate limit/lockout.
3. **Rotasi secret** di `backend/.env` bila image lama pernah dipublikasikan.
4. **`.github/` ada di `.gitignore`**, jadi workflow `security-scan.yml` dan `dependabot.yml` tidak ikut di-commit. Hapus baris itu agar scan CI benar-benar jalan. (Isi workflow sudah saya perbarui, tapi tidak mengubah `.gitignore`.)
5. Fitur **lupa password tidak mengirim email** (belum ada SMTP). Di production kini sengaja tidak mencetak token ke log, jadi fitur ini tidak berfungsi sampai pengiriman email diimplementasikan.
6. Perubahan perilaku yang terlihat user: sesi user yang dinonaktifkan langsung 401; admin tidak lagi bisa mengedit superadmin; password yang dibuat admin harus memenuhi policy.
7. **Jika versi lama pernah berjalan di lingkungan nyata, anggap semua data yang bisa diubah user terautentikasi mana pun mungkin sudah berubah (C1).** Periksa `activity_logs` dan daftar user/role/permission untuk perubahan tak wajar.
8. Belum ada commit; semua perubahan ada di working tree untuk kamu review.

## 6. Risiko tersisa / batasan

- **Mobile (Flutter) tidak bisa dites**: toolchain Flutter tidak terpasang. Hanya prefill kredensial yang dihapus (plus import tak terpakai). Dependensi mobile **belum diperiksa/di-update** (kandidat: `go_router` 17→18, `cupertino_icons` 1→2, `flutter_riverpod` →3.4.x). Jalankan `flutter pub outdated` dan `flutter analyze`.
- Lockout login hanya per-IP, belum per-akun (credential stuffing dari banyak IP tidak terbatasi selain rate limit global).
- Izin `roles:edit` memungkinkan pemegangnya memberi dirinya permission apa pun pada role-nya sendiri; ini sifat model permission, bukan bug, tapi batasi siapa yang memegangnya.
- Endpoint `PUT /settings` menerima key/value bebas (mis. `app_logo` berisi URL arbitrer); hanya untuk pemegang `settings:edit`.
- Sanitizer XSS global juga menghapus pola `<...>` dari kolom password (mengurangi entropi password yang memuatnya).
- CSRF memakai double-submit cookie tanpa penandatanganan (cukup untuk same-site, rentan bila ada subdomain yang tidak tepercaya).
- Redis tanpa password dan koneksi Postgres `sslmode=disable` — wajar di jaringan compose lokal, **harus** diubah untuk production (Redis `requirepass`, Postgres TLS).
- Sisa temuan `gosec` ditinjau dan diterima: `cmd/ticket` (CLI developer), pola `G304` pada storage (path sudah di-root dan di-clean, ada test traversal), `G101` (nama konstanta, bukan secret), `G706` (sengaja mencetak password seed sekali).
- Pengujian ini otomatis + review manual, bukan pentest eksternal penuh; tidak mencakup konfigurasi infrastruktur produksi (TLS, WAF, backup, dsb).
