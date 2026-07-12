package roles

import (
	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/permissions"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	DB *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{DB: db}
}

func (h *Handler) List(c *gin.Context) {
	p := utils.GetPagination(c, "created_at")
	q := h.DB.Model(&Role{})
	if p.Search != "" {
		q = q.Where("name ILIKE ?", "%"+p.Search+"%")
	}
	var total int64
	q.Count(&total)

	var list []Role
	q.Order(p.SortBy + " " + p.SortDir).Offset(p.Offset).Limit(p.Limit).Find(&list)
	utils.SuccessList(c, "ok", list, utils.BuildMeta(p.Page, p.Limit, total))
}

func (h *Handler) Get(c *gin.Context) {
	var role Role
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&role).Error; err != nil {
		utils.Error(c, 404, "role not found")
		return
	}
	var perms []permissions.Permission
	h.DB.Where("role_id = ?", role.ID).Find(&perms)
	utils.Success(c, 200, "ok", gin.H{"role": role, "permissions": perms})
}

type roleRequest struct {
	Name         string `json:"name" binding:"required"`
	Description  string `json:"description"`
	IsSuperadmin bool   `json:"is_superadmin"`
}

func (h *Handler) Create(c *gin.Context) {
	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	role := Role{Name: req.Name, Description: req.Description, IsSuperadmin: req.IsSuperadmin}
	actorID := utils.CurrentUserID(c)
	role.CreatedBy = actorID
	if err := h.DB.Create(&role).Error; err != nil {
		utils.Error(c, 400, "failed to create role (name may already be in use)")
		return
	}
	activity_logs.LogActivity(actorID, activity_logs.ActionCreate, "roles", role.UUID.String(), nil, role, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, "role created", role)
}

func (h *Handler) Update(c *gin.Context) {
	var role Role
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&role).Error; err != nil {
		utils.Error(c, 404, "role not found")
		return
	}
	oldValue := role

	var req roleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	if role.IsSuperadmin && !req.IsSuperadmin {
		utils.Error(c, 403, "superadmin role cannot be demoted")
		return
	}
	role.Name = req.Name
	role.Description = req.Description

	actorID := utils.CurrentUserID(c)
	role.UpdatedBy = actorID
	if err := h.DB.Save(&role).Error; err != nil {
		utils.Error(c, 400, "failed to update role")
		return
	}
	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "roles", role.UUID.String(), oldValue, role, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "role updated", role)
}

func (h *Handler) Delete(c *gin.Context) {
	var role Role
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&role).Error; err != nil {
		utils.Error(c, 404, "role not found")
		return
	}
	if role.IsSuperadmin {
		utils.Error(c, 403, "superadmin role cannot be deleted")
		return
	}
	actorID := utils.CurrentUserID(c)
	if actorID != nil {
		h.DB.Model(&role).Update("deleted_by", actorID)
	}
	if err := h.DB.Delete(&role).Error; err != nil {
		utils.Error(c, 500, "failed to delete role")
		return
	}
	activity_logs.LogActivity(actorID, activity_logs.ActionDelete, "roles", role.UUID.String(), role, nil, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "role deleted", nil)
}

func (h *Handler) GetPermissions(c *gin.Context) {
	var role Role
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&role).Error; err != nil {
		utils.Error(c, 404, "role not found")
		return
	}
	var perms []permissions.Permission
	h.DB.Where("role_id = ?", role.ID).Find(&perms)
	utils.Success(c, 200, "ok", perms)
}

type permissionUpdate struct {
	MenuUUID  string `json:"menu_uuid" binding:"required"`
	CanView   bool   `json:"can_view"`
	CanCreate bool   `json:"can_create"`
	CanEdit   bool   `json:"can_edit"`
	CanDelete bool   `json:"can_delete"`
}

type updatePermissionsRequest struct {
	Permissions []permissionUpdate `json:"permissions" binding:"required"`
}

func (h *Handler) UpdatePermissions(c *gin.Context) {
	var role Role
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&role).Error; err != nil {
		utils.Error(c, 404, "role not found")
		return
	}
	var req updatePermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}

	for _, item := range req.Permissions {
		var menuID uint64
		row := h.DB.Table("menus").Select("id").Where("uuid = ?", item.MenuUUID).Row()
		if err := row.Scan(&menuID); err != nil {
			continue
		}
		var perm permissions.Permission
		result := h.DB.Where("role_id = ? AND menu_id = ?", role.ID, menuID).First(&perm)
		perm.RoleID = role.ID
		perm.MenuID = menuID
		perm.CanView = item.CanView
		perm.CanCreate = item.CanCreate
		perm.CanEdit = item.CanEdit
		perm.CanDelete = item.CanDelete
		if result.Error != nil {
			h.DB.Create(&perm)
		} else {
			h.DB.Save(&perm)
		}
	}

	actorID := utils.CurrentUserID(c)
	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "role_permissions", role.UUID.String(), nil, req.Permissions, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "permissions updated", nil)
}
