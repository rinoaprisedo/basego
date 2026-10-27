package middleware

import "testing"

func TestMaintenanceExempt(t *testing.T) {
	cases := []struct {
		method, path string
		want         bool
	}{
		{"POST", "/api/v1/auth/login", true},
		{"GET", "/api/v1/auth/login", false},
		{"GET", "/api/v1/settings/public", true},
		{"GET", "/api/v1/version", true},
		{"GET", "/api/v1/users", false},
		{"PUT", "/api/v1/settings", false},
	}
	for _, tc := range cases {
		if got := maintenanceExempt(tc.method, tc.path); got != tc.want {
			t.Errorf("%s %s = %v, want %v", tc.method, tc.path, got, tc.want)
		}
	}
}
