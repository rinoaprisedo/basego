package seeders

import (
	"log"

	"baseadmin/backend/modules/menu_sections"
	"baseadmin/backend/modules/menus"
	"baseadmin/backend/modules/permissions"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/modules/settings"
	"baseadmin/backend/modules/users"

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
	db.Where("name = ?", "Superadmin").FirstOrCreate(&role, roles.Role{
		Name:         "Superadmin",
		Description:  "Full system access. Cannot be deleted or demoted.",
		IsSuperadmin: true,
	})
	return role
}

func seedSuperadminUser(db *gorm.DB, role roles.Role) {
	var user users.User
	result := db.Where("email = ?", "admin@example.com").First(&user)
	if result.Error == nil {
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte("Admin@12345"), 12)
	if err != nil {
		log.Fatalf("failed to hash superadmin password: %v", err)
	}
	user = users.User{
		Name:     "Super Admin",
		Email:    "admin@example.com",
		Password: string(hashed),
		Status:   users.StatusActive,
	}
	if err := db.Create(&user).Error; err != nil {
		log.Fatalf("failed to seed superadmin user: %v", err)
	}
	db.Create(&roles.UserRole{UserID: user.ID, RoleID: role.ID})
}

type menuDef struct {
	Name string
	Icon string
	Path string
}

func seedMenus(db *gorm.DB) []uint64 {
	sections := []struct {
		Section menu_sections.MenuSection
		Menus   []menuDef
	}{
		{
			Section: menu_sections.MenuSection{Name: "Dashboard", Icon: "layout-dashboard", Order: 1},
			Menus: []menuDef{
				{Name: "Dashboard", Icon: "layout-dashboard", Path: "/"},
			},
		},
		{
			Section: menu_sections.MenuSection{Name: "User Management", Icon: "users", Order: 2},
			Menus: []menuDef{
				{Name: "Users", Icon: "user", Path: "users"},
				{Name: "Roles", Icon: "shield", Path: "roles"},
			},
		},
		{
			Section: menu_sections.MenuSection{Name: "System", Icon: "settings", Order: 3},
			Menus: []menuDef{
				{Name: "Menus", Icon: "menu", Path: "menus"},
				{Name: "Menu Sections", Icon: "folder-tree", Path: "menu-sections"},
				{Name: "Settings", Icon: "settings", Path: "settings"},
				{Name: "Activity Logs", Icon: "history", Path: "activity-logs"},
			},
		},
	}

	var menuIDs []uint64
	for _, s := range sections {
		var section menu_sections.MenuSection
		db.Where("name = ?", s.Section.Name).FirstOrCreate(&section, s.Section)

		for i, m := range s.Menus {
			var menu menus.Menu
			db.Where("path = ?", m.Path).FirstOrCreate(&menu, menus.Menu{
				MenuSectionID: section.ID,
				Name:          m.Name,
				Icon:          m.Icon,
				Path:          m.Path,
				Order:         i + 1,
				IsActive:      true,
			})
			menuIDs = append(menuIDs, menu.ID)
		}
	}
	return menuIDs
}

func seedPermissions(db *gorm.DB, roleID uint64, menuIDs []uint64) {
	for _, menuID := range menuIDs {
		var perm permissions.Permission
		db.Where("role_id = ? AND menu_id = ?", roleID, menuID).FirstOrCreate(&perm, permissions.Permission{
			RoleID:    roleID,
			MenuID:    menuID,
			CanView:   true,
			CanCreate: true,
			CanEdit:   true,
			CanDelete: true,
		})
	}
}

func seedSettings(db *gorm.DB) {
	defaults := map[string]settings.SettingType{
		"app_name":         settings.TypeString,
		"app_logo":         settings.TypeFile,
		"app_favicon":      settings.TypeFile,
		"maintenance_mode": settings.TypeBoolean,
	}
	values := map[string]string{
		"app_name":         "BaseAdmin",
		"app_logo":         "",
		"app_favicon":      "",
		"maintenance_mode": "false",
	}
	for key, t := range defaults {
		var s settings.Setting
		db.Where("key = ?", key).FirstOrCreate(&s, settings.Setting{Key: key, Value: values[key], Type: t})
	}
}
