package activity_logs

import (
	"baseadmin/backend/config"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct {
	DB  *gorm.DB
	Cfg *config.Config
}

func NewHandler(db *gorm.DB, cfg *config.Config) *Handler {
	return &Handler{DB: db, Cfg: cfg}
}

func (h *Handler) List(c *gin.Context) {
	p := utils.GetPagination(c, "created_at")
	q := h.DB.Model(&ActivityLog{})

	if userUUID := c.Query("user"); userUUID != "" {
		q = q.Joins("JOIN users ON users.id = activity_logs.user_id").Where("users.uuid = ?", userUUID)
	}
	if module := c.Query("module"); module != "" {
		q = q.Where("module = ?", module)
	}
	if action := c.Query("action"); action != "" {
		q = q.Where("action = ?", action)
	}
	if from := c.Query("date_from"); from != "" {
		q = q.Where("created_at >= ?", from)
	}
	if to := c.Query("date_to"); to != "" {
		q = q.Where("created_at <= ?", to)
	}

	var total int64
	q.Count(&total)

	var list []ActivityLog
	q.Order(p.SortBy + " " + p.SortDir).Offset(p.Offset).Limit(p.Limit).Find(&list)
	utils.SuccessList(c, "ok", list, utils.BuildMeta(p.Page, p.Limit, total))
}

func (h *Handler) Get(c *gin.Context) {
	var entry ActivityLog
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&entry).Error; err != nil {
		utils.Error(c, 404, "activity log not found")
		return
	}
	utils.Success(c, 200, "ok", entry)
}

func (h *Handler) Cleanup(c *gin.Context) {
	count, err := CleanupOld(h.Cfg.LogCleanupDays)
	if err != nil {
		utils.Error(c, 500, "failed to clean up activity logs")
		return
	}
	utils.Success(c, 200, "activity logs cleaned up", gin.H{"deleted": count})
}
