package dev_tickets

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"gorm.io/gorm"
)

const (
	attachmentFolder = "dev_tickets"
	maxAttachments   = 10
)

type Service struct {
	db    *gorm.DB
	store storage.StorageInterface
}

type TicketInput struct {
	ReportedOn  string   `json:"reported_on"` // RFC 3339 or YYYY-MM-DD HH:mm, empty = now
	Platform    string   `json:"platform"`
	Role        string   `json:"role"`
	Module      string   `json:"module"`
	Issue       string   `json:"issue"`
	Steps       string   `json:"steps"`
	Expected    string   `json:"expected"`
	Attachments []string `json:"attachments"`
	Priority    string   `json:"priority"`
	Category    string   `json:"category"`
	Status      string   `json:"status"`
}

type ValidationError struct{ msg string }

func (e ValidationError) Error() string { return e.msg }

func invalid(format string, args ...interface{}) error {
	return ValidationError{fmt.Sprintf(format, args...)}
}

var wib = time.FixedZone("WIB", 7*3600)

func (in *TicketInput) normalize() error {
	in.Role = strings.TrimSpace(in.Role)
	in.Module, in.Issue = strings.TrimSpace(in.Module), strings.TrimSpace(in.Issue)
	in.Steps, in.Expected = strings.TrimSpace(in.Steps), strings.TrimSpace(in.Expected)
	if in.Status == "" {
		in.Status = StatusOpen
	}
	platform, ok := normalizePlatforms(in.Platform)
	in.Platform = platform
	switch {
	case !ok:
		return invalid("Platform wajib diisi, pilih dari: %s", strings.Join(Platforms, ", "))
	case in.Role != "" && !contains(Roles, in.Role):
		return invalid("Role harus salah satu dari: %s", strings.Join(Roles, ", "))
	case in.Module == "" || utf8.RuneCountInString(in.Module) > 120:
		return invalid("Modul wajib diisi (maks 120 karakter)")
	case in.Issue == "" || utf8.RuneCountInString(in.Issue) > 5000:
		return invalid("Issue wajib diisi (maks 5000 karakter)")
	case utf8.RuneCountInString(in.Steps) > 5000 || utf8.RuneCountInString(in.Expected) > 5000:
		return invalid("Langkah / hasil yang diharapkan maks 5000 karakter")
	case !contains(Priorities, in.Priority):
		return invalid("Priority harus salah satu dari: %s", strings.Join(Priorities, ", "))
	case !contains(Categories, in.Category):
		return invalid("Category harus salah satu dari: %s", strings.Join(Categories, ", "))
	case !contains(Statuses, in.Status):
		return invalid("Status tidak dikenal")
	case len(in.Attachments) > maxAttachments:
		return invalid("Maksimal %d lampiran", maxAttachments)
	}
	// Only files uploaded through this module may be attached, so a ticket
	// can't be used to expose another private file via /files.
	for _, p := range in.Attachments {
		if !strings.HasPrefix(p, attachmentFolder+"/") || strings.Contains(p, "..") {
			return invalid("Lampiran tidak valid")
		}
	}
	if in.Attachments == nil {
		in.Attachments = []string{}
	}
	return nil
}

// normalizePlatforms turns "ios,Android" into "Android, iOS": known names
// only, deduplicated, in Platforms order, so filters can split on ", ".
func normalizePlatforms(raw string) (string, bool) {
	picked := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		found := false
		for _, p := range Platforms {
			if strings.EqualFold(p, part) {
				picked[p], found = true, true
			}
		}
		if !found {
			return "", false
		}
	}
	out := []string{}
	for _, p := range Platforms {
		if picked[p] {
			out = append(out, p)
		}
	}
	return strings.Join(out, ", "), len(out) > 0
}

func (in *TicketInput) reportedOn() (time.Time, error) {
	if strings.TrimSpace(in.ReportedOn) == "" {
		return time.Now(), nil
	}
	d, err := parseDate(in.ReportedOn)
	if err != nil {
		return d, invalid("Tanggal & jam tidak valid (YYYY-MM-DD HH:mm)")
	}
	return d, nil
}

// parseDate accepts RFC 3339 (what the admin sends), local date-times and the
// dd/mm/yyyy [HH:mm] the QC spreadsheets use. Values without a zone are read
// as WIB; a date alone means 00:00.
func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if d, err := time.Parse(time.RFC3339, s); err == nil {
		return d, nil
	}
	for _, layout := range []string{
		"2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02",
		"02/01/2006 15:04", "2/1/2006 15:04", "02/01/2006", "2/1/2006", "02-01-2006",
	} {
		if d, err := time.ParseInLocation(layout, s, wib); err == nil {
			return d, nil
		}
	}
	return time.Time{}, errors.New("bad date")
}

