# CLAUDE.md

Guidance for Claude Code working in this repo. Read this first — it should cover most orientation questions without needing to grep the whole tree.

## What this is

Full-stack admin panel boilerplate: **Go (Gin + GORM)** backend, **React (Vite)** frontend, **Redis**-backed sessions, **PostgreSQL** by default (MySQL-switchable via `DB_DRIVER`).

- Backend: `backend/` — module-per-feature under `modules/`, runs on `:8500`
- Frontend: `frontend/` — Vite dev server on `:8501` (see `vite.config.js`)
- Local infra: `docker-compose.yml` (postgres, redis, backend, frontend)

## Commands

```bash
# Backend
cd backend
go build ./...                      # compile check — run after every backend change
go run main.go migrate              # AutoMigrate + partial unique indexes (idempotent)
go run main.go seed                 # default roles/users/menus/permissions/settings (idempotent, FirstOrCreate)
go run main.go                      # start server (needs docs/ generated first, see Swagger below)
swag init -g main.go -o docs        # regenerate Swagger — docs/ is gitignored but main.go imports it

# Frontend
cd frontend
npm run build                       # production build — run after every frontend change to catch errors
npm run dev                         # dev server on :8501
npm test                            # vitest — only 3 test files exist (validation, cn, Button), minimal coverage
```

There is no lint script configured on the frontend, and **no Go tests exist anywhere in `backend/`**. `go build ./...` and `npm run build` are the two commands to always run before calling a change done — treat a clean build as the minimum bar, not proof of correctness.

## Backend architecture

Each feature is a self-contained module under `backend/modules/<name>/`: `handler.go` (HTTP layer, Gin) → `service.go` (business rules) → `repository.go` (GORM/SQL) → `model.go` → `routes.go`. Modules: `auth`, `users`, `roles`, `permissions`, `menus`, `menu_sections`, `settings`, `activity_logs`.

### Auth & sessions

