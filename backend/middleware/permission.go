package middleware

import (
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
)

// RequirePermission checks that the authenticated user's role(s) grant the
// given action on the given menu path. Superadmin always bypasses this check.
func RequirePermission(authz *AuthCache, menuPath, action string) gin.HandlerFunc {
	check := checkPermission(authz, menuPath, action)
	return func(c *gin.Context) {
		if check(c) {
			c.Next()
		}
	}
}

// checkPermission is RequirePermission without the trailing c.Next(): true =
// allowed, false = response already written and the chain aborted.
func checkPermission(authz *AuthCache, menuPath, action string) func(c *gin.Context) bool {
	column := map[string]string{
		"view":   "can_view",
		"create": "can_create",
		"edit":   "can_edit",
		"delete": "can_delete",
	}[action]

	return func(c *gin.Context) bool {
		if utils.IsSuperadmin(c) {
			return true
		}
		if column == "" { // unknown action: fail closed
			utils.Error(c, 403, "you do not have permission to perform this action")
			c.Abort()
			return false
		}
		userID := utils.CurrentUserID(c)
		if userID == nil {
			utils.Error(c, 401, "authentication required")
			c.Abort()
			return false
		}

		allowed := authz.Allowed(*userID, menuPath, column)

		if !allowed {
			utils.Error(c, 403, "you do not have permission to perform this action")
			c.Abort()
			return false
		}
		return true
	}
}
