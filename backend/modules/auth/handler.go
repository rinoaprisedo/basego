package auth

import (
	"context"
	"time"

	"baseadmin/backend/config"
	"baseadmin/backend/middleware"
	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/modules/users"
	"baseadmin/backend/session"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type Handler struct {
	DB    *gorm.DB
	Redis *redis.Client
	Cfg   *config.Config
}

func NewHandler(db *gorm.DB, rdb *redis.Client, cfg *config.Config) *Handler {
	return &Handler{DB: db, Redis: rdb, Cfg: cfg}
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login validates credentials, rotates the session, enforces max concurrent
// sessions, and sets the httpOnly session cookie.
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}

	var user users.User
	if err := h.DB.Preload("Roles").Where("email = ?", req.Email).First(&user).Error; err != nil {
		middleware.RegisterLoginFailure(c, h.Redis)
		activity_logs.LogActivity(nil, activity_logs.ActionLogin, "auth", "", nil, gin.H{"email": req.Email, "result": "failed"}, c.ClientIP(), c.Request.UserAgent())
		utils.Error(c, 401, "invalid email or password")
		return
	}

	if !CheckPassword(user.Password, req.Password) {
		middleware.RegisterLoginFailure(c, h.Redis)
		activity_logs.LogActivity(&user.ID, activity_logs.ActionLogin, "auth", user.UUID.String(), nil, gin.H{"result": "failed"}, c.ClientIP(), c.Request.UserAgent())
		utils.Error(c, 401, "invalid email or password")
		return
	}

	if user.Status != users.StatusActive {
		utils.Error(c, 403, "account is not active")
		return
	}

	token, err := session.GenerateToken()
	if err != nil {
		utils.Error(c, 500, "failed to create session")
		return
	}

	data := session.Data{
		UserID:    user.ID,
		UserUUID:  user.UUID.String(),
		IPAddress: c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	}
	ttl := time.Duration(h.Cfg.SessionMaxAge) * time.Second
	if err := session.Create(context.Background(), h.Redis, token, data, ttl, h.Cfg.SessionMaxConcurrent); err != nil {
		utils.Error(c, 500, "failed to persist session")
		return
	}

	secure := h.Cfg.AppEnv == "production"
	c.SetSameSite(3) // strict
	c.SetCookie(session.CookieName, token, h.Cfg.SessionMaxAge, "/", "", secure, true)

	// Mirror the Redis session as a DB row so /users/:uuid/sessions can list
	// and revoke active sessions; Redis remains the source of truth for auth.
	h.DB.Create(&users.Session{
		UserID:    user.ID,
		Token:     token,
		IPAddress: c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
		ExpiredAt: time.Now().Add(ttl),
		CreatedAt: time.Now(),
	})

	now := time.Now()
	h.DB.Model(&user).Update("last_login_at", &now)

	middleware.ClearLoginFailures(c, h.Redis)
	activity_logs.LogActivity(&user.ID, activity_logs.ActionLogin, "auth", user.UUID.String(), nil, gin.H{"result": "success"}, c.ClientIP(), c.Request.UserAgent())

	utils.Success(c, 200, "login successful", h.meFromUser(&user))
}

func (h *Handler) Logout(c *gin.Context) {
	token, _ := c.Cookie(session.CookieName)
	userID := utils.CurrentUserID(c)
	if token != "" && userID != nil {
		_ = session.Delete(context.Background(), h.Redis, token, *userID)
		h.DB.Where("token = ?", token).Delete(&users.Session{})
		activity_logs.LogActivity(userID, activity_logs.ActionLogout, "auth", "", nil, nil, c.ClientIP(), c.Request.UserAgent())
	}
	c.SetCookie(session.CookieName, "", -1, "/", "", h.Cfg.AppEnv == "production", true)
	utils.Success(c, 200, "logout successful", nil)
}

func (h *Handler) Me(c *gin.Context) {
	userID := utils.CurrentUserID(c)
	if userID == nil {
		utils.Error(c, 401, "authentication required")
		return
	}
	var user users.User
	if err := h.DB.Preload("Roles").First(&user, *userID).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	utils.Success(c, 200, "ok", h.meFromUser(&user))
}

type permissionDTO struct {
	Path      string `json:"path"`
	CanView   bool   `json:"can_view"`
	CanCreate bool   `json:"can_create"`
	CanEdit   bool   `json:"can_edit"`
	CanDelete bool   `json:"can_delete"`
}

