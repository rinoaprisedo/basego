package main

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSplitList(t *testing.T) {
	if got := splitList(""); got != nil {
		t.Errorf("empty -> %v, want nil", got)
	}
	want := []string{"10.0.0.0/8", "127.0.0.1"}
	if got := splitList(" 10.0.0.0/8, ,127.0.0.1 "); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

// With no trusted proxies, a spoofed X-Forwarded-For must not change the IP
// used for rate limiting / login lockout.
func TestClientIPIgnoresSpoofedForwardedFor(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(splitList("")); err != nil {
		t.Fatal(err)
	}
	r.GET("/", func(c *gin.Context) { c.String(200, c.ClientIP()) })

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.9:4444"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Body.String() != "203.0.113.9" {
		t.Fatalf("ClientIP = %q, want the TCP peer", w.Body.String())
	}
}
