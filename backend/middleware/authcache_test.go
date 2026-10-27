package middleware

import (
	"testing"
	"time"
)

func TestTTLCacheExpiryAndFlush(t *testing.T) {
	c := newTTLCache[uint64, string](30 * time.Millisecond)
	c.set(1, "a")
	if v, ok := c.get(1); !ok || v != "a" {
		t.Fatalf("expected hit, got %v %v", v, ok)
	}
	time.Sleep(50 * time.Millisecond)
	if _, ok := c.get(1); ok {
		t.Fatal("entry should have expired")
	}
	c.set(2, "b")
	c.flush()
	if _, ok := c.get(2); ok {
		t.Fatal("flush should drop entries")
	}
}

func TestTTLCacheIsBounded(t *testing.T) {
	c := newTTLCache[int, int](time.Minute)
	for i := 0; i < maxCacheEntries*2+5; i++ {
		c.set(i, i)
	}
	if n := len(c.m); n > maxCacheEntries {
		t.Fatalf("cache grew to %d, limit %d", n, maxCacheEntries)
	}
}

func TestUserKey(t *testing.T) {
	for in, want := range map[uint64]string{0: "u:0", 7: "u:7", 1234567890: "u:1234567890"} {
		if got := userKey(in); got != want {
			t.Errorf("userKey(%d)=%q want %q", in, got, want)
		}
	}
}

// A disabled cache (ttl 0) must never serve stale data: Flush is a safe no-op
// and the cache fields stay nil so every lookup goes to the DB.
func TestDisabledCache(t *testing.T) {
	a := NewAuthCache(nil, 0)
	if a.ident != nil || a.perm != nil {
		t.Fatal("ttl 0 must disable caching")
	}
	a.Flush()
	FlushAuthCache()
}

func TestCachedProfileCachesAndFlushes(t *testing.T) {
	NewAuthCache(nil, time.Minute)
	calls := 0
	load := func() (any, error) { calls++; return "p", nil }
	for i := 0; i < 4; i++ {
		if v, err := CachedProfile(7, load); err != nil || v != "p" {
			t.Fatal("bad profile", v, err)
		}
	}
	if calls != 1 {
		t.Fatalf("load called %d times, want 1", calls)
	}
	FlushAuthCache()
	CachedProfile(7, load)
	if calls != 2 {
		t.Fatal("flush must force a reload")
	}
	// errors are never cached
	failing := 0
	for i := 0; i < 2; i++ {
		CachedProfile(8, func() (any, error) { failing++; return nil, errBoom })
	}
	if failing != 2 {
		t.Fatalf("error result was cached (%d loads)", failing)
	}
	// ttl 0 disables
	NewAuthCache(nil, 0)
	n := 0
	for i := 0; i < 3; i++ {
		CachedProfile(7, func() (any, error) { n++; return "p", nil })
	}
	if n != 3 {
		t.Fatalf("disabled cache must always load, got %d", n)
	}
}

var errBoom = errBoomT("boom")

type errBoomT string

func (e errBoomT) Error() string { return string(e) }
