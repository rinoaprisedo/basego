package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	AppName     string
	AppEnv      string
	AppPort     string
	AppSecret   string
	FrontendURL string

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

	SessionSecret        string
	SessionMaxAge        int
	SessionMaxConcurrent int

	StorageDriver  string
	StoragePath    string
	StorageMaxSize int64

	MailHost string
	MailPort string
	MailUser string
	MailPass string
	MailFrom string

	LogCleanupDays int
	RateLimitLogin int
	RateLimitAPI   int
}

var Cfg *Config

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, relying on environment variables")
	}

	Cfg = &Config{
		AppName:     getEnv("APP_NAME", "BaseAdmin"),
		AppEnv:      getEnv("APP_ENV", "development"),
		AppPort:     getEnv("APP_PORT", "8500"),
		AppSecret:   getEnv("APP_SECRET", ""),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:8501"),

		DBDriver: getEnv("DB_DRIVER", "postgres"),
		DBHost:   getEnv("DB_HOST", "localhost"),
		DBPort:   getEnv("DB_PORT", "5433"),
		DBUser:   getEnv("DB_USER", "postgres"),
		DBPass:   getEnv("DB_PASS", "password"),
		DBName:   getEnv("DB_NAME", "baseadmin"),

		RedisHost: getEnv("REDIS_HOST", "localhost"),
		RedisPort: getEnv("REDIS_PORT", "6379"),
		RedisPass: getEnv("REDIS_PASS", ""),
		RedisDB:   getEnvInt("REDIS_DB", 0),

		SessionSecret:        getEnv("SESSION_SECRET", ""),
		SessionMaxAge:        getEnvInt("SESSION_MAX_AGE", 86400),
		SessionMaxConcurrent: getEnvInt("SESSION_MAX_CONCURRENT", 3),

		StorageDriver:  getEnv("STORAGE_DRIVER", "local"),
		StoragePath:    getEnv("STORAGE_PATH", "./storage/uploads"),
		StorageMaxSize: int64(getEnvInt("STORAGE_MAX_SIZE", 2097152)),

		MailHost: getEnv("MAIL_HOST", ""),
		MailPort: getEnv("MAIL_PORT", "587"),
		MailUser: getEnv("MAIL_USER", ""),
		MailPass: getEnv("MAIL_PASS", ""),
		MailFrom: getEnv("MAIL_FROM", ""),

		LogCleanupDays: getEnvInt("LOG_CLEANUP_DAYS", 90),
		RateLimitLogin: getEnvInt("RATE_LIMIT_LOGIN", 5),
		RateLimitAPI:   getEnvInt("RATE_LIMIT_API", 100),
	}

	return Cfg
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
