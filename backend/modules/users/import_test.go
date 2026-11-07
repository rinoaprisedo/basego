package users

import (
	"strings"
	"testing"

	"baseadmin/backend/modules/roles"
)

func lookups() importLookups {
	return importLookups{
		users: map[string]User{
			"ada@example.com":  {Email: "ada@example.com"},
			"root@example.com": {Email: "root@example.com", Role: &roles.Role{IsSuperadmin: true}},
		},
		roles: map[string]roles.Role{
			"admin": {Name: "Admin"},
			"owner": {Name: "Owner", IsSuperadmin: true},
		},
	}
}

func fieldsOf(errs []RowError) string {
	var out []string
	for _, e := range errs {
		out = append(out, e.Field)
	}
	return strings.Join(out, ",")
}

func TestParseImportRows(t *testing.T) {
	sheet := [][]string{
		{"email", "NAME", "Role"},
		{"a@x.com", "Ann", "Admin"},
		{"", "", ""},
		{"'=evil@x.com", "'=Bob"},
	}
	rows, err := parseImportRows(sheet)
	if err != nil || len(rows) != 2 {
		t.Fatalf("rows=%v err=%v", rows, err)
	}
	if rows[0].Line != 2 || rows[1].Line != 4 {
		t.Errorf("line numbers = %d, %d", rows[0].Line, rows[1].Line)
	}
	if rows[1].Name != "=Bob" {
		t.Errorf("apostrophe from export not stripped: %q", rows[1].Name)
	}
	if _, err := parseImportRows([][]string{{"Name"}, {"x"}}); err == nil {
		t.Error("missing Email header must fail")
	}
	if _, err := parseImportRows([][]string{{"Email"}}); err == nil {
		t.Error("header-only file must fail")
	}
}

func TestValidateInsert(t *testing.T) {
	lk := lookups()
	seen := map[string]int{}
	ok := importRow{Line: 2, Name: "New", Email: "new@example.com", Password: "Passw0rd!", Role: "admin"}
	if errs := validateRow(ok, importInsert, nil, lk, false, seen); len(errs) != 0 {
		t.Fatalf("valid row rejected: %v", errs)
	}
	cases := []struct {
		name string
		row  importRow
		want string
	}{
		{"missing everything", importRow{Line: 3}, "Email,Name,Password"},
		{"bad email", importRow{Line: 3, Name: "x", Email: "nope", Password: "Passw0rd!"}, "Email"},
		{"existing email", importRow{Line: 3, Name: "x", Email: "ADA@example.com", Password: "Passw0rd!"}, "Email"},
		{"weak password", importRow{Line: 3, Name: "x", Email: "w@example.com", Password: "weak"}, "Password"},
		{"bad status", importRow{Line: 3, Name: "x", Email: "s@example.com", Password: "Passw0rd!", Status: "gone"}, "Status"},
		{"unknown role", importRow{Line: 3, Name: "x", Email: "r@example.com", Password: "Passw0rd!", Role: "ghost"}, "Role"},
		{"superadmin role by non-superadmin", importRow{Line: 3, Name: "x", Email: "o@example.com", Password: "Passw0rd!", Role: "Owner"}, "Role"},
		{"duplicate in file", importRow{Line: 5, Name: "x", Email: "new@example.com", Password: "Passw0rd!"}, "Email"},
	}
	for _, tc := range cases {
		if got := fieldsOf(validateRow(tc.row, importInsert, nil, lk, false, seen)); got != tc.want {
			t.Errorf("%s: got %q want %q", tc.name, got, tc.want)
		}
	}
	owner := importRow{Line: 9, Name: "x", Email: "o2@example.com", Password: "Passw0rd!", Role: "Owner"}
	if errs := validateRow(owner, importInsert, nil, lk, true, seen); len(errs) != 0 {
		t.Errorf("superadmin may assign superadmin role: %v", errs)
	}
}

func TestValidateUpdate(t *testing.T) {
	lk := lookups()
	// Only the ticked columns are checked: password is junk but not ticked.
	r := importRow{Line: 2, Email: "ada@example.com", Name: "Ada", Password: "x"}
	if errs := validateRow(r, importUpdate, []string{"name"}, lk, false, map[string]int{}); len(errs) != 0 {
		t.Fatalf("unticked column must be ignored: %v", errs)
	}
	if got := fieldsOf(validateRow(r, importUpdate, []string{"name", "password"}, lk, false, map[string]int{})); got != "Password" {
		t.Errorf("ticked password must be validated, got %q", got)
	}
	if got := fieldsOf(validateRow(importRow{Line: 2, Email: "ghost@example.com"}, importUpdate, []string{"role"}, lk, false, map[string]int{})); got != "Email" {
		t.Errorf("unknown email must fail, got %q", got)
	}
	// empty status is an error on update, empty role is allowed (clears it)
	if got := fieldsOf(validateRow(importRow{Line: 2, Email: "ada@example.com"}, importUpdate, []string{"status", "role"}, lk, false, map[string]int{})); got != "Status" {
		t.Errorf("got %q", got)
	}
	// superadmin accounts are protected
	su := importRow{Line: 2, Email: "root@example.com", Name: "Root"}
	if got := fieldsOf(validateRow(su, importUpdate, []string{"name"}, lk, false, map[string]int{})); got != "Email" {
		t.Errorf("non-superadmin must not touch superadmin, got %q", got)
	}
	if errs := validateRow(su, importUpdate, []string{"name"}, lk, true, map[string]int{}); len(errs) != 0 {
		t.Errorf("superadmin may update superadmin: %v", errs)
	}
}
