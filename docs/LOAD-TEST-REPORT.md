# Laporan Load Test — basego backend

Tanggal: 2026-10-27 · Tool: `hey` 15 detik per skenario, keep-alive.

## Lingkungan & batasan (baca dulu)

- Backend (image produksi, `APP_ENV=production`), Postgres 18, Redis 8 di **Docker Desktop macOS** (VM 8 vCPU, 4 GB). **Load generator ada di mesin yang sama**, jadi angka memuat overhead jaringan virtual Docker dan rebutan CPU. Anggap **pesimistis** dan jangan dibandingkan langsung dengan server Linux sungguhan.
- Data: 20.002 user, 200.005 activity log. Rate limit API/login dinaikkan khusus uji ini (default 100 req/menit per IP akan memblokir beban).
- Hanya endpoint baca + login diuji. **Tidak diuji**: beban tulis (create/update), upload, export, dan perilaku di atas 500 koneksi. Tidak ada Redis/DB terpisah di host lain.
- Satu putaran per skenario (tanpa pengulangan statistik).
- Kegagalan pengukuran yang saya temukan sendiri: tes login membuat ratusan sesi untuk satu akun sehingga sesi uji ter-evict (batas 3 sesi); dua angka `/auth/me` setelahnya mengukur respons 401 dan **dibuang**, lalu diulang dengan sesi admin yang valid.
- Angka CPU Postgres dari `docker stats` (~0%) tidak masuk akal dan **tidak dipakai**; biaya DB diambil dari `EXPLAIN ANALYZE`.

## Hasil (semua respons 200, 0 error pada semua level)

| Endpoint | Conc. | RPS | p50 | p95 | p99 |
|---|---|---|---|---|---|
| `GET /version` (tanpa auth/DB) | 50 | 15.725 | 2,8 ms | 5,5 ms | 10 ms |
| | 200 | 17.434 | 10,5 ms | 19,8 ms | 29 ms |
| | 500 | 16.606 | 28 ms | 51 ms | 87 ms |
| `GET /auth/me` (staf) | 50 | 3.460 | 11,5 ms | 33,8 ms | 60 ms |
| | 200 | 5.327 | 31 ms | 83 ms | 129 ms |
| | 500 | 6.129 | 71 ms | 166 ms | 255 ms |
| `GET /users?limit=10` (staf, 20k user) | 50 | 1.332 | 34 ms | 65 ms | 104 ms |
| | 200 | 1.268 | 143 ms | 296 ms | 413 ms |
| | 500 | 1.266 | 362 ms | 724 ms | 958 ms |
| `GET /users?search=user199` (ILIKE) | 100 | 128 | 722 ms | 1.353 ms | 1.690 ms |
| `GET /activity-logs?limit=10` (200k) | 100 | 206 | 452 ms | 839 ms | 1.077 ms |
| `GET /activity-logs?user=user19` | 20 | 119 | 154 ms | 286 ms | 398 ms |
| `POST /auth/login` (bcrypt cost 12) | 20 | **18** | 1.067 ms | 1.372 ms | 1.519 ms |

Memori backend ±65 MB. Log "activity log channel full": 0 (beban tulis log rendah di tes ini).

## Temuan

1. **Tidak ada error atau crash sampai 500 koneksi.** Lapisan dasar (CORS, CSRF, sanitizer, rate limit, Redis, JSON) mampu ±16–17 ribu req/dtk di mesin uji.
2. **Otorisasi menurunkan throughput ±3x** (`/version` 17k → `/auth/me` 5–6k) karena tiap request: beberapa panggilan Redis (rate limit transaksi, flag maintenance, sesi) + query identitas + query user/role/permission. Ini kandidat caching terbesar.
3. **Endpoint list jenuh di ±1.300 rps dan latensi naik linear terhadap concurrency** (p99 ≈ 1 detik di 500 koneksi): tanda antrian di DB/CPU, bukan error. `EXPLAIN ANALYZE`: users = Seq Scan + sort ±8 ms plus `count` ±2,4 ms per request; tidak ada index di `created_at`. Biaya ini **tumbuh seiring jumlah baris**.
4. **Pencarian `ILIKE '%…%'` dan activity log paling lambat** (128 dan 206 rps; Seq Scan 200k baris ±30 ms + `count` ±22 ms). Pada tabel log yang terus membesar ini memburuk.
5. **Login adalah vektor DoS CPU.** Ceiling ±18 login/dtk untuk 8 vCPU. Saat 30 klien membanjiri `/auth/login`, throughput `/auth/me` turun **3.921 → 433 rps (±9x)** dan p99 naik 60 → 337 ms. Rate limit per-IP menahan satu penyerang, bukan banyak IP.
6. Redis terlihat sibuk (±70–87% CPU di sampel), konsisten dengan 4–5 round-trip per request; angkanya tidak bisa dipercaya penuh karena overhead Docker Desktop, tapi jumlah round-trip memang bisa dikurangi.

