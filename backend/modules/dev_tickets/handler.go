package dev_tickets

import (
	"errors"
	"strconv"
	"strings"

	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const menu = "dev-tickets"

type Handler struct {
	db  *gorm.DB
	svc *Service
}

// NewHandler takes the private store: QC screenshots often show member data,
// so they're served through the permission-checked /files endpoint.
func NewHandler(db *gorm.DB, private storage.StorageInterface) *Handler {
	return &Handler{db: db, svc: &Service{db: db, store: private}}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, guard func(menuPath, action string) gin.HandlerFunc, uploadLimiter gin.HandlerFunc) {
	g := rg.Group("/dev-tickets")
	g.GET("/meta", guard(menu, "view"), h.Meta)
	g.GET("", guard(menu, "view"), h.List)
	g.POST("", guard(menu, "create"), h.Create)
	g.POST("/import", guard(menu, "create"), h.Import)
	g.POST("/attachments", guard(menu, "create"), uploadLimiter, h.Upload)
	g.GET("/tokens", guard(menu, "view"), h.ListTokens)
	g.POST("/tokens", guard(menu, "edit"), h.CreateToken)
	g.DELETE("/tokens/:uuid", guard(menu, "edit"), h.DeleteToken)
	g.GET("/:number", guard(menu, "view"), h.Get)
	g.PUT("/:number", guard(menu, "edit"), h.Update)
	g.PATCH("/:number/status", guard(menu, "edit"), h.SetStatus)
	g.POST("/:number/comments", guard(menu, "edit"), h.Comment)
	g.DELETE("/:number", guard(menu, "delete"), h.Delete)
}

func respondErr(c *gin.Context, err error, fallback string) {
	var v ValidationError
	if errors.As(err, &v) {
		utils.Error(c, 400, v.Error())
		return
	}
	utils.Error(c, 500, fallback)
}

func (h *Handler) actorName(c *gin.Context) string {
	id := utils.CurrentUserID(c)
	if id == nil {
		return "Staff"
	}
	var name string
	h.db.Table("users").Select("name").Where("id = ?", *id).Scan(&name)
	if name == "" {
		return "Staff"
	}
	return name
}

func (h *Handler) find(c *gin.Context) *Ticket {
	n, err := strconv.ParseUint(c.Param("number"), 10, 64)
	if err != nil {
		utils.Error(c, 404, "tiket tidak ditemukan")
		return nil
	}
	t, err := h.svc.Find(n)
	if err != nil {
		utils.Error(c, 404, "tiket tidak ditemukan")
		return nil
	}
	return t
}

func listFilter(c *gin.Context) ListFilter {
	f := ListFilter{
		Platform: c.Query("platform"), Role: c.Query("role"), Priority: c.Query("priority"),
		Category: c.Query("category"), QCStatus: c.Query("qc_status"), Module: c.Query("module"),
	}
	for _, s := range strings.Split(c.Query("dev_status"), ",") {
		if s = strings.TrimSpace(s); s != "" {
			f.DevStatus = append(f.DevStatus, s)
		}
	}
	return f
}

func meta(svc *Service) (gin.H, error) {
	counts, err := svc.Counts()
	if err != nil {
		return nil, err
	}
	modules, err := svc.Modules()
	if err != nil {
		return nil, err
	}
	statuses := make([]gin.H, 0, len(DevStatuses))
	for _, s := range DevStatuses {
		statuses = append(statuses, gin.H{"value": s, "label": DevStatusLabels[s]})
	}
	return gin.H{
		"platforms": Platforms, "roles": Roles, "priorities": Priorities, "categories": Categories,
		"qc_statuses": QCStatuses, "dev_statuses": statuses, "claude_statuses": ClaudeStatuses,
		"modules": modules, "counts": counts,
	}, nil
}

// Meta godoc
// @Summary		Ticket option lists, known modules and status counts
// @Tags			dev-tickets
// @Security		SessionCookie
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/meta [get]
func (h *Handler) Meta(c *gin.Context) {
	m, err := meta(h.svc)
	if err != nil {
		utils.Error(c, 500, "gagal memuat data tiket")
		return
	}
	utils.Success(c, 200, "ok", m)
}

// List godoc
// @Summary		List QC tickets
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			search		query	string	false	"Ticket number (12, #12) or text"
// @Param			dev_status	query	string	false	"Comma-separated: todo,in_progress,need_info,done_by_claude,done,wont_fix"
// @Param			platform	query	string	false	"Platform"
// @Param			priority	query	string	false	"Priority"
// @Param			category	query	string	false	"Category"
// @Param			qc_status	query	string	false	"Open|Reopen|Closed"
// @Param			sort_by		query	string	false	"number|reported_on|priority|module|updated_at"
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets [get]
func (h *Handler) List(c *gin.Context) {
	p := utils.GetPagination(c, "number")
	list, total, err := h.svc.List(p, listFilter(c))
	if err != nil {
		utils.Error(c, 500, "gagal memuat tiket")
		return
	}
	utils.SuccessList(c, "ok", list, utils.BuildMeta(p.Page, p.Limit, total))
}

// Get godoc
// @Summary		Get a ticket with its timeline
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			number	path	int	true	"Ticket number"
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/{number} [get]
func (h *Handler) Get(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	comments, err := h.svc.Comments(t.ID)
	if err != nil {
		utils.Error(c, 500, "gagal memuat timeline")
		return
	}
	utils.Success(c, 200, "ok", gin.H{"ticket": t, "comments": comments})
}

// Create godoc
// @Summary		Create a QC ticket
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			body	body	TicketInput	true	"Ticket"
// @Success		201	{object}	utils.Response
// @Router			/dev-tickets [post]
func (h *Handler) Create(c *gin.Context) {
	var in TicketInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	t, err := h.svc.Create(in, utils.CurrentUserID(c), h.actorName(c))
	if err != nil {
		respondErr(c, err, "gagal membuat tiket")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionCreate, menu, t.UUID.String(), nil, t, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, "Tiket dibuat", t)
}

// Import godoc
// @Summary		Create many tickets at once (rows pasted from the QC spreadsheet)
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			body	body	object	true	"{rows: TicketInput[]}"
// @Success		201	{object}	utils.Response
// @Router			/dev-tickets/import [post]
func (h *Handler) Import(c *gin.Context) {
	var body struct {
		Rows []TicketInput `json:"rows"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Rows) > 500 {
		utils.Error(c, 400, "invalid request payload (maks 500 baris)")
		return
	}
	n, err := h.svc.Import(body.Rows, utils.CurrentUserID(c), h.actorName(c))
	if err != nil {
		respondErr(c, err, "gagal mengimpor tiket")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionCreate, menu, "import", nil, gin.H{"rows": n}, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, strconv.Itoa(n)+" tiket diimpor", gin.H{"count": n})
}

// Upload godoc
// @Summary		Upload a ticket screenshot (returns the private path to put in attachments)
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			file	formData	file	true	"Image"
// @Success		201	{object}	utils.Response
// @Router			/dev-tickets/attachments [post]
func (h *Handler) Upload(c *gin.Context) {
	header, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, 400, "file wajib diisi")
		return
	}
	f, err := header.Open()
	if err != nil {
		utils.Error(c, 400, "file tidak bisa dibaca")
		return
	}
	defer f.Close()
	path, err := h.svc.store.Upload(f, header, attachmentFolder)
	if err != nil {
		utils.Error(c, 400, err.Error())
		return
	}
	utils.Success(c, 201, "ok", gin.H{"path": path})
}

// Update godoc
// @Summary		Edit a ticket
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			number	path	int			true	"Ticket number"
// @Param			body	body	TicketInput	true	"Ticket"
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/{number} [put]
func (h *Handler) Update(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	var in TicketInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	before, after, err := h.svc.Update(t, in, h.actorName(c))
	if err != nil {
		respondErr(c, err, "gagal menyimpan tiket")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionUpdate, menu, t.UUID.String(), before, after, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "Tiket disimpan", after)
}

type StatusInput struct {
	QCStatus  string `json:"qc_status"`
	DevStatus string `json:"dev_status"`
	Note      string `json:"note"`
}

// SetStatus godoc
// @Summary		Change QC and/or development status of a ticket
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			number	path	int			true	"Ticket number"
// @Param			body	body	StatusInput	true	"Empty fields stay unchanged"
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/{number}/status [patch]
func (h *Handler) SetStatus(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	var in StatusInput
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	before, after, err := h.svc.SetStatus(t, in.QCStatus, in.DevStatus, in.Note, h.actorName(c), false)
	if err != nil {
		respondErr(c, err, "gagal mengubah status")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionUpdate, menu, t.UUID.String(), before, after, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "Status diubah", after)
}

// Comment godoc
// @Summary		Add a note to the ticket timeline
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			number	path	int		true	"Ticket number"
// @Param			body	body	object	true	"{body}"
// @Success		201	{object}	utils.Response
// @Router			/dev-tickets/{number}/comments [post]
func (h *Handler) Comment(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, 400, "invalid request payload")
		return
	}
	cm, err := h.svc.AddComment(t, in.Body, h.actorName(c), false)
	if err != nil {
		respondErr(c, err, "gagal menyimpan komentar")
		return
	}
	utils.Success(c, 201, "ok", cm)
}

// Delete godoc
// @Summary		Delete a ticket
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			number	path	int	true	"Ticket number"
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/{number} [delete]
func (h *Handler) Delete(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	if err := h.svc.Delete(t); err != nil {
		utils.Error(c, 500, "gagal menghapus tiket")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionDelete, menu, t.UUID.String(), t, nil, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "Tiket dihapus", nil)
}
