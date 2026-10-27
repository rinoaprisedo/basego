package storage

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

// 1x1 PNG.
var pngBytes = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
	0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
	0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

func formFile(t *testing.T, filename string, content []byte) (multipart.File, *multipart.FileHeader) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	fw.Write(content)
	w.Close()
	req := httptest.NewRequest(http.MethodPost, "/", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	if err := req.ParseMultipartForm(1 << 20); err != nil {
		t.Fatal(err)
	}
	hdr := req.MultipartForm.File["file"][0]
	f, err := hdr.Open()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.Close() })
	return f, hdr
}

func TestUploadIgnoresClientExtension(t *testing.T) {
	s := NewLocalStorage(t.TempDir(), "/uploads", 1<<20)
	for _, name := range []string{"evil.html", "evil.svg", "evil", "a.png.php"} {
		f, hdr := formFile(t, name, pngBytes)
		rel, err := s.Upload(f, hdr, "avatars")
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if filepath.Ext(rel) != ".png" {
			t.Errorf("%s stored as %q, want .png extension", name, rel)
		}
	}
}

func TestUploadRejectsNonImage(t *testing.T) {
	s := NewLocalStorage(t.TempDir(), "/uploads", 1<<20)
	f, hdr := formFile(t, "x.png", []byte("<html><script>alert(1)</script></html>"))
	if _, err := s.Upload(f, hdr, "avatars"); err == nil || !strings.Contains(err.Error(), "unsupported") {
		t.Fatalf("expected unsupported type error, got %v", err)
	}
}

func TestOpenCannotEscapeBase(t *testing.T) {
	base := t.TempDir()
	s := NewLocalStorage(filepath.Join(base, "private"), "/f", 1<<20)
	if _, err := s.Open("../../etc/passwd"); err == nil {
		t.Fatal("expected not found for traversal path")
	}
}
