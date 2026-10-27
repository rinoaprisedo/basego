package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const accountFailWindow = 15 * time.Minute

// acctKey hashes the normalised email so Redis never stores addresses, and
// unknown emails are tracked exactly like real ones (no enumeration signal).
func acctKey(prefix, email string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
	return prefix + hex.EncodeToString(sum[:])
}

// AccountLoginLocked reports whether this account is currently locked out.
// Per-IP limits stop one attacker; this stops a distributed one (many IPs, one
// victim). Trade-off: an attacker can also lock a known email for the lockout
// period — raise RATE_LIMIT_LOGIN_ACCOUNT or set it to 0 to disable.
func AccountLoginLocked(rdb *redis.Client, email string, maxFails int) bool {
	if maxFails <= 0 {
		return false
	}
	n, err := rdb.Exists(context.Background(), acctKey("login_acct_lock:", email)).Result()
	return err == nil && n > 0
}

// RegisterAccountFailure counts a failed login and locks the account once
// maxFails is reached inside the 15 minute window.
func RegisterAccountFailure(rdb *redis.Client, email string, maxFails, lockoutMin int) {
	if maxFails <= 0 {
		return
	}
	ctx := context.Background()
	failKey := acctKey("login_acct_fails:", email)
	count, err := incrWithTTL(ctx, rdb, failKey, accountFailWindow)
	if err != nil {
		return
	}
	if int(count) >= maxFails {
		rdb.Set(ctx, acctKey("login_acct_lock:", email), "1", time.Duration(lockoutMin)*time.Minute)
		rdb.Del(ctx, failKey)
	}
}

// ClearAccountFailures resets the counter after a successful login.
func ClearAccountFailures(rdb *redis.Client, email string) {
	rdb.Del(context.Background(), acctKey("login_acct_fails:", email))
}
