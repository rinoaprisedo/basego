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
	ReportedOn  string   `json:"reported_on"` // YYYY-MM-DD, empty = today
	Platform    string   `json:"platform"`
	Role        string   `json:"role"`
	Module      string   `json:"module"`
	Issue       string   `json:"issue"`
	Steps       string   `json:"steps"`
	Expected    string   `json:"expected"`
	Attachments []string `json:"attachments"`
	Priority    string   `json:"priority"`
	Category    string   `json:"category"`
	QCStatus    string   `json:"qc_status"`
	DevStatus   string   `json:"dev_status"`
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
	if in.QCStatus == "" {
		in.QCStatus = "Open"
	}
	if in.DevStatus == "" {
		in.DevStatus = DevTodo
	}
	platform, ok := normalizePlatforms(in.Platform)
	in.Platform = platform
	switch {
	case !ok:
		return invalid("Platform wajib diisi, pilih dari: %s", strings.Join(Platforms, ", "))
	case !contains(Roles, in.Role):
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
	case !contains(QCStatuses, in.QCStatus):
		return invalid("QC status tidak dikenal")
	case !contains(DevStatuses, in.DevStatus):
		return invalid("Status development tidak dikenal")
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
		now := time.Now().In(wib)
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
	}
	d, err := parseDate(in.ReportedOn)
	if err != nil {
		return d, invalid("Tanggal tidak valid (YYYY-MM-DD)")
	}
	return d, nil
}

// parseDate accepts ISO dates and the dd/mm/yyyy QC spreadsheets use.
func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	for _, layout := range []string{"2006-01-02", "02/01/2006", "2/1/2006", "02-01-2006"} {
		if d, err := time.Parse(layout, s); err == nil {
			return d, nil
		}
	}
	return time.Time{}, errors.New("bad date")
}

type ListFilter struct {
	Platform  string
	Role      string
	Priority  string
	Category  string
	QCStatus  string
	DevStatus []string
	Module    string
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
	for col, v := range map[string]string{"role": f.Role, "priority": f.Priority, "category": f.Category, "qc_status": f.QCStatus, "module": f.Module} {
		if v != "" {
			q = q.Where(col+" = ?", v)
		}
	}
	if len(f.DevStatus) > 0 {
		q = q.Where("dev_status IN ?", f.DevStatus)
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
	Total     int64            `json:"total"`
	DevStatus map[string]int64 `json:"dev_status"`
	QCStatus  map[string]int64 `json:"qc_status"`
	OpenHigh  int64            `json:"open_high"` // High/Critical not done yet
}

func (s *Service) Counts() (Counts, error) {
	c := Counts{DevStatus: map[string]int64{}, QCStatus: map[string]int64{}}
	type row struct {
		K string
		N int64
	}
	var rows []row
	if err := s.db.Model(&Ticket{}).Select("dev_status AS k, count(*) AS n").Group("dev_status").Scan(&rows).Error; err != nil {
		return c, err
	}
	for _, r := range rows {
		c.DevStatus[r.K] = r.N
		c.Total += r.N
	}
	rows = nil
	if err := s.db.Model(&Ticket{}).Select("qc_status AS k, count(*) AS n").Group("qc_status").Scan(&rows).Error; err != nil {
		return c, err
	}
	for _, r := range rows {
		c.QCStatus[r.K] = r.N
	}
	err := s.db.Model(&Ticket{}).
		Where("priority IN ? AND dev_status NOT IN ?", []string{"High", "Critical"}, []string{DevDone, DevDoneByClaude, DevWontFix}).
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
		Priority: in.Priority, Category: in.Category, QCStatus: in.QCStatus, DevStatus: in.DevStatus,
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
		if err := s.applyStatus(tx, t, in.QCStatus, in.DevStatus, "", author, false); err != nil {
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

// SetStatus changes QC and/or development status (empty = unchanged) and
// records a timeline entry; note is kept as the latest development note.
func (s *Service) SetStatus(t *Ticket, qc, dev, note, author string, isClaude bool) (*Ticket, *Ticket, error) {
	if qc != "" && !contains(QCStatuses, qc) {
		return nil, nil, invalid("QC status tidak dikenal")
	}
	if dev != "" && !contains(DevStatuses, dev) {
		return nil, nil, invalid("Status development tidak dikenal")
	}
	if isClaude && dev != "" && !contains(ClaudeStatuses, dev) {
		return nil, nil, invalid("Claude hanya boleh set status: %s", strings.Join(ClaudeStatuses, ", "))
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > 20000 {
		return nil, nil, invalid("Catatan maks 20000 karakter")
	}
	before := *t
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if qc == "" {
			qc = t.QCStatus
		}
		if dev == "" {
			dev = t.DevStatus
		}
		if err := s.applyStatus(tx, t, qc, dev, note, author, isClaude); err != nil {
			return err
		}
		return tx.Save(t).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &before, t, nil
}

func (s *Service) applyStatus(tx *gorm.DB, t *Ticket, qc, dev, note, author string, isClaude bool) error {
	var lines []string
	if qc != t.QCStatus {
		lines = append(lines, fmt.Sprintf("QC status: %s → %s", t.QCStatus, qc))
		t.QCStatus = qc
		// QC reopening sends the ticket back to the dev queue.
		if qc == "Reopen" && (dev == t.DevStatus) && (dev == DevDone || dev == DevDoneByClaude) {
			dev = DevTodo
		}
	}
	if dev != t.DevStatus {
		lines = append(lines, fmt.Sprintf("Status development: %s → %s", DevStatusLabels[t.DevStatus], DevStatusLabels[dev]))
		t.DevStatus = dev
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
			Priority: in.Priority, Category: in.Category, QCStatus: in.QCStatus, DevStatus: in.DevStatus,
			ReporterID: reporterID, Reporter: reporter,
		})
	}
	if len(tickets) == 0 {
		return 0, invalid("Tidak ada baris untuk diimpor")
	}
	return len(tickets), s.db.CreateInBatches(&tickets, 100).Error
}
