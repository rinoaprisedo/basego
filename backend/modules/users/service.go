package users

import (
	"context"
	"errors"
	"mime/multipart"

	"baseadmin/backend/middleware"
	"baseadmin/backend/session"
	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound          = errors.New("user not found")
	ErrEmailInUse        = errors.New("failed to create user (email may already be in use)")
	ErrSuperadminLocked  = errors.New("superadmin user is protected from this action")
	ErrSelfDelete        = errors.New("you cannot delete your own account")
	ErrAvatarFileMissing = errors.New("avatar file is required")
	// ErrSuperadminRequired guards every path that could create, modify or
	// escalate into a superadmin account: without it, anyone holding plain
	// users:edit/create could reset a superadmin's password, suspend them, or
	// grant themselves the superadmin role.
	ErrSuperadminRequired = errors.New("only a superadmin can manage superadmin accounts or assign the superadmin role")
	ErrInvalidStatus      = errors.New("status must be one of: active, inactive, suspended")
)

func validStatus(s string) bool {
	switch UserStatus(s) {
	case StatusActive, StatusInactive, StatusSuspended:
		return true
	}
	return false
}

// Service holds business rules for the users module: password hashing,
// superadmin protection, role assignment. Repository stays a thin data-access
// layer so this logic can be unit tested without a real database.
type Service struct {
	repo    *Repository
	storage storage.StorageInterface
	redis   *redis.Client
}

func NewService(repo *Repository, s storage.StorageInterface, rdb *redis.Client) *Service {
	return &Service{repo: repo, storage: s, redis: rdb}
}

// invalidateSessions force-logs-out every active session for a user. Called
// after a role or status change so a privilege downgrade (or suspension)
// takes effect immediately instead of waiting for the session's natural TTL —
// SessionAuth re-checks role/status per request, but the old token would
// otherwise keep working until it expires.
func (s *Service) invalidateSessions(userID uint64) {
	middleware.FlushAuthCache()
	_ = session.DeleteAllForUser(context.Background(), s.redis, userID)
	_ = s.repo.DeleteAllSessions(userID)
}

func (s *Service) List(p utils.Pagination, status, roleUUID string) ([]User, int64, error) {
	return s.repo.List(p, status, roleUUID)
}

func (s *Service) ListAll(search, status, roleUUID string) ([]User, error) {
	return s.repo.ListAll(search, status, roleUUID)
}

func (s *Service) Get(uuidStr string) (*User, error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return nil, ErrNotFound
	}
	return user, nil
}

type CreateInput struct {
	Name     string
	Email    string
	Password string
	Status   string
	RoleUUID string
	ActorID  *uint64
	// ActorIsSuperadmin gates assigning a superadmin role to the new user.
	ActorIsSuperadmin bool
}

