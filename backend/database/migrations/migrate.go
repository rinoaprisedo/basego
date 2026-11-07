package migrations

import (
	"log"

	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/dev_tickets"
	"baseadmin/backend/modules/menus"
	"baseadmin/backend/modules/permissions"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/modules/settings"
	"baseadmin/backend/modules/users"

	"gorm.io/gorm"
)

// Run applies GORM AutoMigrate across every model in the project.
func Run(db *gorm.DB) {
	migrateTicketStatus(db)
	err := db.AutoMigrate(
		&users.User{},
		&roles.Role{},
		&users.Session{},
		&users.PasswordResetToken{},
		&users.PasswordHistory{},
		&menus.MenuSection{},
		&menus.Menu{},
		&permissions.Permission{},
		&settings.Setting{},
		&activity_logs.ActivityLog{},
		&dev_tickets.Ticket{},
		&dev_tickets.Comment{},
		&dev_tickets.APIToken{},
	)
	if err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	applyPartialUniqueIndexes(db)
	applyPerformanceIndexes(db)

	log.Println("migrations applied successfully")
}

// applyPartialUniqueIndexes enforces uniqueness only among non-deleted rows.
// GORM's `uniqueIndex` tag creates a plain unique index that also covers
// soft-deleted rows, which would permanently block re-using an email/name
// after the row holding it is deleted. Idempotent: safe to run on every
// migrate.
func applyPartialUniqueIndexes(db *gorm.DB) {
	statements := []string{
		`DROP INDEX IF EXISTS idx_users_email`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users (email) WHERE deleted_at IS NULL`,
		`DROP INDEX IF EXISTS idx_roles_name`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_active ON roles (name) WHERE deleted_at IS NULL`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			log.Fatalf("failed to apply partial unique index (%s): %v", stmt, err)
		}
	}
}

// applyPerformanceIndexes adds the indexes the list endpoints rely on. Found
// by load test: without them users/activity-log lists do a Seq Scan + sort of
// the whole table on every request, so latency grows with row count.
// Idempotent. Postgres-only features (partial/DESC/trigram) are skipped on
// other drivers rather than failing the migration.
func applyPerformanceIndexes(db *gorm.DB) {
	if db.Dialector.Name() != "postgres" {
		return
	}
	statements := []string{
		// Default list order is created_at DESC over non-deleted rows.
		`CREATE INDEX IF NOT EXISTS idx_users_created_at_active ON users (created_at DESC) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_logs_module_action ON activity_logs (module, action)`,
		// Permission lookup on every guarded request.
		`CREATE INDEX IF NOT EXISTS idx_permissions_role_menu ON permissions (role_id, menu_id)`,
		`CREATE INDEX IF NOT EXISTS idx_menus_path ON menus (path) WHERE deleted_at IS NULL`,
	}
	for _, stmt := range statements {
		if err := db.Exec(stmt).Error; err != nil {
			log.Fatalf("failed to apply index (%s): %v", stmt, err)
		}
	}
	// Trigram indexes make `ILIKE '%term%'` searches indexable. The extension
	// needs privileges; if the DB user lacks them, warn and carry on (search
	// stays correct, just slower).
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).Error; err != nil {
		log.Printf("warning: pg_trgm unavailable, user search stays unindexed: %v", err)
		return
	}
	for _, stmt := range []string{
		`CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING gin (name gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON users USING gin (email gin_trgm_ops)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_logs_ip_trgm ON activity_logs USING gin (ip_address gin_trgm_ops)`,
	} {
		if err := db.Exec(stmt).Error; err != nil {
			log.Printf("warning: trigram index failed (%s): %v", stmt, err)
		}
	}
}

// migrateTicketStatus folds the legacy qc_status + dev_status columns of
// dev_tickets into the single `status` column and drops them. Runs before
// AutoMigrate (which would otherwise try to add a NOT NULL column to rows
// that already exist). Idempotent: does nothing once dev_status is gone.
func migrateTicketStatus(db *gorm.DB) {
	m := db.Migrator()
	if !m.HasTable("dev_tickets") || !m.HasColumn("dev_tickets", "dev_status") {
		return
	}
	steps := []string{
		`ALTER TABLE dev_tickets ADD COLUMN IF NOT EXISTS status varchar(20)`,
		`UPDATE dev_tickets SET status = CASE
			WHEN qc_status = 'Closed' OR dev_status = 'wont_fix' THEN 'closed'
			WHEN qc_status = 'Reopen' AND dev_status IN ('todo', 'done', 'done_by_claude') THEN 'reopen'
			WHEN dev_status = 'in_progress' THEN 'in_progress'
			WHEN dev_status = 'need_info' THEN 'need_info'
			WHEN dev_status = 'done_by_claude' THEN 'done_dev'
			WHEN dev_status = 'done' THEN 'deployed'
			ELSE 'open' END
			WHERE status IS NULL`,
		`ALTER TABLE dev_tickets ALTER COLUMN status SET NOT NULL`,
		`ALTER TABLE dev_tickets DROP COLUMN qc_status`,
		`ALTER TABLE dev_tickets DROP COLUMN dev_status`,
	}
	for _, stmt := range steps {
		if err := db.Exec(stmt).Error; err != nil {
			log.Fatalf("ticket status migration failed (%s): %v", stmt, err)
		}
	}
	log.Println("dev_tickets: merged qc_status + dev_status into status")
}
