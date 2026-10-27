package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// NewGuard returns the per-route guard used by every module: authenticate the
// session, then require the given permission, and only then let the route
// handler run. Order matters — both checks complete before c.Next().
func NewGuard(rdb *redis.Client, authz *AuthCache) func(menuPath, action string) gin.HandlerFunc {
	authn := authenticate(rdb, authz)
	return func(menuPath, action string) gin.HandlerFunc {
		perm := checkPermission(authz, menuPath, action)
		return func(c *gin.Context) {
			if !authn(c) || !perm(c) {
				return
			}
			c.Next()
		}
	}
}
