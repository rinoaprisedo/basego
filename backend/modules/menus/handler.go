package menus

import (
	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/menu_sections"
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

type sectionWithMenus struct {
	menu_sections.MenuSection
	Menus []Menu `json:"menus"`
}

// List returns menus grouped as a tree by section, per spec.
func (h *Handler) List(c *gin.Context) {
	var sections []menu_sections.MenuSection
	h.DB.Order("\"order\" asc").Find(&sections)

	q := h.DB.Model(&Menu{}).Order("\"order\" asc")
	if isActive := c.Query("is_active"); isActive != "" {
		q = q.Where("is_active = ?", isActive == "true")
	}
	if sectionUUID := c.Query("section"); sectionUUID != "" {
		var sec menu_sections.MenuSection
		if h.DB.Where("uuid = ?", sectionUUID).First(&sec).Error == nil {
			q = q.Where("menu_section_id = ?", sec.ID)
		}
	}
	var allMenus []Menu
	q.Find(&allMenus)

	result := make([]sectionWithMenus, 0, len(sections))
	for _, s := range sections {
		item := sectionWithMenus{MenuSection: s, Menus: []Menu{}}
		for _, m := range allMenus {
			if m.MenuSectionID == s.ID {
				item.Menus = append(item.Menus, m)
			}
		}
		result = append(result, item)
	}
	utils.Success(c, 200, "ok", result)
}

func (h *Handler) Get(c *gin.Context) {
	var menu Menu
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&menu).Error; err != nil {
		utils.Error(c, 404, "menu not found")
		return
	}
	utils.Success(c, 200, "ok", menu)
}

type menuRequest struct {
	MenuSectionUUID string `json:"menu_section_uuid" binding:"required"`
	Name            string `json:"name" binding:"required"`
	Icon            string `json:"icon"`
	Path            string `json:"path"`
	Order           int    `json:"order"`
	IsActive        bool   `json:"is_active"`
}

func (h *Handler) resolveSectionID(uuidStr string) (uint64, error) {
	var section menu_sections.MenuSection
	if err := h.DB.Where("uuid = ?", uuidStr).First(&section).Error; err != nil {
		return 0, err
	}
	return section.ID, nil
}

func (h *Handler) Create(c *gin.Context) {
	var req menuRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	sectionID, err := h.resolveSectionID(req.MenuSectionUUID)
	if err != nil {
		utils.Error(c, 400, "invalid menu_section_uuid")
		return
	}
	menu := Menu{MenuSectionID: sectionID, Name: req.Name, Icon: req.Icon, Path: req.Path, Order: req.Order, IsActive: req.IsActive}
	actorID := utils.CurrentUserID(c)
	menu.CreatedBy = actorID
	if err := h.DB.Create(&menu).Error; err != nil {
		utils.Error(c, 400, "failed to create menu")
		return
	}
	activity_logs.LogActivity(actorID, activity_logs.ActionCreate, "menus", menu.UUID.String(), nil, menu, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, "menu created", menu)
}

func (h *Handler) Update(c *gin.Context) {
	var menu Menu
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&menu).Error; err != nil {
		utils.Error(c, 404, "menu not found")
		return
	}
	oldValue := menu

	var req menuRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	if req.MenuSectionUUID != "" {
		sectionID, err := h.resolveSectionID(req.MenuSectionUUID)
		if err != nil {
			utils.Error(c, 400, "invalid menu_section_uuid")
			return
		}
		menu.MenuSectionID = sectionID
	}
	menu.Name = req.Name
	menu.Icon = req.Icon
	menu.Path = req.Path
	menu.Order = req.Order
	menu.IsActive = req.IsActive

	actorID := utils.CurrentUserID(c)
	menu.UpdatedBy = actorID
	h.DB.Save(&menu)
	activity_logs.LogActivity(actorID, activity_logs.ActionUpdate, "menus", menu.UUID.String(), oldValue, menu, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "menu updated", menu)
}

func (h *Handler) Delete(c *gin.Context) {
	var menu Menu
	if err := h.DB.Where("uuid = ?", c.Param("uuid")).First(&menu).Error; err != nil {
		utils.Error(c, 404, "menu not found")
		return
	}
	actorID := utils.CurrentUserID(c)
	if actorID != nil {
		h.DB.Model(&menu).Update("deleted_by", actorID)
	}
	h.DB.Delete(&menu)
	activity_logs.LogActivity(actorID, activity_logs.ActionDelete, "menus", menu.UUID.String(), menu, nil, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "menu deleted", nil)
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
		h.DB.Model(&Menu{}).Where("uuid = ?", item.UUID).Update("order", item.Order)
	}
	utils.Success(c, 200, "reordered", nil)
}
