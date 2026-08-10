<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/csrf.go's double-submit-cookie pattern.
 * Cookie/header names must stay exactly `csrf_token` / `X-CSRF-Token` to
 * match the existing React frontend (these differ from Laravel's own
 * XSRF-TOKEN/X-XSRF-TOKEN convention, which is intentionally not used here).
 */
class Csrf
{
    private const COOKIE_NAME = 'csrf_token';
    private const HEADER_NAME = 'X-CSRF-Token';

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->cookie(self::COOKIE_NAME);
        $issuedNow = false;

        if (! $token) {
            $token = bin2hex(random_bytes(32));
            $issuedNow = true;
        }

        if (! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            $header = (string) $request->header(self::HEADER_NAME, '');
            if ($header === '' || ! hash_equals($token, $header)) {
                return response()->json([
                    'success' => false,
                    'message' => 'invalid or missing CSRF token',
                ], 403);
            }
        }

        $response = $next($request);

        if ($issuedNow) {
            $response->headers->setCookie(Cookie::make(
                name: self::COOKIE_NAME,
                value: $token,
                minutes: 1440,
                path: '/',
                domain: null,
                secure: app()->environment('production'),
                httpOnly: false,
                raw: true,
            ));
        }

        return $response;
    }
}
