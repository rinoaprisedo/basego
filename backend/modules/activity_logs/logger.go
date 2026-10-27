package activity_logs

import (
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
)

type logEntry struct {
	UserID    *uint64
	Action    ActivityAction
	Module    string
	RecordID  string
	OldValue  interface{}
	NewValue  interface{}
	IPAddress string
	UserAgent string
}

const (
	queueSize  = 10000
	batchSize  = 100
	flushEvery = 200 * time.Millisecond
)

var (
	logChan chan logEntry
	db      *gorm.DB

	// mu serialises close(logChan) against senders so Stop can never race a
	// LogActivity call into a "send on closed channel" panic.
	mu      sync.RWMutex
	closed  bool
	done    chan struct{}
	dropped atomic.Uint64

	// persist writes one batch; a variable so tests can run without a DB.
	persist = persistBatch
)

// StartWorker launches the background goroutine that persists activity logs
// from the buffered channel so request handlers never block on logging I/O.
// Entries are written in batches (up to batchSize, or every flushEvery) — one
// INSERT per entry was a bottleneck under write-heavy load.
func StartWorker(database *gorm.DB) {
	db = database
	mu.Lock()
	logChan = make(chan logEntry, queueSize)
	closed = false
	done = make(chan struct{})
	mu.Unlock()
	go worker(logChan, done)
}

func worker(in <-chan logEntry, finished chan<- struct{}) {
	defer close(finished)
	batch := make([]ActivityLog, 0, batchSize)
	tick := time.NewTicker(flushEvery)
	defer tick.Stop()
	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := persist(batch); err != nil {
			log.Printf("activity log write failed (%d entries): %v", len(batch), err)
		}
		batch = batch[:0]
	}
	for {
		select {
		case e, ok := <-in:
			if !ok { // Stop(): drain what is left, then exit
				flush()
				return
			}
			batch = append(batch, toRecord(e))
			if len(batch) >= batchSize {
				flush()
			}
		case <-tick.C:
			flush()
		}
	}
}

func toRecord(e logEntry) ActivityLog {
	record := ActivityLog{
		UserID:    e.UserID,
		Action:    e.Action,
		Module:    e.Module,
		IPAddress: e.IPAddress,
		UserAgent: e.UserAgent,
	}
	if e.RecordID != "" {
		id := e.RecordID
		record.RecordID = &id
	}
	if e.OldValue != nil {
		if b, err := json.Marshal(e.OldValue); err == nil {
			s := string(b)
			record.OldValue = &s
		}
	}
	if e.NewValue != nil {
		if b, err := json.Marshal(e.NewValue); err == nil {
			s := string(b)
			record.NewValue = &s
		}
	}
	return record
}

// persistBatch inserts the batch in one statement. If that fails (one bad row
// would otherwise discard its 99 neighbours) it retries row by row so only the
// offending entry is lost.
func persistBatch(batch []ActivityLog) error {
	if err := db.CreateInBatches(batch, batchSize).Error; err == nil {
		return nil
	}
	var firstErr error
	for i := range batch {
		if err := db.Create(&batch[i]).Error; err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// Stop flushes everything still queued and stops the worker; call it during
// graceful shutdown so audit entries aren't lost on deploy/restart.
func Stop(timeout time.Duration) {
	mu.Lock()
	if logChan == nil || closed {
		mu.Unlock()
		return
	}
	closed = true
	close(logChan)
	finished := done
	mu.Unlock()
	select {
	case <-finished:
	case <-time.After(timeout):
		log.Println("activity log flush timed out on shutdown")
	}
}

// Dropped returns how many entries were discarded because the queue was full.
func Dropped() uint64 { return dropped.Load() }

// LogActivity queues an activity log entry for async persistence. Safe to
// call directly (it never blocks; if the queue of 10000 is full the entry is
// dropped and counted, see Dropped()).
func LogActivity(userID *uint64, action ActivityAction, module, recordID string, oldValue, newValue interface{}, ip, userAgent string) {
	mu.RLock()
	defer mu.RUnlock()
	if logChan == nil || closed {
		return
	}
	select {
	case logChan <- logEntry{
		UserID: userID, Action: action, Module: module, RecordID: recordID,
		OldValue: oldValue, NewValue: newValue, IPAddress: ip, UserAgent: userAgent,
	}:
	default:
		if n := dropped.Add(1); n == 1 || n%1000 == 0 {
			log.Printf("activity log queue full: %d entries dropped so far", n)
		}
	}
}

// CleanupOld deletes activity logs older than the configured retention window.
func CleanupOld(days int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -days)
	res := db.Unscoped().Where("created_at < ?", cutoff).Delete(&ActivityLog{})
	resetCountCache()
	return res.RowsAffected, res.Error
}
