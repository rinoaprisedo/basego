<?php

namespace App\Http\Middleware;

use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/security.go's RequestSizeLimit(10MB).
 */
class RequestSizeLimit
{
    private const MAX_BYTES = 10 * 1024 * 1024;

    public function handle(Request $request, Closure $next): Response
    {
        if ((int) $request->header('Content-Length', 0) > self::MAX_BYTES) {
            return ApiResponse::error(413, 'request body too large');
        }

        return $next($request);
    }
}
