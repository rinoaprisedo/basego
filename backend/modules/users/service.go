package users

import (
	"errors"
	"mime/multipart"

	"baseadmin/backend/storage"
	"baseadmin/backend/utils"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound          = errors.New("user not found")
	ErrEmailInUse        = errors.New("failed to create user (email may already be in use)")
	ErrSuperadminLocked  = errors.New("superadmin user is protected from this action")
	ErrAvatarFileMissing = errors.New("avatar file is required")
)

// Service holds business rules for the users module: password hashing,
// superadmin protection, role assignment. Repository stays a thin data-access
// layer so this logic can be unit tested without a real database.
type Service struct {
	repo    *Repository
	storage storage.StorageInterface
}

func NewService(repo *Repository, s storage.StorageInterface) *Service {
	return &Service{repo: repo, storage: s}
}

func (s *Service) List(p utils.Pagination, status, roleUUID string) ([]User, int64, error) {
	return s.repo.List(p, status, roleUUID)
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
}

func (s *Service) Create(in CreateInput) (*User, error) {
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
	Status       string
	RoleUUID     string
	RoleProvided bool
	ActorID      *uint64
}

// Update returns the pre-update snapshot alongside the saved user so callers
// can log a before/after activity diff.
func (s *Service) Update(uuidStr string, in UpdateInput) (before *User, after *User, err error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return nil, nil, ErrNotFound
	}
	old := *user

	if in.Name != "" {
		user.Name = in.Name
	}
	if in.Email != "" {
		user.Email = in.Email
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

	return &old, user, nil
}

func (s *Service) Delete(uuidStr string, actorID *uint64) (*User, error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return nil, ErrNotFound
	}
	if hasSuperadminRole(user) {
		return nil, ErrSuperadminLocked
	}
	if err := s.repo.Delete(user, actorID); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *Service) UpdateStatus(uuidStr, status string) (oldStatus UserStatus, user *User, err error) {
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
	return oldStatus, user, nil
}

func (s *Service) UploadAvatar(uuidStr string, file multipart.File, header *multipart.FileHeader) (string, error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return "", ErrNotFound
	}

	path, err := s.storage.Upload(file, header, "avatars")
	if err != nil {
		return "", err
	}

	user.Avatar = &path
	if err := s.repo.Save(user); err != nil {
		return "", err
	}
	return s.storage.GetURL(path), nil
}

func (s *Service) ListSessions(uuidStr string) ([]Session, error) {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return nil, ErrNotFound
	}
	return s.repo.ListSessions(user.ID)
}

func (s *Service) KickSession(uuidStr, sessionUUID string) error {
	user, err := s.repo.FindByUUID(uuidStr)
	if err != nil {
		return ErrNotFound
	}
	return s.repo.DeleteSession(sessionUUID, user.ID)
}

func hasSuperadminRole(u *User) bool {
	return u.Role != nil && u.Role.IsSuperadmin
}