type ListFilter struct {
	Platform string
	Role     string
	Priority string
	Category string
	Status   []string
	Module   string
}

var sortColumns = map[string]string{
	"number":      "id",
	"reported_on": "reported_on",
	"module":      "module",
	"updated_at":  "updated_at",
	"priority":    "CASE priority WHEN 'Critical' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END",
}

func (s *Service) List(p utils.Pagination, f ListFilter) ([]Ticket, int64, error) {
	q := s.db.Model(&Ticket{})
	if f.Platform != "" {
		q = q.Where("? = ANY(string_to_array(platform, ', '))", f.Platform)
	}
	for col, v := range map[string]string{"role": f.Role, "priority": f.Priority, "category": f.Category, "module": f.Module} {
		if v != "" {
			q = q.Where(col+" = ?", v)
		}
	}
	if len(f.Status) > 0 {
		q = q.Where("status IN ?", f.Status)
	}
	if t := strings.TrimSpace(p.Search); t != "" {
		if n, ok := ticketNumber(t); ok {
			q = q.Where("id = ?", n)
		} else {
			like := "%" + strings.NewReplacer("%", `\%`, "_", `\_`).Replace(t) + "%"
			q = q.Where("concat_ws(' ', module, issue, steps, expected, dev_note, reporter) ILIKE ?", like)
		}
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	col, ok := sortColumns[p.SortBy]
	if !ok {
		col = "id"
	}
	dir := "DESC"
	if p.SortDir == "asc" {
		dir = "ASC"
	}
	var list []Ticket
	err := q.Order(col + " " + dir).Order("id DESC").Offset(p.Offset).Limit(p.Limit).Find(&list).Error
	return list, total, err
}

// ticketNumber reads "12", "#12" or "T-12" as a ticket number.
func ticketNumber(s string) (uint64, bool) {
	s = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(strings.ToUpper(strings.TrimSpace(s)), "T-"), "#"))
	var n uint64
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil || fmt.Sprint(n) != s {
		return 0, false
	}
	return n, true
}

type Counts struct {
	Total    int64            `json:"total"`
	Status   map[string]int64 `json:"status"`
	OpenHigh int64            `json:"open_high"` // High/Critical not finished yet
}

func (s *Service) Counts() (Counts, error) {
	c := Counts{Status: map[string]int64{}}
	type row struct {
		K string
		N int64
	}
	var rows []row
	if err := s.db.Model(&Ticket{}).Select("status AS k, count(*) AS n").Group("status").Scan(&rows).Error; err != nil {
		return c, err
	}
	for _, r := range rows {
		c.Status[r.K] = r.N
		c.Total += r.N
	}
	err := s.db.Model(&Ticket{}).
		Where("priority IN ? AND status NOT IN ?", []string{"High", "Critical"}, []string{StatusDoneDev, StatusDeployed, StatusClosed}).
		Count(&c.OpenHigh).Error
	return c, err
}

func (s *Service) Modules() ([]string, error) {
	var mods []string
	err := s.db.Model(&Ticket{}).Distinct("module").Order("module").Pluck("module", &mods).Error
	return mods, err
}

func (s *Service) Find(number uint64) (*Ticket, error) {
	var t Ticket
	if err := s.db.First(&t, number).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Service) Comments(ticketID uint64) ([]Comment, error) {
	var list []Comment
	err := s.db.Where("ticket_id = ?", ticketID).Order("created_at ASC, id ASC").Find(&list).Error
	return list, err
}

func (s *Service) Create(in TicketInput, reporterID *uint64, reporter string) (*Ticket, error) {
	if err := in.normalize(); err != nil {
		return nil, err
	}
	day, err := in.reportedOn()
	if err != nil {
		return nil, err
	}
	t := &Ticket{
		ReportedOn: day, Platform: in.Platform, Role: in.Role, Module: in.Module,
		Issue: in.Issue, Steps: in.Steps, Expected: in.Expected, Attachments: in.Attachments,
		Priority: in.Priority, Category: in.Category, Status: in.Status,
		ReporterID: reporterID, Reporter: reporter,
	}
	return t, s.db.Create(t).Error
}

