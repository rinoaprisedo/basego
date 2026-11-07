# CLAUDE.md

Guidance for Claude Code in this repo. Read first — it should answer most orientation questions without grepping the tree.

## What this is

Boilerplate ("BaseProject") for application systems: web admin + mobile app on one API. **Go (Gin + GORM)** backend, **React (Vite)** web admin, **Redis** sessions, **PostgreSQL** (MySQL-switchable via `DB_DRIVER`; some queries use Postgres-only `ILIKE`/`ANY`).

- `backend/` — module-per-feature under `modules/`, `:8800`
- `webadmin/` — Vite dev server `:8801`
- `mobile/` — Flutter (Riverpod + go_router), web dev server `:8802`
- Ports: BE 8800, WEBADMIN 8801, MOBILE 8802, POSTGRES 5401, REDIS 6301 (`docker-compose.yml` + `.env.example` are the source of truth)

## Commands

```bash
# Backend (cd backend)
go build ./...                 # compile check — after every backend change
go test ./...                  # table-driven, no DB
go run main.go migrate         # AutoMigrate + partial unique indexes + one-off data migrations (idempotent)
go run main.go seed            # default roles/users/menus/permissions/settings (idempotent)
go run main.go                 # server (docs/ must exist: `swag init -g main.go -o docs`, gitignored)

# Frontend (cd webadmin)
npm run build                  # after every frontend change
npm run dev                    # :8801
npm test                       # vitest
```

No frontend lint script. A clean build + tests is the minimum bar, not proof of correctness.

## Local dev setup (this environment)

Hybrid: only Postgres + Redis run in Docker (`docker compose -p basego up -d postgres redis` → `basego-postgres-1`/`basego-redis-1`); backend and webadmin run natively. First time: `cp .env.example .env` in both, `swag init`, `migrate`, `seed`. Login `admin@example.com` / `SEED_ADMIN_PASSWORD` (or printed by `seed`). Swagger: `http://localhost:8800/swagger/index.html` (superadmin).

Restart the backend after any Go change: kill the listener on :8800 and its parent `go run`, then `go run main.go`. `go`/`docker` live in `/opt/homebrew/bin`, which may not be on a fresh shell's `PATH`. Beware: zsh doesn't word-split unquoted `$VAR` (use arrays) and fails the whole line on unmatched globs.

## Backend architecture

Each module: `handler.go` (Gin) → `service.go` (rules) → `repository.go` (GORM) → `model.go` → `routes.go`. Modules: `auth`, `users`, `roles`, `permissions`, `menus` (menus + sections, one permission `menus`), `settings`, `activity_logs`, `dev_tickets`, `files`.

### Auth & sessions
- Session token = random 32-byte hex. **Redis is the source of truth** (`session:<token>`, `user_sessions:<userID>`); the `sessions` DB table is a write-through mirror — always update both (`session.Create/Delete/DeleteAllForUser`). `SESSION_MAX_CONCURRENT` evicts the oldest token.
- Permissions are checked fresh from DB per request (`RequirePermission` = `guard(menuPath, action)`); superadmin bypasses. A role/status change invalidates that user's sessions (`Service.invalidateSessions`); admin password resets too, self-service `ChangePassword` doesn't.
- Password policy (`utils.ValidatePasswordPolicy`): ≥8 chars + upper + number + symbol; bcrypt cost 12; last 5 passwords can't be reused. Forgot/reset-password endpoints exist but **email is only logged to stdout**; the UI was removed.
- Login: generic `RateLimit` + a separate `LoginLockout` per IP.

### Roles & permissions
- `Permission{RoleID, MenuID, CanView/Create/Edit/Delete}`. `PUT /roles/:uuid/permissions` replaces the whole matrix and **silently ignores per-row errors** — check there if a permission "didn't save". `GET` returns only existing rows; `RolePermissions.jsx` merges with the menu tree.
- Superadmin role can't be demoted/deleted/edited; superadmin accounts and the superadmin role can only be managed by a superadmin (`hasSuperadminRole`). A role in use can't be deleted.

### Menus & sections
- `Menu.MenuSectionUUID` is transient (`gorm:"-"`). `Tree` buckets menus by section; orphans go to a synthetic "Uncategorized". `GET /menus` needs only a session (sidebar); writes are guarded. The web page `pages/menus/Menus.jsx` is a single page: section cards (drag header to reorder, add/edit/delete) containing menu rows (drag to reorder within a section, `IconPicker` for icons). Reorder endpoints are non-atomic `{uuid, order}` loops.

