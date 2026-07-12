package menus

import "github.com/gin-gonic/gin"

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, guard func(menuPath, action string) gin.HandlerFunc) {
	g := rg.Group("/menus")
	g.GET("", guard("menus", "view"), h.List)
	g.GET("/:uuid", guard("menus", "view"), h.Get)
	g.POST("", guard("menus", "create"), h.Create)
	g.PUT("/:uuid", guard("menus", "edit"), h.Update)
	g.DELETE("/:uuid", guard("menus", "delete"), h.Delete)
	g.PUT("/reorder", guard("menus", "edit"), h.Reorder)
}
