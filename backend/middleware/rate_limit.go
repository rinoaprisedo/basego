package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// RateLimit implements a fixed-window Redis counter: max requests per window
// per key, returning 429 once exceeded.
func RateLimit(rdb *redis.Client, prefix string, max int, window time.Duration, keyFn func(c *gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := context.Background()
		key := fmt.Sprintf("ratelimit:%s:%s", prefix, keyFn(c))

		count, err := incrWithTTL(ctx, rdb, key, window)
		if err != nil {
			c.Next()
			return
		}
		if count > int64(max) {
			c.Header("Retry-After", fmt.Sprintf("%d", int(window.Seconds())))
			c.AbortWithStatusJSON(429, gin.H{"success": false, "message": "too many requests, please try again later"})
			return
		}
		c.Next()
	}
}

// LoginLockout checks/increments a separate lockout counter keyed by IP.
// After maxFails failures within a minute the IP is locked for lockoutMin minutes.
func LoginLockout(rdb *redis.Client, maxFails, lockoutMin int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := context.Background()
		ip := c.ClientIP()
		lockKey := "login_lockout:" + ip
		locked, _ := rdb.Exists(ctx, lockKey).Result()
		if locked > 0 {
			c.AbortWithStatusJSON(429, gin.H{"success": false, "message": "too many failed login attempts, try again later"})
			return
		}
		c.Set("login_fail_key", "login_fails:"+ip)
		c.Set("login_lock_key", lockKey)
		c.Set("login_max_fails", maxFails)
		c.Set("login_lockout_min", lockoutMin)
		c.Next()
	}
}

// RegisterLoginFailure increments the failure counter and locks the IP out
// for RATE_LIMIT_LOGIN_LOCKOUT_MINUTES once maxFails is reached within the
// 1 minute window.
func RegisterLoginFailure(c *gin.Context, rdb *redis.Client) {
	ctx := context.Background()
	failKeyV, _ := c.Get("login_fail_key")
	lockKeyV, _ := c.Get("login_lock_key")
	maxFailsV, _ := c.Get("login_max_fails")
	lockoutMinV, _ := c.Get("login_lockout_min")
	failKey, _ := failKeyV.(string)
	lockKey, _ := lockKeyV.(string)
	maxFails, _ := maxFailsV.(int)
	lockoutMin, _ := lockoutMinV.(int)
	if failKey == "" {
		return
	}
	count, _ := incrWithTTL(ctx, rdb, failKey, time.Minute)
	if int(count) >= maxFails {
		rdb.Set(ctx, lockKey, "1", time.Duration(lockoutMin)*time.Minute)
		rdb.Del(ctx, failKey)
	}
}

func ClearLoginFailures(c *gin.Context, rdb *redis.Client) {
	ctx := context.Background()
	failKeyV, _ := c.Get("login_fail_key")
	if failKey, _ := failKeyV.(string); failKey != "" {
		rdb.Del(ctx, failKey)
	}
}

// incrScript atomically increments a counter and guarantees it has a TTL
// (set when missing, never extended — fixed window). One Redis command and
// one round-trip instead of MULTI/INCR/EXPIRE/EXEC, and no key can be left
// without an expiry.
var incrScript = redis.NewScript(`
local c = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return c
`)

func incrWithTTL(ctx context.Context, rdb *redis.Client, key string, window time.Duration) (int64, error) {
	return incrScript.Run(ctx, rdb, []string{key}, window.Milliseconds()).Int64()
}
