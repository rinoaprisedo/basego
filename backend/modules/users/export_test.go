package users

import "testing"

func TestSafeCell(t *testing.T) {
	cases := map[string]string{
		"":                "",
		"Alice":           "Alice",
		"=1+1":            "'=1+1",
		"+cmd":            "'+cmd",
		"-2":              "'-2",
		"@SUM(A1)":        "'@SUM(A1)",
		"\tx":             "'\tx",
		"bob@example.com": "bob@example.com",
		"x=1":             "x=1",
	}
	for in, want := range cases {
		if got := safeCell(in); got != want {
			t.Errorf("safeCell(%q) = %q, want %q", in, got, want)
		}
	}
}
