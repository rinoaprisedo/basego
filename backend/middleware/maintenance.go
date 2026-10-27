package middleware

import (
	"context"
	"net/http"
	"sync"
	"time"

	"baseadmin/backend/session"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const maintenanceCacheKey = "settings:maintenance_mode"

// MaintenanceMode blocks all requests with 503 when maintenance_mode=true,
// except for superadmins. The flag is cached in-process for a couple of
// seconds (on top of a 60s Redis cache) so it costs no Redis round-trip on
// the hot path; toggling it through the API resets the local cache at once.
func MaintenanceMode(rdb *redis.Client, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if maintenanceValue(rdb, db) == "true" {
			// This middleware runs before SessionAuth, so the context flag is
			// never set yet: resolve the caller from the session cookie
			// ourselves, otherwise superadmins (who must be able to switch
			// maintenance off) would be locked out too.
			if maintenanceExempt(c.Request.Method, c.Request.URL.Path) || isSuperadminSession(c, rdb, db) {
				c.Next()
				return
			}
			utils.Error(c, 503, "the application is currently under maintenance")
			c.Abort()
			return
		}
		c.Next()
	}
}

// maintenanceExempt lists the few endpoints that must keep working so an
// operator can sign in and the login/maintenance screens can render.
func maintenanceExempt(method, path string) bool {
	switch path {
	case "/api/v1/auth/login":
		return method == http.MethodPost
	case "/api/v1/settings/public", "/api/v1/version":
		return method == http.MethodGet
	}
	return false
}

func isSuperadminSession(c *gin.Context, rdb *redis.Client, db *gorm.DB) bool {
	token, err := c.Cookie(session.CookieName)
	if err != nil || token == "" {
		return false
	}
	data, err := session.Get(context.Background(), rdb, token)
	if err != nil {
		return false
	}
	ident, ok := ResolveIdentity(db, data.UserID)
	return ok && ident.IsSuperadmin
}

const maintenanceLocalTTL = 2 * time.Second

var maintLocal struct {
	mu  sync.RWMutex
	val string
	exp time.Time
}

// ResetMaintenanceCache forgets the in-process flag so the next request
// re-reads it. Call after the maintenance_mode setting changes.
func ResetMaintenanceCache() {
	maintLocal.mu.Lock()
	maintLocal.exp = time.Time{}
	maintLocal.mu.Unlock()
}

func maintenanceValue(rdb *redis.Client, db *gorm.DB) string {
	maintLocal.mu.RLock()
	if time.Now().Before(maintLocal.exp) {
		v := maintLocal.val
		maintLocal.mu.RUnlock()
		return v
	}
	maintLocal.mu.RUnlock()

	ctx := context.Background()
	val, err := rdb.Get(ctx, maintenanceCacheKey).Result()
	if err != nil {
		var value string
		db.Table("settings").Select("value").Where("key = ?", "maintenance_mode").Row().Scan(&value)
		val = value
		rdb.Set(ctx, maintenanceCacheKey, val, 60*time.Second)
	}
	maintLocal.mu.Lock()
	maintLocal.val, maintLocal.exp = val, time.Now().Add(maintenanceLocalTTL)
	maintLocal.mu.Unlock()
	return val
}
