package activity_logs

import (
	"sync"
	"time"
)

const (
	countTTL        = 10 * time.Second
	countCacheLimit = 256
)

type countEntry struct {
	n   int64
	exp time.Time
}

var countCache = struct {
	mu sync.Mutex
	m  map[string]countEntry
}{m: map[string]countEntry{}}

// cachedCount memoises an expensive total for countTTL, keyed by the filter.
func cachedCount(key string, load func() (int64, error)) (int64, error) {
	countCache.mu.Lock()
	if e, ok := countCache.m[key]; ok && time.Now().Before(e.exp) {
		countCache.mu.Unlock()
		return e.n, nil
	}
	countCache.mu.Unlock()

	n, err := load()
	if err != nil {
		return 0, err
	}
	countCache.mu.Lock()
	if len(countCache.m) >= countCacheLimit {
		countCache.m = map[string]countEntry{}
	}
	countCache.m[key] = countEntry{n: n, exp: time.Now().Add(countTTL)}
	countCache.mu.Unlock()
	return n, nil
}

// resetCountCache drops all cached totals (after a retention cleanup).
func resetCountCache() {
	countCache.mu.Lock()
	countCache.m = map[string]countEntry{}
	countCache.mu.Unlock()
}
