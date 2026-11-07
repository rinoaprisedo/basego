package users

import "github.com/gin-gonic/gin"

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, guard func(menuPath, action string) gin.HandlerFunc, uploadLimiter gin.HandlerFunc) {
	g := rg.Group("/users")
	g.GET("", guard("users", "view"), h.List)
	g.GET("/export/csv", guard("users", "view"), h.ExportCSV)
	g.GET("/export/excel", guard("users", "view"), h.ExportExcel)
	g.GET("/import/template", guard("users", "view"), h.ImportTemplate)
	g.GET("/import/jobs/:token", guard("users", "view"), h.ImportStatus)
	g.POST("/import/insert/validate", guard("users", "create"), uploadLimiter, h.importValidate(importInsert))
	g.POST("/import/insert/commit/:token", guard("users", "create"), h.importCommit(importInsert))
	g.POST("/import/update/validate", guard("users", "edit"), uploadLimiter, h.importValidate(importUpdate))
	g.POST("/import/update/commit/:token", guard("users", "edit"), h.importCommit(importUpdate))
	g.GET("/:uuid", guard("users", "view"), h.Get)
	g.POST("", guard("users", "create"), h.Create)
	g.PUT("/:uuid", guard("users", "edit"), h.Update)
	g.DELETE("/:uuid", guard("users", "delete"), h.Delete)
	g.PUT("/:uuid/status", guard("users", "edit"), h.UpdateStatus)
	g.POST("/:uuid/avatar", guard("users", "edit"), uploadLimiter, h.UploadAvatar)
}
