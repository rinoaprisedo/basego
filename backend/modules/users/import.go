package users

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"runtime"
	"strings"
	"sync"
	"time"

	"baseadmin/backend/middleware"
	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Bulk import. Two modes: "insert" creates users, "update" changes existing
// users matched by email (only the columns the admin ticked). The file is
// validated first as a background job (progress is polled by the admin UI);
// nothing is written unless every row is valid, and the write itself is one
// transaction, so a bad file never leaves a half-applied import behind.

const (
	maxImportRows  = 2000
	maxImportBytes = 5 << 20
	maxShownErrors = 500
	importTTL      = time.Hour

	importInsert = "insert"
	importUpdate = "update"

	jobValidating = "validating"
	jobInvalid    = "invalid"
	jobValid      = "valid"
	jobImporting  = "importing"
	jobDone       = "done"
	jobFailed     = "failed"
)

var importColumns = []string{"Name", "Email", "Password", "Status", "Role"}

// updatableFields are the columns an update import may change (Email is the key).
var updatableFields = map[string]bool{"name": true, "password": true, "status": true, "role": true}

type importRow struct {
	Line     int // spreadsheet row number (header = 1)
	Name     string
	Email    string
	Password string
	Status   string
	Role     string
}

type RowError struct {
	Row     int    `json:"row"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ---- parsing -------------------------------------------------------------

// cleanCell trims a cell and undoes the apostrophe safeCell() adds on export,
// so an exported file can be edited and imported back.
func cleanCell(v string) string {
	v = strings.TrimSpace(v)
	if len(v) > 1 && v[0] == '\'' {
		switch v[1] {
		case '=', '+', '-', '@':
			return v[1:]
		}
	}
	return v
}

// parseImportRows maps the sheet to rows by header name (any order, any case).
// Blank rows are skipped. A file-level problem is returned as an error.
func parseImportRows(sheet [][]string) ([]importRow, error) {
	if len(sheet) == 0 {
		return nil, errors.New("file kosong")
	}
	idx := map[string]int{}
	for i, h := range sheet[0] {
		idx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	if _, ok := idx["email"]; !ok {
		return nil, errors.New(`kolom "Email" tidak ditemukan di baris pertama — gunakan template`)
	}
	get := func(r []string, col string) string {
		i, ok := idx[col]
		if !ok || i >= len(r) {
			return ""
		}
		return cleanCell(r[i])
	}
	var rows []importRow
	for n, r := range sheet[1:] {
		row := importRow{
			Line: n + 2, Name: get(r, "name"), Email: get(r, "email"),
			Password: get(r, "password"), Status: strings.ToLower(get(r, "status")), Role: get(r, "role"),
		}
		if row.Name == "" && row.Email == "" && row.Password == "" && row.Status == "" && row.Role == "" {
			continue
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return nil, errors.New("tidak ada baris data di file")
	}
	if len(rows) > maxImportRows {
		return nil, fmt.Errorf("maksimal %d baris per import (file ini %d baris)", maxImportRows, len(rows))
	}
	return rows, nil
}

// ---- validation ----------------------------------------------------------

type importLookups struct {
	users map[string]User       // lower(email) -> existing user (with Role)
	roles map[string]roles.Role // lower(name)  -> role
}

func hasField(fields []string, f string) bool {
	for _, x := range fields {
		if x == f {
			return true
		}
	}
	return false
}

// validateRow returns the problems of one row; seen tracks emails already used
// earlier in the file.
func validateRow(r importRow, mode string, fields []string, lk importLookups, actorSuper bool, seen map[string]int) []RowError {
	var errs []RowError
	add := func(field, msg string) { errs = append(errs, RowError{Row: r.Line, Field: field, Message: msg}) }
	insert := mode == importInsert
	wants := func(f string) bool { return insert || hasField(fields, f) }

	email := strings.ToLower(r.Email)
	switch {
	case r.Email == "":
		add("Email", "wajib diisi")
	case len(r.Email) > 255:
		add("Email", "maksimal 255 karakter")
	default:
		if a, err := mail.ParseAddress(r.Email); err != nil || a.Address != r.Email {
			add("Email", "format email tidak valid")
		} else if first, dup := seen[email]; dup {
			add("Email", fmt.Sprintf("duplikat dengan baris %d di file", first))
		} else {
			seen[email] = r.Line
			existing, found := lk.users[email]
			if insert && found {
				add("Email", "sudah terdaftar")
			}
			if !insert {
				if !found {
					add("Email", "tidak ditemukan — user dengan email ini belum ada")
				} else if !actorSuper && hasSuperadminRole(&existing) {
					add("Email", "akun superadmin hanya bisa diubah oleh superadmin")
				}
			}
		}
	}

	if wants("name") {
		if r.Name == "" {
			add("Name", "wajib diisi")
		} else if len([]rune(r.Name)) > 255 {
			add("Name", "maksimal 255 karakter")
		}
	}
	if wants("password") {
		if r.Password == "" {
			add("Password", "wajib diisi")
		} else if err := utils.ValidatePasswordPolicy(r.Password); err != nil {
			add("Password", err.Error())
		}
	}
	if wants("status") {
		switch {
		case r.Status == "" && insert:
			// empty = active on insert
		case r.Status == "":
			add("Status", "wajib diisi (active, inactive atau suspended)")
		case !validStatus(r.Status):
			add("Status", "harus active, inactive atau suspended")
		}
	}
	if wants("role") && r.Role != "" {
		role, ok := lk.roles[strings.ToLower(r.Role)]
		switch {
		case !ok:
			add("Role", fmt.Sprintf("role %q tidak ditemukan", r.Role))
		case role.IsSuperadmin && !actorSuper:
			add("Role", "hanya superadmin yang boleh memberi role superadmin")
		}
	}
	return errs
}

// ---- job store (in memory; passwords never leave the process) -------------

type importJob struct {
	mu         sync.Mutex
	token      string
	actorID    uint64
	actorSuper bool
	mode       string
	fields     []string
	rows       []importRow

	status     string
	total      int
	checked    int
	errors     []RowError
	errorCount int
	processed  int
	created    int
	updated    int
	message    string
	expires    time.Time
}

type ImportJobView struct {
	Token      string     `json:"token"`
	Mode       string     `json:"mode"`
	Status     string     `json:"status"`
	Total      int        `json:"total"`
	Checked    int        `json:"checked"`
	Processed  int        `json:"processed"`
	Errors     []RowError `json:"errors"`
	ErrorCount int        `json:"error_count"`
	Created    int        `json:"created"`
	Updated    int        `json:"updated"`
	Message    string     `json:"message"`
}

func (j *importJob) view() ImportJobView {
	j.mu.Lock()
	defer j.mu.Unlock()
	errs := make([]RowError, len(j.errors))
	copy(errs, j.errors)
	return ImportJobView{
		Token: j.token, Mode: j.mode, Status: j.status, Total: j.total, Checked: j.checked,
		Processed: j.processed, Errors: errs, ErrorCount: j.errorCount, Created: j.created,
		Updated: j.updated, Message: j.message,
	}
}

var importJobs = struct {
	sync.Mutex
	m map[string]*importJob
}{m: map[string]*importJob{}}

func newImportJob(actorID uint64, actorSuper bool, mode string, fields []string, rows []importRow) *importJob {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	j := &importJob{
		token: hex.EncodeToString(b), actorID: actorID, actorSuper: actorSuper, mode: mode,
		fields: fields, rows: rows, status: jobValidating, total: len(rows), expires: time.Now().Add(importTTL),
	}
	importJobs.Lock()
	defer importJobs.Unlock()
	now := time.Now()
	for k, v := range importJobs.m { // drop expired jobs (and their cached passwords)
		if now.After(v.expires) {
			delete(importJobs.m, k)
		}
	}
	importJobs.m[j.token] = j
	return j
}

func findImportJob(token string, actorID uint64) *importJob {
	importJobs.Lock()
	defer importJobs.Unlock()
	j := importJobs.m[token]
	if j == nil || j.actorID != actorID || time.Now().After(j.expires) {
		return nil
	}
	return j
}

// ---- service -------------------------------------------------------------

func (s *Service) loadImportLookups(rows []importRow) (importLookups, error) {
	lk := importLookups{users: map[string]User{}, roles: map[string]roles.Role{}}
	emails := make([]string, 0, len(rows))
	for _, r := range rows {
		if r.Email != "" {
			emails = append(emails, strings.ToLower(r.Email))
		}
	}
	var found []User
	if len(emails) > 0 {
		if err := s.repo.DB.Preload("Role").Where("lower(email) IN ?", emails).Find(&found).Error; err != nil {
			return lk, err
		}
	}
	for _, u := range found {
		lk.users[strings.ToLower(u.Email)] = u
	}
	var rs []roles.Role
	if err := s.repo.DB.Find(&rs).Error; err != nil {
		return lk, err
	}
	for _, r := range rs {
		lk.roles[strings.ToLower(r.Name)] = r
	}
	return lk, nil
}

func (s *Service) runImportValidation(j *importJob) {
	lk, err := s.loadImportLookups(j.rows)
	if err != nil {
		j.mu.Lock()
		j.status, j.message = jobFailed, "gagal memeriksa data"
		j.mu.Unlock()
		return
	}
	seen := map[string]int{}
	for i, r := range j.rows {
		errs := validateRow(r, j.mode, j.fields, lk, j.actorSuper, seen)
		j.mu.Lock()
		j.errorCount += len(errs)
		if room := maxShownErrors - len(j.errors); room > 0 {
			if len(errs) > room {
				errs = errs[:room]
			}
			j.errors = append(j.errors, errs...)
		}
		j.checked = i + 1
		j.mu.Unlock()
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.errorCount > 0 {
		j.status = jobInvalid
		return
	}
	j.status = jobValid
}

// hashPasswords bcrypts every row's password in parallel (cost 12 is ~250ms,
// so a serial loop over a big file would take minutes).
func hashPasswords(j *importJob, need func(importRow) bool) ([]string, error) {
	hashes := make([]string, len(j.rows))
	workers := runtime.NumCPU()
	if workers > 8 {
		workers = 8
	}
	var wg sync.WaitGroup
	var firstErr error
	var errOnce sync.Once
	next := make(chan int)
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range next {
				h, err := bcrypt.GenerateFromPassword([]byte(j.rows[i].Password), 12)
				if err != nil {
					errOnce.Do(func() { firstErr = err })
					continue
				}
				hashes[i] = string(h)
				j.mu.Lock()
				j.processed++
				j.mu.Unlock()
			}
		}()
	}
	for i, r := range j.rows {
		if need(r) {
			next <- i
		}
	}
	close(next)
	wg.Wait()
	return hashes, firstErr
}

func (s *Service) runImportCommit(j *importJob) {
	fail := func(msg string) {
		j.mu.Lock()
		j.status, j.message = jobFailed, msg
		j.mu.Unlock()
	}
	insert := j.mode == importInsert
	needHash := func(r importRow) bool { return insert || (hasField(j.fields, "password") && r.Password != "") }

	hashes, err := hashPasswords(j, needHash)
	if err != nil {
		fail("gagal memproses password")
		return
	}
	lk, err := s.loadImportLookups(j.rows)
	if err != nil {
		fail("gagal membaca data")
		return
	}

	actor := j.actorID
	var created, updated int
	var touched []uint64
	err = s.repo.DB.Transaction(func(tx *gorm.DB) error {
		for i, r := range j.rows {
			role, hasRole := lk.roles[strings.ToLower(r.Role)]
			if insert {
				status := StatusActive
				if r.Status != "" {
					status = UserStatus(r.Status)
				}
				u := User{Name: r.Name, Email: r.Email, Password: hashes[i], Status: status}
				u.CreatedBy = &actor
				if hasRole {
					u.RoleID = &role.ID
				}
				if err := tx.Create(&u).Error; err != nil {
					return fmt.Errorf("baris %d: gagal membuat user (email mungkin sudah dipakai)", r.Line)
				}
				created++
				continue
			}
			u := lk.users[strings.ToLower(r.Email)]
			sessionAffecting := false
			if hasField(j.fields, "name") {
				u.Name = r.Name
			}
			if hasField(j.fields, "password") {
				u.Password = hashes[i]
				sessionAffecting = true
			}
			if hasField(j.fields, "status") && UserStatus(r.Status) != u.Status {
				u.Status = UserStatus(r.Status)
				sessionAffecting = true
			}
			if hasField(j.fields, "role") {
				if hasRole {
					if u.RoleID == nil || *u.RoleID != role.ID {
						sessionAffecting = true
					}
					u.RoleID = &role.ID
				} else {
					if u.RoleID != nil {
						sessionAffecting = true
					}
					u.RoleID = nil
				}
			}
			u.Role = nil
			u.UpdatedBy = &actor
			if err := tx.Save(&u).Error; err != nil {
				return fmt.Errorf("baris %d: gagal menyimpan user", r.Line)
			}
			updated++
			if sessionAffecting {
				touched = append(touched, u.ID)
			}
		}
		return nil
	})
	if err != nil {
		fail(err.Error())
		return
	}
	middleware.FlushAuthCache()
	for _, id := range touched { // same rule as Update: privilege/credential changes end old sessions
		s.invalidateSessions(id)
	}
	j.mu.Lock()
	j.status, j.created, j.updated, j.processed = jobDone, created, updated, j.total
	j.mu.Unlock()
}

// ---- handlers ------------------------------------------------------------

// ImportTemplate godoc
// @Summary		Download the user import template (.xlsx)
// @Tags			users
// @Security		SessionCookie
// @Produce		application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Success		200
// @Router			/users/import/template [get]
func (h *Handler) ImportTemplate(c *gin.Context) {
	f := excelize.NewFile()
	defer f.Close()
	const sheet = "Users"
	f.SetSheetName("Sheet1", sheet)
	for i, col := range importColumns {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, col)
	}
	example := []string{"Budi Santoso", "budi@example.com", "Rahasia#123", "active", "Admin"}
	for i, v := range example {
		cell, _ := excelize.CoordinatesToCellName(i+1, 2)
		f.SetCellValue(sheet, cell, v)
	}
	_ = f.SetColWidth(sheet, "A", "E", 26)
	hdr, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, Fill: excelize.Fill{Type: "pattern", Color: []string{"#E8E8E8"}, Pattern: 1}})
	_ = f.SetCellStyle(sheet, "A1", "E1", hdr)

	help := "Petunjuk"
	f.NewSheet(help)
	notes := [][]string{
		{"Kolom", "Aturan"},
		{"Name", "Wajib. Maks 255 karakter."},
		{"Email", "Wajib, format email valid dan unik. Dipakai sebagai kunci saat Update."},
		{"Password", "Wajib untuk Insert. Min 8 karakter, ada huruf besar, angka dan simbol. Untuk Update hanya dipakai jika kolom Password dicentang."},
		{"Status", "active, inactive atau suspended. Kosong = active (Insert)."},
		{"Role", "Nama role persis seperti di menu Roles. Boleh kosong."},
		{"", ""},
		{"Catatan", "Hapus baris contoh sebelum import. Maksimal 2000 baris, 5 MB. Jika ada satu saja baris yang tidak sesuai, tidak ada data yang diproses."},
	}
	for r, row := range notes {
		for i, v := range row {
			cell, _ := excelize.CoordinatesToCellName(i+1, r+1)
			f.SetCellValue(help, cell, v)
		}
	}
	_ = f.SetColWidth(help, "A", "A", 14)
	_ = f.SetColWidth(help, "B", "B", 110)

	c.Header("Content-Disposition", "attachment; filename=users_import_template.xlsx")
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	if err := f.Write(c.Writer); err != nil {
		c.Status(http.StatusInternalServerError)
	}
}

// importValidate returns the handler that accepts the file for the given mode
// and starts validating it in the background.
func (h *Handler) importValidate(mode string) gin.HandlerFunc {
	return func(c *gin.Context) {
		actorID := utils.CurrentUserID(c)
		if actorID == nil {
			utils.Error(c, 401, "unauthorized")
			return
		}
		fh, err := c.FormFile("file")
		if err != nil {
			utils.Error(c, 400, "file wajib diisi")
			return
		}
		if fh.Size > maxImportBytes {
			utils.Error(c, 400, "ukuran file maksimal 5 MB")
			return
		}
		var fields []string
		if mode == importUpdate {
			for _, f := range c.PostFormArray("fields") {
				if updatableFields[f] && !hasField(fields, f) {
					fields = append(fields, f)
				}
			}
			if len(fields) == 0 {
				utils.Error(c, 400, "pilih minimal satu kolom yang akan diperbarui")
				return
			}
		}
		file, err := fh.Open()
		if err != nil {
			utils.Error(c, 400, "gagal membaca file")
			return
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, maxImportBytes+1))
		if err != nil || len(data) > maxImportBytes {
			utils.Error(c, 400, "gagal membaca file")
			return
		}
		wb, err := excelize.OpenReader(bytes.NewReader(data))
		if err != nil {
			utils.Error(c, 400, "file bukan Excel (.xlsx) yang valid")
			return
		}
		defer wb.Close()
		names := wb.GetSheetList()
		if len(names) == 0 {
			utils.Error(c, 400, "file tidak punya sheet")
			return
		}
		sheet, err := wb.GetRows(names[0])
		if err != nil {
			utils.Error(c, 400, "gagal membaca sheet")
			return
		}
		rows, err := parseImportRows(sheet)
		if err != nil {
			utils.Error(c, 400, err.Error())
			return
		}
		job := newImportJob(*actorID, utils.IsSuperadmin(c), mode, fields, rows)
		go h.Service.runImportValidation(job)
		utils.Success(c, 202, "memeriksa data", job.view())
	}
}

// ImportStatus godoc
// @Summary		Progress of an import job
// @Tags			users
// @Security		SessionCookie
// @Param			token	path	string	true	"Job token"
// @Success		200		{object}	utils.Response
// @Router			/users/import/jobs/{token} [get]
func (h *Handler) ImportStatus(c *gin.Context) {
	actorID := utils.CurrentUserID(c)
	if actorID == nil {
		utils.Error(c, 401, "unauthorized")
		return
	}
	job := findImportJob(c.Param("token"), *actorID)
	if job == nil {
		utils.Error(c, 404, "sesi import tidak ditemukan atau sudah kedaluwarsa")
		return
	}
	utils.Success(c, 200, "ok", job.view())
}

// importCommit returns the handler that applies a fully valid job.
func (h *Handler) importCommit(mode string) gin.HandlerFunc {
	return func(c *gin.Context) {
		actorID := utils.CurrentUserID(c)
		if actorID == nil {
			utils.Error(c, 401, "unauthorized")
			return
		}
		job := findImportJob(c.Param("token"), *actorID)
		if job == nil || job.mode != mode {
			utils.Error(c, 404, "sesi import tidak ditemukan atau sudah kedaluwarsa")
			return
		}
		job.mu.Lock()
		if job.status != jobValid {
			status := job.status
			job.mu.Unlock()
			utils.Error(c, 409, "data belum valid atau sudah diproses (status: "+status+")")
			return
		}
		job.status, job.processed = jobImporting, 0
		job.mu.Unlock()

		ip, ua := c.ClientIP(), c.Request.UserAgent() // gin.Context must not outlive the request
		go func() {
			h.Service.runImportCommit(job)
			v := job.view()
			if v.Status == jobDone {
				action := activity_logs.ActionCreate
				if mode == importUpdate {
					action = activity_logs.ActionUpdate
				}
				activity_logs.LogActivity(actorID, action, "users", "", nil,
					map[string]interface{}{"import": mode, "created": v.Created, "updated": v.Updated, "fields": job.fields},
					ip, ua)
			}
		}()
		utils.Success(c, 202, "import diproses", job.view())
	}
}
