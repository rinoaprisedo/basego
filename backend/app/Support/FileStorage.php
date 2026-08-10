<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Mirrors backend-go/storage/local.go's LocalStorage: files land under
 * storage/app/public/uploads/<folder>/<uuid>.ext (symlinked at public/uploads
 * so the PHP dev server serves them directly at /uploads/... exactly like
 * Go's router.Static("/uploads", ...)).
 */
class FileStorage
{
    private const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    public static function upload(UploadedFile $file, string $folder): string
    {
        $maxSize = (int) config('baseadmin.storage_max_size');
        if ($file->getSize() > $maxSize) {
            throw new RuntimeException("file exceeds max size of {$maxSize} bytes");
        }

        $mimeType = $file->getMimeType();
        if (! in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new RuntimeException("unsupported file type: {$mimeType}");
        }

        $filename = (string) Str::uuid().'.'.$file->getClientOriginalExtension();
        $dir = storage_path("app/public/uploads/{$folder}");
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $file->move($dir, $filename);

        return "{$folder}/{$filename}";
    }

    public static function delete(string $relativePath): void
    {
        $full = storage_path("app/public/uploads/{$relativePath}");
        if (is_file($full)) {
            unlink($full);
        }
    }

    public static function url(string $relativePath): string
    {
        return '/uploads/'.ltrim($relativePath, '/');
    }
}
