package utils

import (
	"strings"
	"testing"
)

func TestValidatePasswordPolicy(t *testing.T) {
	cases := []struct {
		name string
		pw   string
		ok   bool
	}{
		{"valid", "Passw0rd!", true},
		{"too short", "Pa1!", false},
		{"no upper", "passw0rd!", false},
		{"no digit", "Password!", false},
		{"no symbol", "Passw0rdd", false},
		{"72 bytes ok", "Aa1!" + strings.Repeat("x", 68), true},
		{"73 bytes rejected", "Aa1!" + strings.Repeat("x", 69), false},
	}
	for _, tc := range cases {
		if err := ValidatePasswordPolicy(tc.pw); (err == nil) != tc.ok {
			t.Errorf("%s: err=%v, want ok=%v", tc.name, err, tc.ok)
		}
	}
}
