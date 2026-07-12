package users

import (
	"time"

	"baseadmin/backend/config"
	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Handler struct {
	DB      *gorm.DB
	Cfg     *config.Config
	Storage storage.StorageInterface
}

func NewHandler(db *gorm.DB, cfg *config.Config, s storage.StorageInterface) *Handler {
	return &Handler{DB: db, Cfg: cfg, Storage: s}
}

func (h *Handler) List(c *gin.Context) {
	p := utils.GetPagination(c, "created_at")
	q := h.DB.Model(&User{}).Preload("Roles")

	if p.Search != "" {
		like := "%" + p.Search + "%"
		q = q.Where("name ILIKE ? OR email ILIKE ?", like, like)
	}
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if roleUUID := c.Query("role"); roleUUID != "" {
		q = q.Joins("JOIN user_roles ON user_roles.user_id = users.id").
			Joins("JOIN roles ON roles.id = user_roles.role_id").
			Where("roles.uuid = ?", roleUUID)
	}

	var total int64
	q.Count(&total)

	var list []User
	if err := q.Order(p.SortBy + " " + p.SortDir).Offset(p.Offset).Limit(p.Limit).Find(&list).Error; err != nil {
		utils.Error(c, 500, "failed to fetch users")
		return
	}

	utils.SuccessList(c, "ok", list, utils.BuildMeta(p.Page, p.Limit, total))
}

func (h *Handler) Get(c *gin.Context) {
	var user User
	if err := h.DB.Preload("Roles").Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	utils.Success(c, 200, "ok", user)
}

type createRequest struct {
	Name      string   `json:"name" binding:"required"`
	Email     string   `json:"email" binding:"required,email"`
	Password  string   `json:"password" binding:"required"`
	Status    string   `json:"status"`
	RoleUUIDs []string `json:"role_uuids"`
}

func (h *Handler) Create(c *gin.Context) {
	var req createRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		utils.Error(c, 500, "failed to hash password")
		return
	}

	status := StatusActive
	if req.Status != "" {
		status = UserStatus(req.Status)
	}

	user := User{
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashed),
		Status:   status,
	}

	actorID := utils.CurrentUserID(c)
	user.CreatedBy = actorID

	if err := h.DB.Create(&user).Error; err != nil {
		utils.Error(c, 400, "failed to create user (email may already be in use)")
		return
	}

	if len(req.RoleUUIDs) > 0 {
		h.assignRoles(&user, req.RoleUUIDs)
	}

	activity_logs.LogActivity(actorID, activity_logs.ActionCreate, "users", user.UUID.String(), nil, user, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, "user created", user)
}

func (h *Handler) assignRoles(user *User, roleUUIDs []string) {
	var roleList []roles.Role
	h.DB.Where("uuid IN ?", roleUUIDs).Find(&roleList)
	h.DB.Model(user).Association("Roles").Replace(roleList)
}

type updateRequest struct {
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Status    string   `json:"status"`
	RoleUUIDs []string `json:"role_uuids"`
}

func (h *Handler) Update(c *gin.Context) {
	var user User
	if err := h.DB.Preload("Roles").Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	oldValue := user

	var req updateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}

	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.Status != "" {
		user.Status = UserStatus(req.Status)
	}

	actorID := utils.CurrentUserID(c)
	user.UpdatedBy = actorID

	if err := h.DB.Save(&user).Error; err != nil {
		utils.Error(c, 400, "failed to update user")
		return
	}
	if req.RoleUUIDs != nil {
		h.assignRoles(&user, req.RoleUUIDs)
	}

	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "users", user.UUID.String(), oldValue, user, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "user updated", user)
}

func (h *Handler) Delete(c *gin.Context) {
	var user User
	if err := h.DB.Preload("Roles").Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	for _, r := range user.Roles {
		if r.IsSuperadmin {
			utils.Error(c, 403, "superadmin user cannot be deleted")
			return
		}
	}

	actorID := utils.CurrentUserID(c)
	if actorID != nil {
		h.DB.Model(&user).Update("deleted_by", actorID)
	}
	if err := h.DB.Delete(&user).Error; err != nil {
		utils.Error(c, 500, "failed to delete user")
		return
	}

	activity_logs.LogActivity(actorID, activity_logs.ActionDelete, "users", user.UUID.String(), user, nil, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "user deleted", nil)
}

type statusRequest struct {
	Status string `json:"status" binding:"required"`
}

func (h *Handler) UpdateStatus(c *gin.Context) {
	var user User
	if err := h.DB.Preload("Roles").Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	for _, r := range user.Roles {
		if r.IsSuperadmin {
			utils.Error(c, 403, "superadmin status cannot be changed")
			return
		}
	}

	var req statusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	oldStatus := user.Status
	user.Status = UserStatus(req.Status)
	h.DB.Save(&user)

	actorID := utils.CurrentUserID(c)
	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "users", user.UUID.String(), gin.H{"status": oldStatus}, gin.H{"status": user.Status}, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "status updated", user)
}

func (h *Handler) UploadAvatar(c *gin.Context) {
	var user User
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}

	fileHeader, err := c.FormFile("avatar")
	if err != nil {
		utils.Error(c, 400, "avatar file is required")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		utils.Error(c, 400, "failed to read uploaded file")
		return
	}
	defer file.Close()

	path, err := h.Storage.Upload(file, fileHeader, "avatars")
	if err != nil {
		utils.Error(c, 400, err.Error())
		return
	}

	user.Avatar = &path
	h.DB.Save(&user)
	utils.Success(c, 200, "avatar uploaded", gin.H{"avatar": h.Storage.GetURL(path)})
}

func (h *Handler) ListSessions(c *gin.Context) {
	var user User
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	var sessionsList []Session
	h.DB.Where("user_id = ? AND expired_at > ?", user.ID, time.Now()).Find(&sessionsList)
	utils.Success(c, 200, "ok", sessionsList)
}

func (h *Handler) KickSession(c *gin.Context) {
	var user User
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	if err := h.DB.Where("uuid = ? AND user_id = ?", c.Param("session_uuid"), user.ID).Delete(&Session{}).Error; err != nil {
		utils.Error(c, 500, "failed to remove session")
		return
	}
	utils.Success(c, 200, "session removed", nil)
}

var _ = uuid.Nil
