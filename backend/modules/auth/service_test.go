package auth

import (
	"errors"
	"testing"
	"time"

	"baseadmin/backend/config"
)

func TestHashSlotsBoundConcurrencyAndShedLoad(t *testing.T) {
	old := hashWait
	hashWait = 60 * time.Millisecond
	defer func() { hashWait = old }()

	s := NewService(nil, nil, &config.Config{BcryptMaxConcurrent: 2})
	r1, err := s.acquireHashSlot()
	if err != nil {
		t.Fatal(err)
	}
	r2, err := s.acquireHashSlot()
	if err != nil {
		t.Fatal(err)
	}
	// Third request must be shed with ErrServerBusy, not queue forever.
	start := time.Now()
	if _, err := s.acquireHashSlot(); !errors.Is(err, ErrServerBusy) {
		t.Fatalf("err = %v, want ErrServerBusy", err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("shedding took too long")
	}
	r1() // freeing a slot lets the next request in
	r3, err := s.acquireHashSlot()
	if err != nil {
		t.Fatalf("after release: %v", err)
	}
	r2()
	r3()
}

func TestNewServiceClampsConcurrency(t *testing.T) {
	s := NewService(nil, nil, &config.Config{BcryptMaxConcurrent: 0})
	if cap(s.hashSlots) != 1 {
		t.Fatalf("cap = %d, want 1", cap(s.hashSlots))
	}
}
