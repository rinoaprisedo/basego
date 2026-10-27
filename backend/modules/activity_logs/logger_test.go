package activity_logs

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func withFakePersist(t *testing.T) (*atomic.Int64, *atomic.Int64) {
	t.Helper()
	var rows, batches atomic.Int64
	old := persist
	persist = func(b []ActivityLog) error {
		rows.Add(int64(len(b)))
		batches.Add(1)
		return nil
	}
	t.Cleanup(func() { persist = old })
	return &rows, &batches
}

func TestWorkerBatchesAndStopFlushesEverything(t *testing.T) {
	rows, batches := withFakePersist(t)
	StartWorker(nil)

	const n = 1050
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			LogActivity(nil, ActionUpdate, "users", "id", nil, map[string]int{"a": 1}, "1.2.3.4", "ua")
		}()
	}
	wg.Wait()
	Stop(5 * time.Second)

	if rows.Load() != n {
		t.Fatalf("persisted %d rows, want %d (Stop must flush the queue)", rows.Load(), n)
	}
	if batches.Load() >= n/2 {
		t.Fatalf("%d batches for %d rows: not batching", batches.Load(), n)
	}
}

func TestLogActivityAfterStopDoesNotPanic(t *testing.T) {
	withFakePersist(t)
	StartWorker(nil)
	Stop(time.Second)
	LogActivity(nil, ActionLogin, "auth", "", nil, nil, "ip", "ua") // must be a no-op
	Stop(time.Second)                                               // idempotent
}

func TestQueueFullDropsAndCounts(t *testing.T) {
	block := make(chan struct{})
	old := persist
	persist = func(b []ActivityLog) error { <-block; return nil }
	t.Cleanup(func() { persist = old })

	StartWorker(nil)
	before := Dropped()
	for i := 0; i < queueSize+batchSize+500; i++ {
		LogActivity(nil, ActionView, "x", "", nil, nil, "ip", "ua")
	}
	if Dropped() <= before {
		t.Fatal("expected drops once the queue is full")
	}
	close(block)
	Stop(5 * time.Second)
}

func TestCachedCount(t *testing.T) {
	resetCountCache()
	calls := 0
	load := func() (int64, error) { calls++; return 42, nil }
	for i := 0; i < 5; i++ {
		if n, _ := cachedCount("k", load); n != 42 {
			t.Fatal("wrong total")
		}
	}
	if calls != 1 {
		t.Fatalf("loader called %d times, want 1", calls)
	}
	resetCountCache()
	cachedCount("k", load)
	if calls != 2 {
		t.Fatal("reset should force a reload")
	}
}
