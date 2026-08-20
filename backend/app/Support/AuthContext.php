<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Mirrors backend-go/utils/context.go's gin-context helpers, using Laravel's
 * request attribute bag (set by App\Http\Middleware\SessionAuth) instead.
 */
class AuthContext
{
    public static function userId(Request $request): ?int
    {
        return $request->attributes->get('user_id');
    }

    public static function userUuid(Request $request): ?string
    {
        return $request->attributes->get('user_uuid');
    }

    public static function isSuperadmin(Request $request): bool
    {
        return (bool) $request->attributes->get('is_superadmin', false);
    }

    public static function sessionToken(Request $request): ?string
    {
        return $request->attributes->get('session_token');
    }
}
