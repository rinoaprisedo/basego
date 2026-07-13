package middleware

import (
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware whitelists only the configured frontend origin.
func CORSMiddleware(frontendURL string) gin.HandlerFunc {
	cfg := cors.Config{
		AllowOrigins:     []string{frontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "X-CSRF-Token", "Authorization"},
		AllowCredentials: true,
	}
	return cors.New(cfg)
}

// swaggerCSP is deliberately looser than defaultCSP: swagger-ui-dist injects
// inline <script>/<style> tags to bootstrap the UI, so 'unsafe-inline' is
// required there. It's scoped to /swagger, which already sits behind
// SessionAuth + requireSuperadmin, so the relaxed policy only reaches admins.
const (
	defaultCSP = "default-src 'self'; script-src 'self'; style-src 'self'; " +
		"img-src 'self' data:; font-src 'self' data:; connect-src 'self'; " +
		"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
	swaggerCSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data:; font-src 'self' data:; connect-src 'self'; " +
		"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)

// SecurityHeaders adds the helmet-equivalent response headers.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		if strings.HasPrefix(c.Request.URL.Path, "/swagger") {
			c.Header("Content-Security-Policy", swaggerCSP)
		} else {
			c.Header("Content-Security-Policy", defaultCSP)
		}
		c.Next()
	}
}

// RequestSizeLimit caps request body size (default 10MB).
func RequestSizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = MaxBytesReader(c, c.Request.Body, maxBytes)
		c.Next()
	}
}