## Rekomendasi berdasarkan data ini (urut dampak)

1. Index: `users(created_at)`, `activity_logs(created_at)`, `activity_logs(user_id)`, `activity_logs(module)`; `pg_trgm` untuk pencarian users; ganti `count(*)` aktivitas log dengan estimasi/cache untuk tabel besar.
2. Cache identitas + permission di Redis (TTL 30–60 dtk, invalidasi saat role/permission/status berubah) dan cache flag maintenance di memori proses.
3. Batasi bcrypt yang berjalan bersamaan (semaphore) dan tambahkan lockout per-akun, agar banjir login tidak menyeret seluruh API.
4. Kurangi round-trip Redis per request (satu pipeline/Lua untuk rate limit + cek).
5. Ulangi tes di Linux terpisah (generator di host lain), tambahkan skenario tulis dan campuran (mis. 90% baca / 10% tulis) sebelum menyimpulkan kapasitas produksi.

> Bagian di atas adalah pengukuran **awal** (sebelum fix guard dan sebelum optimasi). Hasil setelah optimasi ada di bawah.

---

# Hasil setelah optimasi

Dijalankan ulang dengan `backend/scripts/loadtest.sh` (10 dtk per skenario, mesin dan data yang sama; baseline diambil ulang dengan kode yang sudah memuat fix guard). **Noise antar-run sekitar 15–25%** (terlihat pada `/version` dan `/auth/me`, yang tidak berubah oleh optimasi DB), jadi perbedaan di bawah itu jangan dianggap nyata.

| Skenario | Baseline | Sesudah | Perubahan |
|---|---|---|---|
| `GET /version` c=200 | 16.050 rps | 21.480 rps | +34% |
| `GET /auth/me` c=200 | 6.382 rps | 8.438 rps | +32% (handler tetap query DB) |
| `GET /users?limit=10` c=50 | 1.423 rps · p99 80 ms | 2.777 rps · p99 66 ms | ~2x |
| `GET /users?limit=10` c=200 | 1.258 rps · p99 462 ms | 3.334 rps · p99 162 ms | **2,7x**, p99 −65% |
| `GET /users?search=user199` c=100 | 144 rps · p99 1.481 ms | 1.523 rps · p99 197 ms | **10,6x**, p99 −87% |
| `GET /activity-logs?limit=10` c=100 | 222 rps · p99 998 ms | 551 rps · p99 470 ms | 2,5x |
| `GET /activity-logs?user=user19` c=20 | 137 rps · p99 308 ms | 1.268 rps · p99 54 ms | **9,3x** |
| `POST /auth/login` c=20 (bcrypt) | 20 rps · p50 962 ms | 14 rps · p50 1.372 ms | −30% **disengaja** (lihat bawah) |
| `GET /auth/me` **saat banjir login** c=50 | 901 rps · p99 314 ms | 3.253 rps · p99 70 ms | **3,6x**, p99 −78% |

Semua respons sesuai harapan (200/401 sesuai skenario), tanpa error server.

## Apa yang diubah

| Langkah | Perubahan | Efek terukur |
|---|---|---|
| A. Index DB | `users(created_at DESC)` parsial, `activity_logs(created_at, user_id, module+action)`, `permissions(role_id, menu_id)`, `menus(path)`, trigram GIN (`pg_trgm`) untuk nama/email/IP. Query list users: **7,9 ms → 0,09 ms**; activity log: **29,7 ms → 0,11 ms**. | List/pencarian 2,5–10x |
| B. Cache otorisasi | Identitas dan permission di-cache in-process (TTL 5 dtk, `AUTHZ_CACHE_TTL_SECONDS`, singleflight, dibatasi 20k entri); flag maintenance di-cache 2 dtk; rate limit jadi 1 perintah Lua (sebelumnya MULTI/INCR/EXPIRE/EXEC). | Hilang 2 query DB per request; `/version` +34% |
| C. Bcrypt & lockout | Slot bcrypt dibatasi (`BCRYPT_MAX_CONCURRENT`, default ½ core) dengan antrean maks 3 dtk lalu 503 + `Retry-After`; lockout per akun (`RATE_LIMIT_LOGIN_ACCOUNT`, default 10 gagal/15 mnt); timeout HTTP server + graceful shutdown. | Banjir login tidak lagi mematikan API (+3,6x) |

## Keamanan cache: apa yang dijamin

