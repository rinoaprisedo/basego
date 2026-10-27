// Package main wires up the BaseProject backend: config, database, redis,
// middleware stack, module routes, and the migrate/seed CLI subcommands.
//
// @title						BaseProject API
// @version					1.2.0
// @description				Admin Panel Base Project API
// @host						localhost:8800
// @BasePath					/api/v1
// @securityDefinitions.apikey	SessionCookie
// @in							cookie
// @name						session
//
//go:generate swag init -g main.go -o docs
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"baseadmin/backend/config"
	"baseadmin/backend/database/migrations"
	"baseadmin/backend/database/seeders"
	_ "baseadmin/backend/docs"
	"baseadmin/backend/middleware"
	"baseadmin/backend/modules/activity_logs"
	"baseadmin/backend/modules/auth"
	"baseadmin/backend/modules/dev_tickets"
	"baseadmin/backend/modules/files"
	"baseadmin/backend/modules/menus"
	"baseadmin/backend/modules/roles"
	"baseadmin/backend/modules/settings"
	"baseadmin/backend/modules/users"
	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// AppVersion is surfaced unauthenticated at GET /api/v1/version for the
// frontend footer — bump alongside the @version annotation above.
const AppVersion = "1.2.0"

func main() {
	cfg := config.Load()

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "migrate":
			db := config.ConnectDatabase(cfg)
			migrations.Run(db)
			return
		case "seed":
			db := config.ConnectDatabase(cfg)
			seeders.Run(db)
			return
		}
	}

	db := config.ConnectDatabase(cfg)
	rdb := config.ConnectRedis(cfg)
	activity_logs.StartWorker(db)

	localStorage := storage.NewLocalStorage(cfg.StoragePath, "/uploads", cfg.StorageMaxSize)
	// QC screenshots often show private data: served only via /api/v1/files.
	privateStorage := storage.NewLocalStorage(cfg.PrivateStoragePath, "/api/v1/files", cfg.StorageMaxSize)

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New()
	if err := router.SetTrustedProxies(splitList(cfg.TrustedProxies)); err != nil {
		log.Fatalf("invalid TRUSTED_PROXIES: %v", err)
	}
	router.Use(gin.Recovery())
	router.Use(middleware.CORSMiddleware(cfg.FrontendURL))
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.RequestSizeLimit(10 << 20))
	router.Use(middleware.CSRF(cfg.AppEnv == "production", dev_tickets.APIPrefix))
	router.Use(middleware.XSSSanitizer(dev_tickets.APIPrefix))
	router.Use(middleware.MaintenanceMode(rdb, db))
	router.Use(middleware.RateLimit(rdb, "api", cfg.RateLimitAPI, time.Minute, func(c *gin.Context) string { return c.ClientIP() }))

	router.Static("/uploads", cfg.StoragePath)

	authz := middleware.NewAuthCache(db, time.Duration(cfg.AuthzCacheTTL)*time.Second)
	sessionAuth := middleware.SessionAuth(rdb, authz)
	guard := middleware.NewGuard(rdb, authz)
	requireSuperadmin := func(c *gin.Context) {
		if !utils.IsSuperadmin(c) {
			utils.Error(c, 403, "superadmin access required")
			c.Abort()
			return
		}
		c.Next()
	}

	if cfg.AppEnv != "production" {
		router.GET("/swagger/*any", sessionAuth, requireSuperadmin, ginSwagger.WrapHandler(swaggerFiles.Handler))
	}
	uploadLimiter := middleware.RateLimit(rdb, "upload", 10, time.Minute, func(c *gin.Context) string {
		return c.ClientIP()
	})

	api := router.Group("/api/v1")

	api.GET("/version", func(c *gin.Context) {
		utils.Success(c, 200, "ok", gin.H{"version": AppVersion})
	})

	authHandler := auth.NewHandler(db, rdb, cfg)
	authHandler.RegisterRoutes(api, sessionAuth)

	usersHandler := users.NewHandler(db, cfg, localStorage, rdb)
	usersHandler.RegisterRoutes(api, guard, uploadLimiter)

	rolesHandler := roles.NewHandler(db)
	rolesHandler.RegisterRoutes(api, guard)

	menusHandler := menus.NewHandler(db)
	menusHandler.RegisterRoutes(api, sessionAuth, guard)
	menusHandler.RegisterSectionRoutes(api, guard)

	settingsHandler := settings.NewHandler(db, rdb, localStorage)
	settingsHandler.RegisterRoutes(api, guard, uploadLimiter)

	activityLogsHandler := activity_logs.NewHandler(db, cfg)
	activityLogsHandler.RegisterRoutes(api, guard)

	filesHandler := files.NewHandler(privateStorage)
	filesHandler.RegisterRoutes(api, guard)

	devTicketsHandler := dev_tickets.NewHandler(db, privateStorage)
	devTicketsHandler.RegisterRoutes(api, guard, uploadLimiter)
	devTicketsHandler.RegisterClaudeRoutes(api)

	log.Printf("BaseProject backend listening on :%s (env=%s)", cfg.AppPort, cfg.AppEnv)
	// Explicit timeouts: router.Run() has none, which leaves the server open to
	// slow-header/slow-body (Slowloris) connections that pin goroutines.
	srv := &http.Server{
		Addr:              ":" + cfg.AppPort,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-serveErr:
		log.Fatalf("server failed: %v", err)
	case sig := <-stop:
		log.Printf("received %s, shutting down gracefully", sig)
		// Let in-flight requests finish (e.g. a deploy/restart) instead of
		// cutting connections mid-response.
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("graceful shutdown incomplete: %v", err)
		}
	}
}

// splitList turns "a, b,c" into ["a","b","c"], dropping blanks. A nil result
// makes gin trust no proxy at all.
func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
