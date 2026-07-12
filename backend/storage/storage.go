package storage

import "mime/multipart"

// StorageInterface abstracts file storage so drivers (local, s3, ...) can be
// swapped via STORAGE_DRIVER without touching callers.
type StorageInterface interface {
	Upload(file multipart.File, header *multipart.FileHeader, folder string) (string, error)
	Delete(path string) error
	GetURL(path string) string
}

var allowedMimeTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}
