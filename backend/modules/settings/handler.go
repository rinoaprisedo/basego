package settings

import (
	"context"

	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type Handler struct {
	DB      *gorm.DB
	Redis   *redis.Client
	Storage storage.StorageInterface
}

func NewHandler(db *gorm.DB, rdb *redis.Client, s storage.StorageInterface) *Handler {
	return &Handler{DB: db, Redis: rdb, Storage: s}
}

func (h *Handler) List(c *gin.Context) {
	var list []Setting
	h.DB.Find(&list)
	result := make(map[string]string, len(list))
	for _, s := range list {
		result[s.Key] = s.Value
	}
	utils.Success(c, 200, "ok", result)
}

func (h *Handler) BulkUpdate(c *gin.Context) {
	var payload map[string]string
	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}

	for key, value := range payload {
		var setting Setting
		result := h.DB.Where("key = ?", key).First(&setting)
		if result.Error != nil {
			setting = Setting{Key: key, Value: value, Type: TypeString}
			h.DB.Create(&setting)
		} else {
			setting.Value = value
			h.DB.Save(&setting)
		}
	}

	// Invalidate the maintenance-mode cache immediately if it changed.
	if _, ok := payload["maintenance_mode"]; ok {
		h.Redis.Del(context.Background(), "settings:maintenance_mode")
	}

	actorID := utils.CurrentUserID(c)
	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "settings", "", nil, payload, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "settings updated", nil)
}

func (h *Handler) Upload(c *gin.Context) {
	target := c.PostForm("target") // "app_logo" or "app_favicon"
	if target != "app_logo" && target != "app_favicon" {
		utils.Error(c, 400, "target must be app_logo or app_favicon")
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, 400, "file is required")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		utils.Error(c, 400, "failed to read uploaded file")
		return
	}
	defer file.Close()

	path, err := h.Storage.Upload(file, fileHeader, "settings")
	if err != nil {
		utils.Error(c, 400, err.Error())
		return
	}

	var setting Setting
	result := h.DB.Where("key = ?", target).First(&setting)
	if result.Error != nil {
		setting = Setting{Key: target, Value: path, Type: TypeFile}
		h.DB.Create(&setting)
	} else {
		setting.Value = path
		h.DB.Save(&setting)
	}

	utils.Success(c, 200, "file uploaded", gin.H{"url": h.Storage.GetURL(path)})
}
