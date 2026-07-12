# BaseAdmin

Full-stack admin panel base project — Go (Gin + GORM) backend, React (Vite) frontend, Redis-backed sessions, PostgreSQL by default (MySQL-switchable).

## Prerequisites

- Go 1.21+
- Node.js 20+
- PostgreSQL 15 or MySQL 8 (or use Docker)
- Redis 7 (or use Docker)
- Docker + Docker Compose (optional, recommended for local dev)

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec backend ./baseadmin migrate
docker compose exec backend ./baseadmin seed
```

- Backend: http://localhost:8500
- Frontend: http://localhost:8501
- Default login: `admin@example.com` / `Admin@12345`

## Manual setup

### Backend

```bash
cd backend
cp .env.example .env   # edit DB/Redis credentials as needed
go run main.go migrate
go run main.go seed
go run main.go          # starts server on APP_PORT (default 8500)
```

### Frontend

```bash
cd frontend
cp .env.example .env   # set VITE_API_URL if backend isn't on localhost:8500
npm install
npm run dev             # dev server on :5173 by default
npm run build            # production build → dist/
```

## Switching database: PostgreSQL → MySQL

Edit `backend/.env`:

```
DB_DRIVER=mysql   # was: postgres
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=password
DB_NAME=baseadmin
```

No code changes required — `config/database.go` selects the GORM dialector from `DB_DRIVER`. Re-run `go run main.go migrate` against the new database.

## Environment config

See `backend/.env.example` for the full list (app, DB, Redis, session, storage, mail, rate limiting).

## Folder structure

```
/
├── backend/
│   ├── main.go              # entrypoint; supports `migrate` and `seed` subcommands
│   ├── config/               # env loading, DB dialector, Redis client
│   ├── database/
│   │   ├── migrations/       # GORM AutoMigrate runner
│   │   └── seeders/          # default roles/users/menus/settings
│   ├── middleware/            # CORS, security headers, rate limit, CSRF, session auth, permission guard, etc.
│   ├── modules/                # auth, users, roles, menus, menu_sections, permissions, settings, activity_logs
│   ├── session/                # Redis session store
│   ├── storage/                # StorageInterface + local disk implementation
│   └── utils/                   # shared model helpers
└── frontend/
    └── src/
        ├── api/                # axios client + per-resource wrappers
        ├── components/         # ui/ (Button, Table, Modal, ...) and layout/ (Sidebar, Navbar)
        ├── hooks/               # usePermission, useDarkMode
        ├── pages/                # auth, dashboard, users, menus, menu_sections, roles, settings, activity_logs
        ├── router/               # route guards
        └── store/                # Zustand: authStore, settingsStore, sidebarStore
```

## API docs

Swagger doc-comment annotations are present on `main.go` handlers. Generate the UI with:

```bash
cd backend
go install github.com/swaggo/swag/cmd/swag@latest
swag init -g main.go
```

Then serve at `/api/v1/docs` (wire-up TODO — see below).

## Known TODOs

- Email sending (forgot-password) is currently stubbed to a log line — wire real SMTP via `MAIL_*` env vars.
- `LOG_CLEANUP_DAYS` cleanup is exposed as `DELETE /activity-logs/cleanup` but not auto-scheduled; add a cron trigger for nightly cleanup.
- Swagger UI generation (`swag init`) hasn't been run — annotations are in place, generation is a one-command follow-up.
- Only local file storage is implemented; `StorageInterface` is ready for an S3 driver if needed later.
- Frontend bundle is a single ~1.2MB chunk — consider route-based code-splitting (`React.lazy`) as the app grows.

## Default credentials

```
Email:    admin@example.com
Password: Admin@12345
```

Change this immediately in any non-local environment.