func (s *Service) Create(in CreateInput) (*User, error) {
	if err := utils.ValidatePasswordPolicy(in.Password); err != nil {
		return nil, err
	}
	if in.Status != "" && !validStatus(in.Status) {
		return nil, ErrInvalidStatus
	}
	if in.RoleUUID != "" && !in.ActorIsSuperadmin && s.repo.RoleIsSuperadmin(in.RoleUUID) {
		return nil, ErrSuperadminRequired
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if err != nil {
		return nil, err
	}

	status := StatusActive
	if in.Status != "" {
		status = UserStatus(in.Status)
	}

	user := User{
		Name:     in.Name,
		Email:    in.Email,
		Password: string(hashed),
		Status:   status,
	}
	user.CreatedBy = in.ActorID

	if err := s.repo.Create(&user); err != nil {
		return nil, ErrEmailInUse
	}

	if in.RoleUUID != "" {
		_ = s.repo.SetRole(&user, in.RoleUUID)
	}

	return &user, nil
}

type UpdateInput struct {
	Name         string
	Email        string
	Password     string
	Status       string
	RoleUUID     string
	RoleProvided bool
	ActorID      *uint64
	// ActorIsSuperadmin is required to modify a superadmin user or to assign
	// the superadmin role.
	ActorIsSuperadmin bool
}

// Update returns the pre-update snapshot alongside the saved user so callers
// can log a before/after activity diff.
func (s *Service) Update(uuidStr string, in UpdateInput) (before *User, after *User, err error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return nil, nil, ErrNotFound
	}
	old := *user
	if !in.ActorIsSuperadmin {
		if hasSuperadminRole(user) {
			return nil, nil, ErrSuperadminRequired
		}
		if in.RoleProvided && in.RoleUUID != "" && s.repo.RoleIsSuperadmin(in.RoleUUID) {
			return nil, nil, ErrSuperadminRequired
		}
	}
	if in.Status != "" && !validStatus(in.Status) {
		return nil, nil, ErrInvalidStatus
	}
	if in.Password != "" {
		if err := utils.ValidatePasswordPolicy(in.Password); err != nil {
			return nil, nil, err
		}
	}
	statusChanged := in.Status != "" && UserStatus(in.Status) != old.Status
	roleChanged := in.RoleProvided && (old.Role == nil || old.Role.UUID.String() != in.RoleUUID)
	passwordChanged := in.Password != ""

	if in.Name != "" {
		user.Name = in.Name
	}
	if in.Email != "" {
		user.Email = in.Email
	}
	if passwordChanged {
		hashed, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
		if err != nil {
			return nil, nil, err
		}
		user.Password = string(hashed)
	}
	if in.Status != "" {
		user.Status = UserStatus(in.Status)
	}
	user.UpdatedBy = in.ActorID

	if err := s.repo.Save(user); err != nil {
		return nil, nil, err
	}
	if in.RoleProvided {
		_ = s.repo.SetRole(user, in.RoleUUID)
	}
	// The cached /auth/me profile shows name/email/role: refresh it now.
	middleware.FlushAuthCache()

	// A password set here is an admin forcing a new credential onto another
	// user's account (unlike self-service ChangePassword) — kick out any
	// existing sessions immediately, same as ResetPassword does.
	if statusChanged || roleChanged || passwordChanged {
		s.invalidateSessions(user.ID)
	}

	return &old, user, nil
}

// Delete removes a user. A superadmin account can be deleted, but only by
// another superadmin, and nobody can delete their own account.
func (s *Service) Delete(uuidStr string, actorID *uint64, actorIsSuperadmin bool) (*User, error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return nil, ErrNotFound
	}
	if actorID != nil && *actorID == user.ID {
		return nil, ErrSelfDelete
	}
	if hasSuperadminRole(user) && !actorIsSuperadmin {
		return nil, ErrSuperadminLocked
	}
	if err := s.repo.Delete(user, actorID); err != nil {
		return nil, err
	}
	s.invalidateSessions(user.ID)
	return user, nil
}

func (s *Service) UpdateStatus(uuidStr, status string) (oldStatus UserStatus, user *User, err error) {
	if !validStatus(status) {
		return "", nil, ErrInvalidStatus
	}
	user, err = s.repo.FindByUUID(uuidStr)
	if err != nil {
		return "", nil, ErrNotFound
	}
	if hasSuperadminRole(user) {
		return "", nil, ErrSuperadminLocked
	}
	oldStatus = user.Status
	user.Status = UserStatus(status)
	if err := s.repo.Save(user); err != nil {
		return "", nil, err
	}
	if oldStatus != user.Status {
		s.invalidateSessions(user.ID)
	}
	return oldStatus, user, nil
}

func (s *Service) UploadAvatar(uuidStr string, file multipart.File, header *multipart.FileHeader, actorIsSuperadmin bool) (string, error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return "", ErrNotFound
	}
	if hasSuperadminRole(user) && !actorIsSuperadmin {
		return "", ErrSuperadminRequired
	}

	path, err := s.storage.Upload(file, header, "avatars")
	if err != nil {
		return "", err
	}

	user.Avatar = &path
	if err := s.repo.Save(user); err != nil {
		return "", err
	}
	middleware.FlushAuthCache()
	return s.storage.GetURL(path), nil
}

func hasSuperadminRole(u *User) bool {
	return u.Role != nil && u.Role.IsSuperadmin
}
