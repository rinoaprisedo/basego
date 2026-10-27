package seeders

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"

	"baseadmin/backend/modules/menus"
	"baseadmin/backend/modules/permissions"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/modules/settings"
	"baseadmin/backend/modules/users"
	"baseadmin/backend/utils"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Run seeds the superadmin role/user, default menu structure, permissions,
// and default settings. Safe to re-run (idempotent via FirstOrCreate).
func Run(db *gorm.DB) {
	superadminRole := seedSuperadminRole(db)
	seedSuperadminUser(db, superadminRole)
	menuIDs := seedMenus(db)
	seedPermissions(db, superadminRole.ID, menuIDs)
	seedSettings(db)
	log.Println("seed completed successfully")
}

func seedSuperadminRole(db *gorm.DB) roles.Role {
	var role roles.Role
	db.Where("name = ?", "Superadmin").Attrs(roles.Role{
		Name:         "Superadmin",
		Description:  "Full system access. Cannot be deleted or demoted.",
		IsSuperadmin: true,
	}).FirstOrCreate(&role)
	return role
}

func seedSuperadminUser(db *gorm.DB, role roles.Role) {
	var user users.User
	result := db.Where("email = ?", "admin@example.com").First(&user)
	if result.Error == nil {
		return
	}
	// No hardcoded default credential: a public boilerplate with a known
	// superadmin password is a backdoor on every deployment that forgets to
	// change it. Use SEED_ADMIN_PASSWORD, or a random one printed exactly once.
	password := os.Getenv("SEED_ADMIN_PASSWORD")
	generated := false
	if password == "" {
		password = generatePassword()
		generated = true
	} else if err := utils.ValidatePasswordPolicy(password); err != nil {
		log.Fatalf("SEED_ADMIN_PASSWORD rejected: %v", err)
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Fatalf("failed to hash superadmin password: %v", err)
	}
	user = users.User{
		Name:     "Super Admin",
		Email:    "admin@example.com",
		Password: string(hashed),
		Status:   users.StatusActive,
		RoleID:   &role.ID,
	}
	if err := db.Create(&user).Error; err != nil {
		log.Fatalf("failed to seed superadmin user: %v", err)
	}
	if generated {
		log.Printf("seeded superadmin %s with generated password: %s (shown once — change it after first login)", user.Email, password)
	}
}

// generatePassword returns a random password that satisfies the policy
// (upper, digit, symbol, 24 chars).
func generatePassword() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("failed to generate password: %v", err)
	}
	return "Aa1!" + hex.EncodeToString(b)[:20]
}

type menuDef struct {
	Name string
	Icon string
	Path string
}

func seedMenus(db *gorm.DB) []uint64 {
	removeMergedMenus(db)
	sections := []struct {
		Section menus.MenuSection
		Menus   []menuDef
	}{
		{
			Section: menus.MenuSection{Name: "Dashboard", Icon: "LayoutDashboard", Order: 1},
			Menus: []menuDef{
				{Name: "Dashboard", Icon: "LayoutDashboard", Path: "/"},
			},
		},
		{
			Section: menus.MenuSection{Name: "User Management", Icon: "Users", Order: 2},
			Menus: []menuDef{
				{Name: "Users", Icon: "User", Path: "users"},
				{Name: "Roles", Icon: "Shield", Path: "roles"},
			},
		},
		{
			Section: menus.MenuSection{Name: "System", Icon: "Settings", Order: 3},
			Menus: []menuDef{
				{Name: "Menus", Icon: "Menu", Path: "menus"},
				{Name: "Settings", Icon: "Settings", Path: "settings"},
				{Name: "Activity Logs", Icon: "History", Path: "activity-logs"},
			},
		},
		{
			Section: menus.MenuSection{Name: "Development", Icon: "Code", Order: 4},
			Menus: []menuDef{
				{Name: "Tiket", Icon: "Ticket", Path: "dev-tickets"},
			},
		},
	}

	var menuIDs []uint64
	for _, s := range sections {
		var section menus.MenuSection
		db.Where("name = ?", s.Section.Name).Attrs(s.Section).FirstOrCreate(&section)

		for i, m := range s.Menus {
			var menu menus.Menu
			db.Where("path = ?", m.Path).Attrs(menus.Menu{
				MenuSectionID: section.ID,
				Name:          m.Name,
				Icon:          m.Icon,
				Path:          m.Path,
				Order:         i + 1,
				IsActive:      true,
			}).FirstOrCreate(&menu)
			menuIDs = append(menuIDs, menu.ID)
		}
	}
	return menuIDs
}

func seedPermissions(db *gorm.DB, roleID uint64, menuIDs []uint64) {
	for _, menuID := range menuIDs {
		var perm permissions.Permission
		db.Where("role_id = ? AND menu_id = ?", roleID, menuID).Attrs(permissions.Permission{
			RoleID:    roleID,
			MenuID:    menuID,
			CanView:   true,
			CanCreate: true,
			CanEdit:   true,
			CanDelete: true,
		}).FirstOrCreate(&perm)
	}
}

func seedSettings(db *gorm.DB) {
	defaults := map[string]settings.SettingType{
		"app_name":         settings.TypeString,
		"app_logo":         settings.TypeFile,
		"app_favicon":      settings.TypeFile,
		"primary_color":    settings.TypeString,
		"maintenance_mode": settings.TypeBoolean,
	}
	values := map[string]string{
		"app_name":         "BaseProject",
		"app_logo":         "",
		"app_favicon":      "",
		"primary_color":    "#35494d",
		"maintenance_mode": "false",
	}
	for key, t := range defaults {
		var s settings.Setting
		db.Where("key = ?", key).Attrs(settings.Setting{Key: key, Value: values[key], Type: t}).FirstOrCreate(&s)
	}
}

// removeMergedMenus drops the standalone "menu-sections" menu (its screen is
// now a tab of Menus) together with the permission rows that pointed at it.
func removeMergedMenus(db *gorm.DB) {
	var old menus.Menu
	if db.Where("path = ?", "menu-sections").First(&old).Error != nil {
		return
	}
	db.Unscoped().Where("menu_id = ?", old.ID).Delete(&permissions.Permission{})
	db.Delete(&old)
}
