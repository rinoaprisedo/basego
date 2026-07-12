package roles

import "baseadmin/backend/utils"

type Role struct {
	utils.AuditModel
	Name         string `gorm:"type:varchar(255);uniqueIndex;not null" json:"name"`
	Description  string `gorm:"type:text" json:"description"`
	IsSuperadmin bool   `gorm:"default:false" json:"is_superadmin"`
}

func (Role) TableName() string { return "roles" }

type UserRole struct {
	UserID uint64 `gorm:"primaryKey"`
	RoleID uint64 `gorm:"primaryKey"`
}

func (UserRole) TableName() string { return "user_roles" }
