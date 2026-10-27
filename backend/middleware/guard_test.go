package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// The route handler must never run when the guard rejects the request.
// (Regression: guard used to call a middleware ending in c.Next(), so the
// handler executed first and the permission check's 403 was appended after
// the handler had already responded.)
func TestGuardBlocksHandlerWithoutSession(t *testing.T) {
	gin.SetMode(gin.TestMode)
	guard := NewGuard(nil, nil) // no cookie => rejected before redis/db are touched
	ran := false
	r := gin.New()
	r.POST("/x", guard("users", "create"), func(c *gin.Context) { ran = true; c.String(201, "created") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/x", nil))
	if ran {
		t.Fatal("handler ran although the request was unauthenticated")
	}
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestCheckPermissionDeniesWithoutIdentityAndUnknownAction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, action := range []string{"view", "bogus"} {
		check := checkPermission(nil, "users", action)
		ran := false
		r := gin.New()
		r.GET("/x", func(c *gin.Context) {
			if check(c) {
				ran = true
			}
		})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
		if ran || w.Code == 200 {
			t.Errorf("action %q: allowed without identity (code %d)", action, w.Code)
		}
	}
}