// Update edits the ticket fields; status changes are written to the
// timeline like any other status change.
func (s *Service) Update(t *Ticket, in TicketInput, author string) (*Ticket, *Ticket, error) {
	if err := in.normalize(); err != nil {
		return nil, nil, err
	}
	day, err := in.reportedOn()
	if err != nil {
		return nil, nil, err
	}
	before := *t
	removed := []string{}
	for _, p := range t.Attachments {
		if !contains(in.Attachments, p) {
			removed = append(removed, p)
		}
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		t.ReportedOn, t.Platform, t.Role, t.Module = day, in.Platform, in.Role, in.Module
		t.Issue, t.Steps, t.Expected, t.Attachments = in.Issue, in.Steps, in.Expected, in.Attachments
		t.Priority, t.Category = in.Priority, in.Category
		if err := s.applyStatus(tx, t, in.Status, "", author, false); err != nil {
			return err
		}
		return tx.Save(t).Error
	})
	if err != nil {
		return nil, nil, err
	}
	for _, p := range removed {
		_ = s.store.Delete(p)
	}
	return &before, t, nil
}

// SetStatus changes the ticket status (empty = unchanged) and records a
// timeline entry; note is kept as the latest development note.
func (s *Service) SetStatus(t *Ticket, status, note, author string, isClaude bool) (*Ticket, *Ticket, error) {
	if status != "" && !contains(Statuses, status) {
		return nil, nil, invalid("Status tidak dikenal")
	}
	if isClaude && status != "" && !contains(ClaudeStatuses, status) {
		return nil, nil, invalid("Claude hanya boleh set status: %s", strings.Join(ClaudeStatuses, ", "))
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > 20000 {
		return nil, nil, invalid("Catatan maks 20000 karakter")
	}
	before := *t
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if status == "" {
			status = t.Status
		}
		if err := s.applyStatus(tx, t, status, note, author, isClaude); err != nil {
			return err
		}
		return tx.Save(t).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &before, t, nil
}

func (s *Service) applyStatus(tx *gorm.DB, t *Ticket, status, note, author string, isClaude bool) error {
	var lines []string
	if status != t.Status {
		lines = append(lines, fmt.Sprintf("Status: %s → %s", StatusLabels[t.Status], StatusLabels[status]))
		t.Status = status
		now := time.Now()
		t.DevBy, t.DevAt = author, &now
	}
	if note != "" {
		t.DevNote = note
	}
	if len(lines) > 0 {
		if err := tx.Create(&Comment{TicketID: t.ID, Kind: "status", Author: author, IsClaude: isClaude, Body: strings.Join(lines, "\n")}).Error; err != nil {
			return err
		}
	}
	if note != "" {
		return tx.Create(&Comment{TicketID: t.ID, Kind: "comment", Author: author, IsClaude: isClaude, Body: note}).Error
	}
	return nil
}

func (s *Service) AddComment(t *Ticket, body, author string, isClaude bool) (*Comment, error) {
	body = strings.TrimSpace(body)
	if body == "" || utf8.RuneCountInString(body) > 20000 {
		return nil, invalid("Komentar wajib diisi (maks 20000 karakter)")
	}
	c := &Comment{TicketID: t.ID, Kind: "comment", Author: author, IsClaude: isClaude, Body: body}
	if err := s.db.Create(c).Error; err != nil {
		return nil, err
	}
	return c, s.db.Model(t).UpdateColumn("updated_at", time.Now()).Error
}

func (s *Service) Delete(t *Ticket) error {
	return s.db.Delete(t).Error
}

// Import creates tickets from rows pasted from the QC spreadsheet, all or
// nothing, so a bad row never leaves half an import behind.
func (s *Service) Import(rows []TicketInput, reporterID *uint64, reporter string) (int, error) {
	tickets := make([]Ticket, 0, len(rows))
	for i := range rows {
		in := rows[i]
		in.Attachments = nil
		if err := in.normalize(); err != nil {
			return 0, invalid("Baris %d: %s", i+1, err.Error())
		}
		day, err := in.reportedOn()
		if err != nil {
			return 0, invalid("Baris %d: %s", i+1, err.Error())
		}
		tickets = append(tickets, Ticket{
			ReportedOn: day, Platform: in.Platform, Role: in.Role, Module: in.Module,
			Issue: in.Issue, Steps: in.Steps, Expected: in.Expected, Attachments: []string{},
			Priority: in.Priority, Category: in.Category, Status: in.Status,
			ReporterID: reporterID, Reporter: reporter,
		})
	}
	if len(tickets) == 0 {
		return 0, invalid("Tidak ada baris untuk diimpor")
	}
	return len(tickets), s.db.CreateInBatches(&tickets, 100).Error
}
