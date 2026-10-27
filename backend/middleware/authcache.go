package middleware

import (
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/singleflight"
	"gorm.io/gorm"
)

// maxCacheEntries bounds memory: when exceeded the map is reset (cheap, and
// entries simply reload on next use).
const maxCacheEntries = 20000

type cacheEntry[V any] struct {
	val V
	exp time.Time
}

// ttlCache is a small concurrency-safe in-process cache with per-entry TTL.
type ttlCache[K comparable, V any] struct {
	mu  sync.RWMutex
	m   map[K]cacheEntry[V]
	ttl time.Duration
}

func newTTLCache[K comparable, V any](ttl time.Duration) *ttlCache[K, V] {
	return &ttlCache[K, V]{m: make(map[K]cacheEntry[V]), ttl: ttl}
}

func (c *ttlCache[K, V]) get(k K) (V, bool) {
	c.mu.RLock()
	e, ok := c.m[k]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.exp) {
		var zero V
		return zero, false
	}
	return e.val, true
}

func (c *ttlCache[K, V]) set(k K, v V) {
	c.mu.Lock()
	if len(c.m) >= maxCacheEntries {
		c.m = make(map[K]cacheEntry[V])
	}
	c.m[k] = cacheEntry[V]{val: v, exp: time.Now().Add(c.ttl)}
	c.mu.Unlock()
}

func (c *ttlCache[K, V]) flush() {
	c.mu.Lock()
	c.m = make(map[K]cacheEntry[V])
	c.mu.Unlock()
}

type permKey struct {
	userID uint64
	path   string
	column string
}

// AuthCache removes the two per-request DB queries (identity lookup and
// permission lookup) from the hot path. Entries live for a short TTL
// (AUTHZ_CACHE_TTL_SECONDS, default 5). Security properties:
//   - Suspension, deletion and role change still take effect immediately:
//     they delete the user's Redis sessions, and the session is checked on
//     every request before this cache is consulted.
//   - A permission/role edit made on THIS instance flushes the cache at once;
//     other instances pick it up within the TTL.
//   - Only positive identity lookups are cached; "not found / inactive" is
//     always re-checked against the DB.
//
// A nil receiver or ttl <= 0 disables caching (always hits the DB).
type AuthCache struct {
	db    *gorm.DB
	ident *ttlCache[uint64, Identity]
	perm  *ttlCache[permKey, bool]
	prof  *ttlCache[uint64, any]
	sf    singleflight.Group
}

var activeAuthCache atomic.Pointer[AuthCache]

// NewAuthCache builds the cache and registers it as the instance that
// FlushAuthCache() invalidates.
func NewAuthCache(db *gorm.DB, ttl time.Duration) *AuthCache {
	a := &AuthCache{db: db}
	if ttl > 0 {
		a.ident = newTTLCache[uint64, Identity](ttl)
		a.perm = newTTLCache[permKey, bool](ttl)
		a.prof = newTTLCache[uint64, any](ttl)
	}
	activeAuthCache.Store(a)
	return a
}

// FlushAuthCache drops every cached identity/permission on this instance.
// Call it after any change to roles, permissions or role assignments.
func FlushAuthCache() {
	if a := activeAuthCache.Load(); a != nil {
		a.Flush()
	}
}

func (a *AuthCache) Flush() {
	if a == nil || a.ident == nil {
		return
	}
	a.ident.flush()
	a.perm.flush()
	a.prof.flush()
}

// Identity returns the user's authorization identity; ok=false when the user
// is gone or not active.
func (a *AuthCache) Identity(userID uint64) (Identity, bool) {
	if a.ident == nil {
		return ResolveIdentity(a.db, userID)
	}
	if id, ok := a.ident.get(userID); ok {
		return id, true
	}
	type result struct {
		id Identity
		ok bool
	}
	// singleflight: a burst of requests for one user right after expiry
	// triggers a single query instead of one each.
	v, _, _ := a.sf.Do(userKey(userID), func() (any, error) {
		id, ok := ResolveIdentity(a.db, userID)
		if ok {
			a.ident.set(userID, id)
		}
		return result{id, ok}, nil
	})
	r := v.(result)
	return r.id, r.ok
}

// Allowed reports whether the user's role grants `column` on `menuPath`.
func (a *AuthCache) Allowed(userID uint64, menuPath, column string) bool {
	if a.perm == nil {
		return queryPermission(a.db, userID, menuPath, column)
	}
	k := permKey{userID, menuPath, column}
	if allowed, ok := a.perm.get(k); ok {
		return allowed
	}
	v, _, _ := a.sf.Do("p:"+userKey(userID)+":"+menuPath+":"+column, func() (any, error) {
		allowed := queryPermission(a.db, userID, menuPath, column)
		a.perm.set(k, allowed)
		return allowed, nil
	})
	return v.(bool)
}

func userKey(id uint64) string {
	const digits = "0123456789"
	if id == 0 {
		return "u:0"
	}
	var b [24]byte
	i := len(b)
	for n := id; n > 0; n /= 10 {
		i--
		b[i] = digits[n%10]
	}
	return "u:" + string(b[i:])
}

func queryPermission(db *gorm.DB, userID uint64, menuPath, column string) bool {
	var count int64
	db.Table("permissions").
		Joins("JOIN menus ON menus.id = permissions.menu_id").
		Joins("JOIN users ON users.role_id = permissions.role_id").
		Where("users.id = ? AND menus.path = ? AND permissions."+column+" = ?", userID, menuPath, true).
		Count(&count)
	return count > 0
}

// CachedProfile memoises a per-user response (the /auth/me profile: role,
// permissions, name, avatar) for the cache TTL. Flushed together with the
// identity/permission caches, and by user edits, so changes show up at once on
// this instance. With caching disabled it just calls load.
func CachedProfile(userID uint64, load func() (any, error)) (any, error) {
	a := activeAuthCache.Load()
	if a == nil || a.prof == nil {
		return load()
	}
	if v, ok := a.prof.get(userID); ok {
		return v, nil
	}
	v, err, _ := a.sf.Do("prof:"+userKey(userID), func() (any, error) {
		v, err := load()
		if err == nil {
			a.prof.set(userID, v)
		}
		return v, err
	})
	return v, err
}
