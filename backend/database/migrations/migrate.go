package migrations

import (
	"log"

	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/menu_sections"
	"baseadmin/backend/modules/menus"
	"baseadmin/backend/modules/permissions"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/modules/settings"
	"baseadmin/backend/modules/users"

	"gorm.io/gorm"
)

// Run applies GORM AutoMigrate across every model in the project.
func Run(db *gorm.DB) {
	err := db.AutoMigrate(
		&users.User{},
		&roles.Role{},
		&roles.UserRole{},
		&users.Session{},
		&users.PasswordResetToken{},
		&users.PasswordHistory{},
		&menu_sections.MenuSection{},
		&menus.Menu{},
		&permissions.Permission{},
		&settings.Setting{},
		&activity_logs.ActivityLog{},
	)
	if err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	log.Println("migrations applied successfully")
}
