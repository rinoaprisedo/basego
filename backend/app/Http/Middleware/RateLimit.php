<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/rate_limit.go's RateLimit: a fixed-window
 * Redis counter, keyed by IP, per named prefix (api/login/forgot-password/upload).
 */
class RateLimit
{
    public function handle(Request $request, Closure $next, string $prefix, int $max, int $windowSeconds): Response
    {
        $key = "ratelimit:{$prefix}:{$request->ip()}";

        $count = Redis::incr($key);
        if ($count === 1) {
            Redis::expire($key, $windowSeconds);
        }

        if ($count > $max) {
            return response()->json([
                'success' => false,
                'message' => 'too many requests, please try again later',
            ], 429)->header('Retry-After', (string) $windowSeconds);
        }

        return $next($request);
    }
}
