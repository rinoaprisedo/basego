package middleware

import (
	"context"

	"baseadmin/backend/session"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// SessionAuth validates the httpOnly session cookie against Redis and
// attaches the resolved user identity to the gin context.
func SessionAuth(rdb *redis.Client, authz *AuthCache) gin.HandlerFunc {
	authn := authenticate(rdb, authz)
	return func(c *gin.Context) {
		if authn(c) {
			c.Next()
		}
	}
}

// authenticate validates the session and fills the gin context. Unlike a
// middleware it never calls c.Next(): it reports true on success and aborts
// (returning false) on failure, so callers can run further checks BEFORE the
// rest of the handler chain executes. (Calling a middleware that ends in
// c.Next() from inside another handler runs the route handler first — that
// made every permission check ineffective.)
func authenticate(rdb *redis.Client, authz *AuthCache) func(c *gin.Context) bool {
	return func(c *gin.Context) bool {
		token, err := c.Cookie(session.CookieName)
		if err != nil || token == "" {
			utils.Error(c, 401, "authentication required")
			c.Abort()
			return false
		}

		data, err := session.Get(context.Background(), rdb, token)
		if err != nil {
			utils.Error(c, 401, "session expired or invalid")
			c.Abort()
			return false
		}

		ident, ok := authz.Identity(data.UserID)
		if !ok {
			// Deleted or deactivated since the session was issued: the Redis
			// entry may outlive the account, so re-check on every request.
			utils.Error(c, 401, "session expired or invalid")
			c.Abort()
			return false
		}
		isSuperadmin := ident.IsSuperadmin

		c.Set(utils.CtxUserID, data.UserID)
		c.Set(utils.CtxUserUUID, data.UserUUID)
		c.Set(utils.CtxIsSuperadmin, isSuperadmin)
		c.Set(utils.CtxSessionToken, token)
		return true
	}
}

// Identity is the per-request view of a user needed for authorization.
type Identity struct {
	IsSuperadmin bool
}

// ResolveIdentity returns ok=false when the user no longer exists (soft
// deleted) or is not active. Role status is read live from the DB so a
// demotion takes effect on the next request.
func ResolveIdentity(db *gorm.DB, userID uint64) (Identity, bool) {
	var row struct {
		Status       string
		IsSuperadmin bool
	}
	res := db.Table("users").
		Select("users.status AS status, COALESCE(roles.is_superadmin, FALSE) AS is_superadmin").
		Joins("LEFT JOIN roles ON roles.id = users.role_id AND roles.deleted_at IS NULL").
		Where("users.id = ? AND users.deleted_at IS NULL", userID).
		Limit(1).
		Scan(&row)
	if res.Error != nil || res.RowsAffected == 0 || row.Status != "active" {
		return Identity{}, false
	}
	return Identity{IsSuperadmin: row.IsSuperadmin}, true
}
