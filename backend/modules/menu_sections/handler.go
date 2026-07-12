package menu_sections

import (
	"baseadmin/backend/modules/activity_logs"
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
	var list []MenuSection
	h.DB.Order("\"order\" asc").Find(&list)
	utils.Success(c, 200, "ok", list)
}

func (h *Handler) Get(c *gin.Context) {
	var section MenuSection
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&section).Error; err != nil {
		utils.Error(c, 404, "menu section not found")
		return
	}
	utils.Success(c, 200, "ok", section)
}

type sectionRequest struct {
	Name  string `json:"name" binding:"required"`
	Icon  string `json:"icon"`
	Order int    `json:"order"`
}

func (h *Handler) Create(c *gin.Context) {
	var req sectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	section := MenuSection{Name: req.Name, Icon: req.Icon, Order: req.Order}
	actorID := utils.CurrentUserID(c)
	section.CreatedBy = actorID
	if err := h.DB.Create(&section).Error; err != nil {
		utils.Error(c, 400, "failed to create menu section")
		return
	}
	activity_logs.LogActivity(actorID, activity_logs.ActionCreate, "menu_sections", section.UUID.String(), nil, section, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, "menu section created", section)
}

func (h *Handler) Update(c *gin.Context) {
	var section MenuSection
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&section).Error; err != nil {
		utils.Error(c, 404, "menu section not found")
		return
	}
	oldValue := section

	var req sectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	section.Name = req.Name
	section.Icon = req.Icon
	section.Order = req.Order

	actorID := utils.CurrentUserID(c)
	section.UpdatedBy = actorID
	h.DB.Save(&section)
	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "menu_sections", section.UUID.String(), oldValue, section, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "menu section updated", section)
}

func (h *Handler) Delete(c *gin.Context) {
	var section MenuSection
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&section).Error; err != nil {
		utils.Error(c, 404, "menu section not found")
		return
	}
	actorID := utils.CurrentUserID(c)
	if actorID != nil {
		h.DB.Model(&section).Update("deleted_by", actorID)
	}
	h.DB.Delete(&section)
	activity_logs.LogActivity(actorID, activity_logs.ActionDelete, "menu_sections", section.UUID.String(), section, nil, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "menu section deleted", nil)
}

type reorderItem struct {
	UUID  string `json:"uuid" binding:"required"`
	Order int    `json:"order"`
}

func (h *Handler) Reorder(c *gin.Context) {
	var items []reorderItem
	if err := c.ShouldBindJSON(&items); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	for _, item := range items {
		h.DB.Model(&MenuSection{}).Where("uuid = ?", item.UUID).Update("order", item.Order)
	}
	utils.Success(c, 200, "reordered", nil)
}