Diuji langsung (15 skenario, semua lulus) dengan cache aktif:
- Mencabut / memberi izin lewat API berlaku **seketika** di instance yang sama (cache di-flush saat role, permission, menu, atau penugasan role berubah).
- Suspend user dan perubahan role/password menghapus sesi Redis, jadi **langsung 401**; sesi selalu dicek sebelum cache disentuh.
- Toggle maintenance berlaku seketika.
- Hanya hasil identitas yang valid yang di-cache; "tidak ditemukan/nonaktif" selalu dicek ke DB.
- **Batasan:** pada deployment **multi-instance**, edit role/permission yang dilakukan di instance A baru terlihat di instance B dalam ≤ TTL (5 detik). Set `AUTHZ_CACHE_TTL_SECONDS=0` bila itu tidak bisa diterima.

## Yang perlu diketahui

- **Login sengaja lebih lambat** (20 → 14 rps di mesin ini): kapasitas bcrypt dibatasi agar CPU tersisa untuk request lain. Itu harga dari perlindungan DoS; naikkan `BCRYPT_MAX_CONCURRENT` bila login memang lebih kritis daripada API lain.
- **Lockout per akun bisa disalahgunakan**: orang yang tahu emailmu bisa mengunci akunmu 15 menit dengan 10 password salah. Naikkan ambang atau set 0 untuk menonaktifkan. Terverifikasi: akun lain tidak terpengaruh dan penolakan terjadi sebelum bcrypt.
- Sudah ada instalasi lama? Jalankan ulang `./baseadmin migrate` agar index terbuat (butuh hak `CREATE EXTENSION` untuk `pg_trgm`; bila tidak ada, hanya muncul peringatan dan pencarian tetap benar tapi lebih lambat).

## Putaran 2: sisa bottleneck dikerjakan

| Perubahan | Hasil terukur |
|---|---|
| **Total `count(*)` activity log di-cache 10 dtk** (hanya untuk pager; dibersihkan setelah cleanup) | `GET /activity-logs` c=100: 551 → **4.315 rps**, p99 470 → 105 ms |
| **Profil `/auth/me` di-cache** (TTL sama, di-flush oleh perubahan role/permission/menu/user/avatar) | `/auth/me` c=200: 8.438 → **11.437 rps**; saat banjir login 3.253 → **7.131 rps**, p99 70 → 27 ms |
| **Activity log ditulis batch** (maks 100 baris atau tiap 200 ms; antrean 10.000; fallback per-baris bila satu baris gagal; counter drop) + **flush saat shutdown** | Beban tulis `PUT /users/:uuid` c=50: **1.167 rps**; 11.779 respons 200 → **11.779 baris audit**, 0 drop |
| **Uji shutdown di tengah beban** (`docker stop` saat 100 koneksi menulis) | 3.603 respons 200 → **3.603 baris audit tersimpan**: tidak ada entri hilang |
| Skenario baru: **c=1000** dan beban tulis | lihat tabel bawah |

| Skenario (script `loadtest.sh`) | rps | p50 | p99 | Respons |
|---|---|---|---|---|
| `GET /version` c=1000 | 19.159 | 47 ms | 136 ms | semua 200 |
| `GET /users?limit=10` c=1000 | 2.621 | 293 ms | **1.945 ms** | semua 200 |
| `PUT /users/:uuid` (tulis + audit) c=50 | 1.167 | 32 ms | 242 ms | semua 200 |

**Catatan jujur:**
- `/users` di c=1000 tidak error tetapi **p99 ±2 detik**: throughput jenuh ±2.600–3.000 rps sehingga tambahan koneksi hanya memperpanjang antrean. Lebih banyak kapasitas butuh lebih banyak core/instance atau cache respons list, bukan tuning lagi.
- Throughput login "alone" di run ini 11 rps (sebelumnya 14–20): variasi antar-run dan batas slot bcrypt (½ core); bukan perubahan kode di jalur login.
- Cache profil/total punya konsekuensi sama dengan cache otorisasi: perubahan di instance lain terlihat ≤ TTL. Total pager activity log bisa tertinggal ≤10 detik.

## Sengaja tidak dikerjakan

- **Mengurangi round-trip Redis (rate limit + sesi) jadi satu:** rate limiter global berjalan sebelum route, sedangkan pengecekan sesi hanya di route ter-guard; menggabungkannya berarti merombak urutan middleware, atau menyimpan sesi di memori yang akan merusak logout/suspend seketika. Risiko keamanan tidak sepadan dengan keuntungan (Redis bukan bottleneck terukur; Lua sudah memangkas biayanya).

## Batasan pengujian (tetap berlaku)

Satu mesin (generator + server), maksimum 1.000 koneksi, satu putaran per skenario, noise 15–25%, belum ada tes upload/export. Ulangi di Linux dengan generator terpisah sebelum menyimpulkan kapasitas produksi.