### Activity logs
- `LogActivity` is async (buffered channel, cap 1000, dropped when full, no-op if the worker isn't started). Nothing is auto-logged — every mutating endpoint calls it. Mutating services return `(before, after, error)` for the diff.
- `GET /activity-logs` supports `search` (action/module/record/IP/user), filters, and `GET /activity-logs/modules` feeds the module filter. `DELETE /cleanup` hard-deletes rows older than `LOG_CLEANUP_DAYS` (manual, not scheduled).

### Settings
Key-value table; a new setting needs no migration. `GET /settings` needs a session; `GET /settings/public` is unauthenticated and whitelisted (`publicKeys` in `service.go`: app name/logo/favicon, `primary_color`, `sidebar_color`, `login_*`, `default_page_size`). `default_page_size` must be an integer 1–200. `maintenance_mode` is cached in Redis 60s and 503s everyone but superadmins.

### Middleware (`backend/middleware/`)
`session_auth`, `permission`, `rate_limit`, `security` (CORS whitelist from comma-separated `FRONTEND_URL`, security headers, size limit), `csrf` (double-submit cookie + `X-CSRF-Token`, skips bearer APIs), `xss` (strips HTML from JSON bodies, same skip list), `maintenance`. `webadmin/nginx.conf` sets the real production CSP for the SPA.

### Config, DB
- `config/config.go` reads `.env`; don't add an env var without wiring it to behavior. App name/branding live in the `settings` table. `PrivateStoragePath` = sibling `private/` of `STORAGE_PATH`, never served by `/uploads`.
- **Known gap**: Redis has no password in compose — fine locally, fix before any shared deployment (it holds session tokens).
- `migrate.go` AutoMigrates all models, swaps `users.email`/`roles.name` for partial unique indexes (`WHERE deleted_at IS NULL`), adds perf indexes, and runs `migrateTicketStatus` (folds legacy ticket columns into `status`) before AutoMigrate. Seeder is `FirstOrCreate` throughout (superadmin role/user, menus, superadmin permissions, default settings).

## Users import (`modules/users/import.go`)
Bulk `.xlsx`: template `GET /users/import/template`; mode `insert` creates, mode `update` edits users matched by email, only the ticked columns (name/password/status/role). `POST /users/import/{insert|update}/validate` starts a background job (poll `GET /users/import/jobs/:token`); `POST …/commit/:token` is accepted only when **every** row is valid and applies all rows in one transaction (bcrypt in parallel first). Jobs are in process memory (1 h TTL — plaintext passwords never reach Redis/DB), so multi-instance needs sticky routing. Insert needs `users:create`, update `users:edit`; max 2000 rows / 5 MB.

## Tiket QC (`modules/dev_tickets`)
Menu path `dev-tickets` (run `migrate` + `seed`). One status per ticket: `open → in_progress / need_info → done_dev → deployed → closed`, plus `reopen`; Claude may only set `in_progress`, `need_info`, `done_dev`. `role` is optional; `reported_on` is a timestamp (RFC3339 or `YYYY-MM-DD HH:mm`, zone-less = WIB). Screenshots live in the private store, served only via `GET /api/v1/files/dev_tickets/*` (needs `dev-tickets` view). The Claude API (`/api/v1/dev-api/*`, bearer token from Tiket → Akses Claude) is exempt from CSRF/XSS. CLI (env `BASEGO_TICKET_API`/`BASEGO_TICKET_TOKEN` or `.ticket.env`):

```bash
cd backend
go run ./cmd/ticket list [-status open,in_progress] [-priority High] [-platform Android] [-all]
go run ./cmd/ticket show 12      # also downloads screenshots — Read them
go run ./cmd/ticket start 12
go run ./cmd/ticket done 12 "…"  # "-" = note from stdin
go run ./cmd/ticket ask 12 "…"   # need_info
go run ./cmd/ticket comment 12 "…"
```

## Frontend architecture

- **Layout**: no top bar on desktop — the sidebar holds the profile card, theme (dark/light) toggle and logout. Below `lg` a slim `Navbar` shows the hamburger and the page actions.
- **Page actions**: pages register their toolbar (`Menubar*` from `components/ui/Menubar.jsx`) with `usePageActions(node)` (`store/pageActionsStore.js`). A `<PageToolbar>` (rendered by `Table` and by card pages like Menus/Settings/RolePermissions) hosts them inside the card on desktop and flags `tableHosted` so the Navbar hides them; below `lg` the Navbar shows them. Don't put titles/actions in the page body. `pages/users/Users.jsx` is the reference page. `MenubarMenu` panels render through a portal (the bar scrolls horizontally).
- **Theme**: color is runtime-configurable — `primary`/`sidebar.active` resolve to `rgb(var(--color-primary-rgb) / <alpha-value>)`, set by `utils/color.js` via `store/settingsStore.js` (public endpoint, works pre-login). Settings → General offers preset packages (`utils/themes.js`, default "Crimson" `#ec4141` + `#000000`) plus manual base/sidebar colors; never hardcode a hex for primary. Dark mode: `store/themeStore.js`.
- **Shared UI**: `Modal` (colored hero header with icon/description, hidden scrollbar; footers use the `modal-footer` class so the body drops its bottom padding), `Select` (searchable dropdown, keeps the native `<select>` API incl. react-hook-form `register`; `compact` prop for tiny lists), `Table` (search/sort/pagination, default page size from settings), `IconPicker`/`MenuIcon` (lucide icons by name), `FilterPanel` + `useFilters`, `Textarea` (`wrapperClassName`), `Thumb`/`ImageLightbox`. `Button` has no class merging — conflicting utilities need `!`.
- **Dates**: always use `utils/date.js` (`formatDateTime` → `1 Jan 26 12:12`, `formatDate`).
- **Permissions**: `usePermission()` (`canView/Create/Edit/Delete`), superadmin → all true; `ProtectedRoute` is a client gate only — the server enforces.
- Routing is a flat tree with per-page `ProtectedRoute` and no code-splitting (single large chunk). State: Zustand stores in `store/` (`authStore`, `settingsStore` incl. `pageSize`, `themeStore`, `sidebarStore`, `pageActionsStore`). Toasts: `react-hot-toast`.

## Mobile app (`mobile/`)

Flutter (`fvm`, stable), feature-first (`lib/core`, `lib/features/<name>/{data,domain,presentation}`, `lib/shell`). Screens: Login, Home placeholder, Profile.
- **Auth is cookie-based** (httpOnly `session` + `csrf_token` double-submit, also on login) — never send `Authorization: Bearer`. `core/network/dio_client.dart` replays cookies via `cookie_support_io.dart` (PersistCookieJar) or `cookie_support_web.dart` (`withCredentials`, reads `csrf_token` from `document.cookie`).
- `AppConfig` (`core/config/env.dart`): `dev` = `http://10.0.2.2:8800/api/v1` (Android emulator alias), `prod` is a placeholder; `--dart-define=ENV=prod` / `API_BASE_URL=…` override. Primary color comes from `/settings/public` into `ColorScheme.fromSeed`.
- Web target: `fvm flutter run -d web-server --web-port=8802 --dart-define=API_BASE_URL=http://localhost:8800/api/v1` (not `-d chrome`). Extend, don't replace, the comma-separated `FRONTEND_URL` when adding a web dev port (CORS allowlist).

## Testing

Backend: table-driven `_test.go` beside the code, no database (activity_logs, auth, dev_tickets, middleware, storage, users, utils). Frontend: Vitest (`validation`, `cn`, `Button`, `themeStore`, `Login`). Import/status flows were verified by hand against the running server.

## Docker

`docker-compose.yml`: postgres 18 (5401), redis 7 (6301, no password), backend (8800), webadmin (8801, nginx). `backend/Dockerfile` runs `swag init` then builds a static binary into slim alpine; `storage/` is baked in but **uploads aren't a mounted volume** — avatar/logo/private files are lost on rebuild unless you add one. `webadmin/Dockerfile` builds with node 20 and serves via nginx (SPA fallback + production CSP).

## Conventions

- Comments explain *why*, never *what*.
- Don't add a Dockerfile/env/config knob without wiring it to behavior.
- Mutating, auditable service methods return `(before, after, error)`; new mutating endpoints must call `LogActivity`.
- Run `go build ./...` + `go test ./...` / `npm run build` + `npm test` before calling a change done; restart the backend after Go changes.
