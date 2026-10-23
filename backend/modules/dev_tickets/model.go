package dev_tickets

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Option lists double as validation; the admin form and the Claude CLI both
// read them from GET /dev-tickets/meta.
var (
	Platforms  = []string{"Android", "iOS", "Website", "Web Admin", "Backend"}
	Roles      = []string{"User", "Admin", "Super Admin", "Guest"}
	Priorities = []string{"Low", "Medium", "High", "Critical"}
	Categories = []string{"Bug", "Request", "Improvement"}
	QCStatuses = []string{"Open", "Reopen", "Closed"}
)

const (
	DevTodo         = "todo"
	DevInProgress   = "in_progress"
	DevNeedInfo     = "need_info"
	DevDoneByClaude = "done_by_claude"
	DevDone         = "done"
	DevWontFix      = "wont_fix"
)

var DevStatuses = []string{DevTodo, DevInProgress, DevNeedInfo, DevDoneByClaude, DevDone, DevWontFix}

var DevStatusLabels = map[string]string{
	DevTodo:         "To Do",
	DevInProgress:   "In Progress",
	DevNeedInfo:     "Butuh Info",
	DevDoneByClaude: "Done by Claude",
	DevDone:         "Done",
	DevWontFix:      "Won't Fix",
}

// Claude may only move a ticket through its own work; "done" (verified) and
// "wont_fix" stay human decisions.
var ClaudeStatuses = []string{DevInProgress, DevNeedInfo, DevDoneByClaude}

// Ticket is one QC finding (bug or request). Its number is the primary key,
// which is what people refer to ("tiket 12").
type Ticket struct {
	ID          uint64         `gorm:"primaryKey;autoIncrement" json:"number"`
	UUID        uuid.UUID      `gorm:"type:uuid;uniqueIndex;not null" json:"uuid"`
	ReportedOn  time.Time      `gorm:"type:date;not null;index" json:"reported_on"`
	Platform    string         `gorm:"type:varchar(60);not null;index" json:"platform"` // "Android, iOS", see normalizePlatforms
	Role        string         `gorm:"type:varchar(20);not null" json:"role"`
	Module      string         `gorm:"type:varchar(120);not null" json:"module"`
	Issue       string         `gorm:"type:text;not null" json:"issue"`
	Steps       string         `gorm:"type:text" json:"steps"`
	Expected    string         `gorm:"type:text" json:"expected"`
	Attachments []string       `gorm:"type:text;serializer:json" json:"attachments"`
	Priority    string         `gorm:"type:varchar(10);not null;index" json:"priority"`
	Category    string         `gorm:"type:varchar(20);not null;index" json:"category"`
	QCStatus    string         `gorm:"type:varchar(10);not null;index" json:"qc_status"`
	DevStatus   string         `gorm:"type:varchar(20);not null;index" json:"dev_status"`
	DevNote     string         `gorm:"type:text" json:"dev_note"`
	DevBy       string         `gorm:"type:varchar(100)" json:"dev_by"`
	DevAt       *time.Time     `json:"dev_at"`
	ReporterID  *uint64        `json:"-"`
	Reporter    string         `gorm:"type:varchar(255)" json:"reporter"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Ticket) TableName() string { return "dev_tickets" }

func (t *Ticket) BeforeCreate(tx *gorm.DB) error {
	if t.UUID == uuid.Nil {
		t.UUID = uuid.New()
	}
	return nil
}

// Comment is the ticket's timeline: notes from QC/staff, Claude's reports
// and automatic status-change entries (Kind "status").
type Comment struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"-"`
	UUID      uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"uuid"`
	TicketID  uint64    `gorm:"not null;index" json:"-"`
	Kind      string    `gorm:"type:varchar(10);not null" json:"kind"` // comment | status
	Author    string    `gorm:"type:varchar(255);not null" json:"author"`
	IsClaude  bool      `gorm:"not null;default:false" json:"is_claude"`
	Body      string    `gorm:"type:text;not null" json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

func (Comment) TableName() string { return "dev_ticket_comments" }

func (c *Comment) BeforeCreate(tx *gorm.DB) error {
	if c.UUID == uuid.Nil {
		c.UUID = uuid.New()
	}
	return nil
}

// APIToken lets a Claude Code session on a developer's machine read tickets
// and report progress over HTTP. Only the sha256 is stored; the plain token
// is shown once on creation.
type APIToken struct {
	ID         uint64     `gorm:"primaryKey;autoIncrement" json:"-"`
	UUID       uuid.UUID  `gorm:"type:uuid;uniqueIndex;not null" json:"uuid"`
	Name       string     `gorm:"type:varchar(100);not null" json:"name"`
	TokenHash  string     `gorm:"type:varchar(64);uniqueIndex;not null" json:"-"`
	Prefix     string     `gorm:"type:varchar(16);not null" json:"prefix"`
	CreatedBy  string     `gorm:"type:varchar(255)" json:"created_by"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

func (APIToken) TableName() string { return "dev_api_tokens" }

func (t *APIToken) BeforeCreate(tx *gorm.DB) error {
	if t.UUID == uuid.Nil {
		t.UUID = uuid.New()
	}
	return nil
}

func contains(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
