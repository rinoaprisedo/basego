package dev_tickets

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// APIPrefix is mounted outside the cookie session: requests carry
// "Authorization: Bearer <token>" and no cookies, so the CSRF and XSS
// middlewares skip it (a browser can't attach that header cross-site, and
// Claude's notes legitimately contain code like <Component>).
const APIPrefix = "/api/v1/dev-api/"

const tokenPrefix = "basego_dev_"

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// ListTokens godoc
// @Summary		List Claude API tokens for the ticket API
// @Tags			dev-tickets
// @Security		SessionCookie
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/tokens [get]
func (h *Handler) ListTokens(c *gin.Context) {
	var list []APIToken
	if err := h.db.Order("created_at DESC").Find(&list).Error; err != nil {
		utils.Error(c, 500, "gagal memuat token")
		return
	}
	utils.Success(c, 200, "ok", list)
}

// CreateToken godoc
// @Summary		Create a Claude API token (the plain token is returned only once)
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			body	body	object	true	"{name}"
// @Success		201	{object}	utils.Response
// @Router			/dev-tickets/tokens [post]
func (h *Handler) CreateToken(c *gin.Context) {
	var in struct {
		Name string `json:"name"`
	}
	_ = c.ShouldBindJSON(&in)
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 100 {
		utils.Error(c, 400, "Nama token wajib diisi (maks 100 karakter)")
		return
	}
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		utils.Error(c, 500, "gagal membuat token")
		return
	}
	plain := tokenPrefix + hex.EncodeToString(b)
	t := &APIToken{Name: in.Name, TokenHash: hashToken(plain), Prefix: plain[:len(tokenPrefix)+4], CreatedBy: h.actorName(c)}
	if err := h.db.Create(t).Error; err != nil {
		utils.Error(c, 500, "gagal membuat token")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionCreate, "dev-api-tokens", t.UUID.String(), nil, t, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 201, "Token dibuat", gin.H{"token": plain, "info": t})
}

// DeleteToken godoc
// @Summary		Revoke a Claude API token
// @Tags			dev-tickets
// @Security		SessionCookie
// @Param			uuid	path	string	true	"Token UUID"
// @Success		200	{object}	utils.Response
// @Router			/dev-tickets/tokens/{uuid} [delete]
func (h *Handler) DeleteToken(c *gin.Context) {
	if _, err := uuid.Parse(c.Param("uuid")); err != nil {
		utils.Error(c, 404, "token tidak ditemukan")
		return
	}
	var t APIToken
	if err := h.db.Where("uuid = ?", c.Param("uuid")).First(&t).Error; err != nil {
		utils.Error(c, 404, "token tidak ditemukan")
		return
	}
	if err := h.db.Delete(&t).Error; err != nil {
		utils.Error(c, 500, "gagal mencabut token")
		return
	}
	activity_logs.LogActivity(utils.CurrentUserID(c), activity_logs.ActionDelete, "dev-api-tokens", t.UUID.String(), t, nil, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "Token dicabut", nil)
}

const ctxToken = "dev_api_token"

func (h *Handler) bearer(c *gin.Context) {
	auth := c.GetHeader("Authorization")
	plain := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	if !strings.HasPrefix(auth, "Bearer ") || !strings.HasPrefix(plain, tokenPrefix) {
		utils.Error(c, 401, "Authorization: Bearer <token> wajib (buat token di menu Tiket → Akses Claude)")
		c.Abort()
		return
	}
	var t APIToken
	if err := h.db.Where("token_hash = ?", hashToken(plain)).First(&t).Error; err != nil {
		utils.Error(c, 401, "token tidak valid atau sudah dicabut")
		c.Abort()
		return
	}
	if t.LastUsedAt == nil || time.Since(*t.LastUsedAt) > time.Minute {
		h.db.Model(&t).UpdateColumn("last_used_at", time.Now())
	}
	c.Set(ctxToken, &t)
	c.Next()
}

func claudeAuthor(c *gin.Context) string {
	if t, ok := c.Get(ctxToken); ok {
		return "Claude (" + t.(*APIToken).Name + ")"
	}
	return "Claude"
}

// RegisterClaudeRoutes mounts the API the Claude Code CLI helper
// (backend/cmd/ticket) talks to. Responses are the same JSON shapes as the
// admin endpoints, plus attachment download.
func (h *Handler) RegisterClaudeRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/dev-api", h.bearer)
	g.GET("/meta", h.Meta)
	g.GET("/tickets", h.List)
	g.GET("/tickets/:number", h.Get)
	g.GET("/tickets/:number/attachments/:index", h.claudeAttachment)
	g.POST("/tickets/:number/status", h.claudeStatus)
	g.POST("/tickets/:number/comments", h.claudeComment)
}

func (h *Handler) claudeAttachment(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	i, err := strconv.Atoi(c.Param("index"))
	if err != nil || i < 0 || i >= len(t.Attachments) {
		utils.Error(c, 404, "lampiran tidak ditemukan")
		return
	}
	obj, err := h.svc.store.Open(t.Attachments[i])
	if err != nil {
		if !errors.Is(err, storage.ErrNotFound) {
			log.Printf("dev ticket attachment %s: %v", t.Attachments[i], err)
		}
		utils.Error(c, 404, "lampiran tidak ditemukan")
		return
	}
	storage.Serve(c.Writer, c.Request, obj, t.Attachments[i])
}

func (h *Handler) claudeStatus(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Status == "" {
		utils.Error(c, 400, "body {status, note} wajib; status: "+strings.Join(ClaudeStatuses, "|"))
		return
	}
	before, after, err := h.svc.SetStatus(t, "", in.Status, in.Note, claudeAuthor(c), true)
	if err != nil {
		respondErr(c, err, "gagal mengubah status")
		return
	}
	activity_logs.LogActivity(nil, activity_logs.ActionUpdate, menu, t.UUID.String(), before, after, c.ClientIP(), c.Request.UserAgent())
	utils.Success(c, 200, "Status diubah", after)
}

func (h *Handler) claudeComment(c *gin.Context) {
	t := h.find(c)
	if t == nil {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.Error(c, 400, "body {body} wajib")
		return
	}
	cm, err := h.svc.AddComment(t, in.Body, claudeAuthor(c), true)
	if err != nil {
		respondErr(c, err, "gagal menyimpan komentar")
		return
	}
	utils.Success(c, 201, "ok", cm)
}
