<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/xss.go: strips HTML tags from every string
 * value in a JSON request body before the controller/validator reads it.
 */
class XssSanitizer
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isJson() && $request->getContent() !== '') {
            $decoded = json_decode($request->getContent(), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $request->json()->replace(self::sanitize($decoded));
            }
        }

        return $next($request);
    }

    private static function sanitize(mixed $value): mixed
    {
        if (is_string($value)) {
            return strip_tags($value);
        }
        if (is_array($value)) {
            return array_map(self::sanitize(...), $value);
        }
        return $value;
    }
}