- Session token is a random 32-byte hex string (`crypto/rand`), *not* a signed/JWT-style token. **Redis is the source of truth** (`session:<token>` key + `user_sessions:<userID>` sorted set, `session/session.go`) — `middleware/session_auth.go` checks Redis on every request. The `sessions` DB table (a GORM model under `modules/users`, unrelated to the `session` package name) is a write-through mirror used only so `GET /users/:uuid/sessions` can list/revoke sessions in the admin UI. **When touching login/logout/session-revoke code, always mirror both sides** — see `session.Create`/`session.Delete`/`session.DeleteAllForUser`.
- `session.Create` enforces `SESSION_MAX_CONCURRENT` by evicting the oldest token in the user's sorted set once the limit is exceeded. IP/user-agent are stored per session but never re-checked against later requests (no hijack detection).
- Permissions are checked **fresh from DB on every request** (`middleware/permission.go`, `RequirePermission` — the `guard(menuPath, action)` function referenced in every module's `routes.go`) — no caching, so role/permission edits take effect on the very next request. Superadmin bypasses all checks (`utils.IsSuperadmin`, also re-checked fresh from DB per request via a join, not cached in the session token).
- **Privilege-change session invalidation**: when a user's `role_id` or `status` changes (`modules/users/service.go`, `Update`/`UpdateStatus`), all of that user's sessions are force-invalidated (Redis + DB) via `Service.invalidateSessions`. Deliberate — a suspended/demoted user should be kicked out immediately, not just blocked on their next permission check. `ResetPassword` also calls `session.DeleteAllForUser`; `ChangePassword` (self-service) does **not** — other sessions stay alive after a normal password change.
- Password policy (`auth/password.go`): min 8 chars + uppercase + number + symbol. bcrypt cost 12. `ChangePassword` blocks reuse of the current password or any of the last 5 (`PasswordHistory` table). `ForgotPassword`/`ResetPassword` are fully implemented backend-side (token in `PasswordResetToken`, 1h expiry) but **email is never actually sent** — it's logged to stdout as a stub. The frontend UI for forgot/reset password was deliberately removed (no `/forgot-password` or `/reset-password` route in `router/index.jsx`), but the endpoints are still mounted and reachable directly (`POST /auth/forgot-password`, `/reset-password`, `PUT /auth/change-password`) if you need to build a UI back on top of them.
- Login has two independent rate-limit layers (`middleware/rate_limit.go`): a generic fixed-window `RateLimit` (per `RATE_LIMIT_LOGIN`/min) and a separate `LoginLockout` counter that locks an IP out entirely for `RATE_LIMIT_LOGIN_LOCKOUT_MINUTES` after repeated failures within 1 minute.

### Roles & permissions

- `Permission{RoleID, MenuID, CanView/CanCreate/CanEdit/CanDelete}` is the join table between roles and menus — no separate "actions" table, the 4 booleans are hardcoded columns.
- Permission matrix save (`PUT /roles/:uuid/permissions`) does a manual find-then-create-or-update per row (not a real DB upsert), and **silently ignores per-row errors** (`_ = s.repo.UpsertPermission(...)`) — if you're debugging a permission that "didn't save", check there first.
- `GET /roles/:uuid/permissions` only returns rows that exist in the DB (not every menu) — the frontend (`RolePermissions.jsx`) merges this against the full menu tree and defaults missing entries to `false`. The save is a **full matrix replace**, not per-cell PATCH.
- Superadmin role protection: can't be demoted, deleted, or have its permissions edited (`hasSuperadminRole` checks — preserve these when touching `users`/`roles` services). A role also can't be deleted while any user still has it assigned (`ErrRoleInUse`).

### Menus & menu sections

- `Menu.MenuSectionID` links to `MenuSection`; `Menu.MenuSectionUUID` is a transient (`gorm:"-"`) field populated in service code for API responses, not persisted.
- Sidebar/admin tree building (`menus/service.go` `Tree`) buckets menus under their section; any menu whose section no longer matches a listed section gets collected into a synthetic `"Uncategorized"` group (not a real DB section).
- `GET /menus` is gated only by session auth, **not** the `menus:view` permission — every authenticated user needs it to build the sidebar; per-item visibility is filtered client-side by permission. Write operations (create/edit/delete/reorder) *are* permission-guarded.
- Reordering (`PUT /menus/reorder`, `/menu-sections/reorder`) is a simple per-item `{uuid, order}` update loop, not atomic — the frontend does adjacent-swap reordering (Up/Down buttons), not drag-and-drop.

### Activity logs

- `LogActivity(...)` (`activity_logs/logger.go`) is **async** — pushes onto a buffered channel (cap 1000) drained by a background goroutine started at boot (`main.go`, `StartWorker(db)`). If the channel is full, the entry is dropped (never blocks the caller); if the worker was never started, it's a silent no-op.
- Nothing is auto-logged — every module calls `LogActivity` manually at the relevant point (login/logout, CRUD mutations). There's no gorm hook or middleware doing this centrally, so a new mutating endpoint needs its own explicit call if it should be audited.
- Mutating service methods that log activity typically return `(before, after, error)` so the handler can log a before/after diff — follow this shape (see `users.Service.Update`).
- `DELETE /activity-logs/cleanup` hard-deletes (`Unscoped()`) rows older than `LOG_CLEANUP_DAYS` — not soft-deleted, this model has no `DeletedAt` at all (append-only log). **Not scheduled** — it's a manual/on-demand endpoint; there's no cron wired up yet.

### Settings

Generic key-value table (`modules/settings`) — adding a new setting is just a new key in the DB, no migration needed. `GET /settings` requires an authenticated session; `GET /settings/public` is **unauthenticated** and returns only a whitelisted subset (`app_name`, `app_logo`, `app_favicon`, `primary_color`) for the login page and anywhere else pre-auth. `settings:maintenance_mode` is cached in Redis for 60s (`middleware/maintenance.go`) with DB fallback on cache miss — checked on every request, 503s everyone except superadmins.

### Middleware inventory (`backend/middleware/`)

- `session_auth.go` — Redis session check, attaches user/superadmin/token to Gin context.
- `permission.go` — `RequirePermission` (the `guard()` used everywhere).
- `rate_limit.go` — generic `RateLimit` (fixed-window Redis counter) + `LoginLockout`/`RegisterLoginFailure`/`ClearLoginFailures`.
- `security.go` — `CORSMiddleware` (single-origin whitelist via `FRONTEND_URL`), `SecurityHeaders` (CSP + X-Frame-Options + X-Content-Type-Options + HSTS + Referrer-Policy; CSP has a relaxed variant scoped to `/swagger` for swagger-ui's inline scripts), `RequestSizeLimit`.
- `csrf.go` — double-submit-cookie: issues a non-httpOnly `csrf_token` cookie, requires header `X-CSRF-Token` to match on any non-safe method (403 otherwise).
- `maintenance.go` — `MaintenanceMode`, see Settings above.
- `frontend/nginx.conf` sets the *real* production CSP for the SPA HTML (more critical than the backend's, since that's what a browser actually executes for the app itself).

### Config & env

`config/config.go` reads `.env` (via `godotenv`) into a `Config` struct. **Every field is read somewhere in the codebase** — this was audited and dead fields (`APP_SECRET`, `APP_NAME`, `SESSION_SECRET`, `STORAGE_DRIVER`, `MAIL_*`) were removed. Don't add a new env var without wiring it to actual behavior, and don't leave unused ones around. App name/branding now lives in the DB (`settings` table), not env.

**Known gap**: Redis has no password in `docker-compose.yml` (no `--requirepass`) and `REDIS_PASS` is empty in `.env.example`. Fine for isolated local dev; flag it before any shared/production deployment (Redis holds session tokens — unauthenticated access = session hijack).

### Database

Migrations (`database/migrations/migrate.go`) run `AutoMigrate` over: `users.User`, `roles.Role`, `users.Session` (DB mirror, see Auth section), `users.PasswordResetToken`, `users.PasswordHistory`, `menu_sections.MenuSection`, `menus.Menu`, `permissions.Permission`, `settings.Setting`, `activity_logs.ActivityLog` — then replaces GORM's plain unique indexes on `users.email`/`roles.name` with **partial** unique indexes (`WHERE deleted_at IS NULL`) so soft-deleted rows don't block reusing an email/name. Idempotent, safe to re-run.

Seeder (`database/seeders/seed.go`) is idempotent (`FirstOrCreate` throughout): superadmin role → superadmin user (`admin@example.com` / `Admin@12345`, only if absent) → default menus (3 sections: Dashboard, User Management, System) → full CRUD permissions for superadmin on every seeded menu → default settings (`app_name="BaseAdmin"`, empty logo/favicon, `maintenance_mode="false"`).

## Frontend architecture

- **Toolbar pattern**: every list/detail page renders its title + actions (Add New, Filter, Others/export, Back, etc.) through `components/ui/Menubar.jsx` (`Menubar`, `MenubarLabel`, `MenubarSeparator`, `MenubarAction`, `MenubarMenu`, `MenubarItem`) registered into the Navbar via the `usePageActions(node)` hook (backed by `store/pageActionsStore.js`). **Don't put page titles/actions in the page body** — always go through this pattern; `pages/users/Users.jsx` is the reference implementation (title, Add New, a Filter dropdown with Apply/Reset, an Others export menu).
- `MenubarMenu` dropdown panels render via a **React portal to `document.body`**, not inline `absolute` positioning — the Menubar row uses `overflow-x-auto` for small screens, and CSS forces `overflow-y` to clip too once one axis is scrolled, which would invisibly clip an inline-positioned dropdown. Reuse this portal pattern for any new dropdown near a scrolling container.
- **Base/primary color** is runtime-configurable (Settings → Appearance), not a compile-time Tailwind hex. `tailwind.config.js`'s `primary`/`sidebar.active` colors resolve to `rgb(var(--color-primary-rgb) / <alpha-value>)`, a CSS custom property set on `<html>` at runtime (`utils/color.js` `applyPrimaryColor`, wired through `store/settingsStore.js`, which fetches from the public settings endpoint so it works pre-login). This is what makes `bg-primary/10`-style opacity modifiers work — don't reintroduce a hardcoded hex for primary/sidebar-active.
- **Modals** (`components/ui/Modal.jsx`) close on backdrop click (`stopPropagation` on the inner box) — shared by every modal (`ConfirmDialog`, all `*FormModal`s), so fix backdrop/overlay behavior once, centrally.
- All list pages use `components/ui/Table.jsx` for search/sort/pagination — the search box lives inside the table's own header row, not the page toolbar.
- Permissions: `usePermission()` (`hooks/usePermission.js`) exposes `{canView, canCreate, canEdit, canDelete}`, reading `permissions`/`user` from `authStore` (populated from `GET /auth/me`). Superadmin short-circuits to `true` for everything; otherwise matches on menu `path` with leading `/` stripped. `ProtectedRoute` (`router/ProtectedRoute.jsx`) is a client-side gate only (redirects to `/login` or `/403`) — actual authorization is always enforced server-side by `RequirePermission`, never trust the frontend check alone when adding a new protected action.
- Routing (`router/index.jsx`): flat route tree, no code-splitting/lazy-loading yet (frontend bundle is a single ~1.2MB chunk — worth `React.lazy` as the app grows). Each management page is individually wrapped in its own `<ProtectedRoute menuKey="...">` rather than gating at a layout/group level.
- State: Zustand stores in `store/` — `authStore` (current user + permissions), `settingsStore` (branding, via the public endpoint), `sidebarStore` (starts collapsed on mobile via a `window.innerWidth` check at store-init time, not a mount effect), `pageActionsStore` (toolbar registration, see above).
- Toasts: `react-hot-toast`, configured in `main.jsx` — `bottom-right`, solid colored blocks per type (not thin border accents), loading toast uses the dynamic primary color CSS var.
- Dashboard (`pages/dashboard/Dashboard.jsx`) is currently an intentionally empty placeholder (`<div className="space-y-6" />`) — the stat cards/recent-activity table that used to live there were removed.

## Testing

Frontend: Vitest, 3 files total (`utils/validation.test.js`, `utils/cn.test.js`, `components/ui/Button.test.jsx`) — minimal coverage, no integration/e2e. Run with `npm test` in `frontend/`.

Backend: **zero test files exist**. If asked to add backend tests, there's no existing convention to follow — establish one (likely table-driven `_test.go` next to the file under test, matching Go norms) rather than assuming a pattern.

## Docker

`docker-compose.yml`: `postgres` (15-alpine, host port 5433), `redis` (7-alpine, host port 6379, **no password**), `backend` (build `./backend`, port 8500, `.env` + compose-level overrides for `DB_HOST`/`REDIS_HOST`/`FRONTEND_URL` since those need Docker network hostnames), `frontend` (build `./frontend`, port 8501, nginx-served build).

`backend/Dockerfile`: multi-stage — `golang:1.26-alpine` builder runs `swag init` (regenerates `docs/`, gitignored) before compiling a static (`CGO_ENABLED=0`) binary, copied into a slim `alpine:3.20` runtime with `ca-certificates`. Also copies the `storage/` directory into the image, but **uploads aren't a mounted volume** in compose — avatar/logo/favicon uploads are lost on container rebuild unless you add one.

`frontend/Dockerfile`: `node:20-alpine` build stage (`npm install && npm run build`) → served by `nginx:1.27-alpine`, custom `nginx.conf` (SPA fallback + the production CSP/security headers mentioned above).

## Conventions

- No comments explaining *what* code does — only *why*, when it's a non-obvious constraint (see `session/session.go`, `Menubar.jsx` for calibration).
- Don't add a Dockerfile/env var/config knob without actually wiring it to behavior — this codebase had several dead ones cleaned up already.
- Service methods that mutate + should be audited return `(before, after, error)` so the caller can log a diff via `LogActivity` — match this shape for new mutating endpoints.
- Run `go build ./...` / `npm run build` after backend/frontend changes respectively before considering a change complete.
