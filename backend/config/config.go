package config

import (
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv      string
	AppPort     string
	FrontendURL string
	// TrustedProxies is a comma-separated list of proxy IPs/CIDRs whose
	// X-Forwarded-For is honoured. Empty (default) = trust none, so
	// c.ClientIP() is the real TCP peer and can't be spoofed to dodge rate
	// limits and login lockout.
	TrustedProxies string

	DBDriver string
	DBHost   string
	DBPort   string
	DBUser   string
	DBPass   string
	DBName   string

	RedisHost string
	RedisPort string
	RedisPass string
	RedisDB   int

	// AuthzCacheTTL (seconds) bounds how long identity/permission lookups are
	// cached in-process. 0 disables the cache.
	AuthzCacheTTL int

	SessionMaxAge        int
	SessionMaxConcurrent int

	StoragePath string
	// PrivateStoragePath is derived (sibling of StoragePath, never served by
	// /uploads): files here are only reachable through the permission-checked
	// /api/v1/files endpoint.
	PrivateStoragePath string
	StorageMaxSize     int64

	LogCleanupDays           int
	RateLimitLogin           int
	RateLimitLoginLockoutMin int
	RateLimitAPI             int
	// RateLimitLoginAccount: failed logins per ACCOUNT (any IP) within 15 min
	// before that account is locked for RateLimitLoginLockoutMin. 0 disables.
	RateLimitLoginAccount int
	// BcryptMaxConcurrent caps simultaneous bcrypt operations so a login flood
	// cannot take every CPU core away from the rest of the API.
	BcryptMaxConcurrent int
}

var Cfg *Config

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, relying on environment variables")
	}

	Cfg = &Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		AppPort:        getEnv("APP_PORT", "8800"),
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:8801,http://localhost:8802"),
		TrustedProxies: getEnv("TRUSTED_PROXIES", ""),

		DBDriver: getEnv("DB_DRIVER", "postgres"),
		DBHost:   getEnv("DB_HOST", "localhost"),
		DBPort:   getEnv("DB_PORT", "5401"),
		DBUser:   getEnv("DB_USER", "postgres"),
		DBPass:   getEnv("DB_PASS", "password"),
		DBName:   getEnv("DB_NAME", "baseadmin"),

		RedisHost: getEnv("REDIS_HOST", "localhost"),
		RedisPort: getEnv("REDIS_PORT", "6301"),
		RedisPass: getEnv("REDIS_PASS", ""),
		RedisDB:   getEnvInt("REDIS_DB", 0),

		AuthzCacheTTL: getEnvInt("AUTHZ_CACHE_TTL_SECONDS", 5),

		SessionMaxAge:        getEnvInt("SESSION_MAX_AGE", 86400),
		SessionMaxConcurrent: getEnvInt("SESSION_MAX_CONCURRENT", 3),

		StoragePath:    getEnv("STORAGE_PATH", "./storage/uploads"),
		StorageMaxSize: int64(getEnvInt("STORAGE_MAX_SIZE", 2097152)),

		LogCleanupDays:           getEnvInt("LOG_CLEANUP_DAYS", 90),
		RateLimitLogin:           getEnvInt("RATE_LIMIT_LOGIN", 5),
		RateLimitLoginLockoutMin: getEnvInt("RATE_LIMIT_LOGIN_LOCKOUT_MINUTES", 15),
		RateLimitAPI:             getEnvInt("RATE_LIMIT_API", 100),
		RateLimitLoginAccount:    getEnvInt("RATE_LIMIT_LOGIN_ACCOUNT", 10),
		BcryptMaxConcurrent:      getEnvInt("BCRYPT_MAX_CONCURRENT", defaultBcryptConcurrency()),
	}

	Cfg.PrivateStoragePath = filepath.Join(filepath.Dir(filepath.Clean(Cfg.StoragePath)), "private")

	return Cfg
}

// defaultBcryptConcurrency leaves roughly half the cores free for non-login
// traffic while a login flood is in progress.
func defaultBcryptConcurrency() int {
	if n := runtime.NumCPU() / 2; n > 1 {
		return n
	}
	return 1
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