func (h *Handler) meFromUser(u *users.User) gin.H {
	roleNames := make([]string, 0, len(u.Roles))
	roleIDs := make([]uint64, 0, len(u.Roles))
	isSuperadmin := false
	for _, r := range u.Roles {
		roleNames = append(roleNames, r.Name)
		roleIDs = append(roleIDs, r.ID)
		if r.IsSuperadmin {
			isSuperadmin = true
		}
	}

	perms := []permissionDTO{}
	if !isSuperadmin && len(roleIDs) > 0 {
		h.DB.Table("permissions").
			Select("menus.path AS path, MAX(permissions.can_view) AS can_view, MAX(permissions.can_create) AS can_create, MAX(permissions.can_edit) AS can_edit, MAX(permissions.can_delete) AS can_delete").
			Joins("JOIN menus ON menus.id = permissions.menu_id").
			Where("permissions.role_id IN ?", roleIDs).
			Group("menus.path").
			Scan(&perms)
	}

	return gin.H{
		"uuid":          u.UUID,
		"name":          u.Name,
		"email":         u.Email,
		"avatar":        u.Avatar,
		"status":        u.Status,
		"roles":         roleNames,
		"is_superadmin": isSuperadmin,
		"permissions":   perms,
	}
}

type forgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

func (h *Handler) ForgotPassword(c *gin.Context) {
	var req forgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}

	var user users.User
	if err := h.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		// Do not leak whether the email exists.
		utils.Success(c, 200, "if the email exists, a reset link has been sent", nil)
		return
	}

	token, _ := session.GenerateToken()
	reset := users.PasswordResetToken{
		Email:     req.Email,
		Token:     token,
		ExpiredAt: time.Now().Add(1 * time.Hour),
	}
	h.DB.Create(&reset)

	// SMTP is not configured for the base project; log instead of sending.
	log_stub(req.Email, token)

	utils.Success(c, 200, "if the email exists, a reset link has been sent", nil)
}

type resetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

func (h *Handler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	if err := ValidatePasswordPolicy(req.NewPassword); err != nil {
		utils.Error(c, 400, err.Error())
		return
	}

	var reset users.PasswordResetToken
	if err := h.DB.Where("token = ? AND used_at IS NULL", req.Token).First(&reset).Error; err != nil {
		utils.Error(c, 400, "invalid or already used token")
		return
	}
	if time.Now().After(reset.ExpiredAt) {
		utils.Error(c, 400, "token has expired")
		return
	}

	var user users.User
	if err := h.DB.Where("email = ?", reset.Email).First(&user).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}

	hashed, err := HashPassword(req.NewPassword)
	if err != nil {
		utils.Error(c, 500, "failed to hash password")
		return
	}
	h.DB.Model(&user).Update("password", hashed)
	h.DB.Create(&users.PasswordHistory{UserID: user.ID, Password: hashed, CreatedAt: time.Now()})

	now := time.Now()
	h.DB.Model(&reset).Update("used_at", &now)

	_ = session.DeleteAllForUser(context.Background(), h.Redis, user.ID)

	utils.Success(c, 200, "password reset successfully", nil)
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

func (h *Handler) ChangePassword(c *gin.Context) {
	userID := utils.CurrentUserID(c)
	if userID == nil {
		utils.Error(c, 401, "authentication required")
		return
	}
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	if err := ValidatePasswordPolicy(req.NewPassword); err != nil {
		utils.Error(c, 400, err.Error())
		return
	}

	var user users.User
	if err := h.DB.First(&user, *userID).Error; err != nil {
		utils.Error(c, 404, "user not found")
		return
	}
	if !CheckPassword(user.Password, req.CurrentPassword) {
		utils.Error(c, 400, "current password is incorrect")
		return
	}

	var histories []users.PasswordHistory
	h.DB.Where("user_id = ?", user.ID).Order("created_at desc").Limit(5).Find(&histories)
	for _, hist := range histories {
		if CheckPassword(hist.Password, req.NewPassword) {
			utils.Error(c, 400, "cannot reuse any of your last 5 passwords")
			return
		}
	}
	if CheckPassword(user.Password, req.NewPassword) {
		utils.Error(c, 400, "cannot reuse any of your last 5 passwords")
		return
	}

	hashed, err := HashPassword(req.NewPassword)
	if err != nil {
		utils.Error(c, 500, "failed to hash password")
		return
	}
	h.DB.Model(&user).Update("password", hashed)
	h.DB.Create(&users.PasswordHistory{UserID: user.ID, Password: hashed, CreatedAt: time.Now()})

	utils.Success(c, 200, "password changed successfully", nil)
}

var _ = roles.Role{}

func log_stub(email, token string) {
	// Email sending is stubbed for the base project (no SMTP configured).
	println("password reset requested for", email, "token:", token)
}
