package dev_tickets

import "testing"

func TestNormalizePlatforms(t *testing.T) {
	tests := []struct {
		in   string
		want string
		ok   bool
	}{
		{"Android", "Android", true},
		{"ios, android", "Android, iOS", true},
		{"Backend,Website,Backend", "Website, Backend", true},
		{" Web Admin , ", "Web Admin", true},
		{"", "", false},
		{" , ", "", false},
		{"Android, Desktop", "", false},
	}
	for _, tt := range tests {
		got, ok := normalizePlatforms(tt.in)
		if got != tt.want || ok != tt.ok {
			t.Errorf("normalizePlatforms(%q) = %q, %v; want %q, %v", tt.in, got, ok, tt.want, tt.ok)
		}
	}
}
