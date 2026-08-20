<?php

namespace App\Http\Middleware;

use App\Support\ApiResponse;
use App\Support\Session;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/session_auth.go: validates the httpOnly
 * `session` cookie against Redis and attaches the resolved identity to the
 * request so downstream middleware/controllers can read it via AuthContext.
 */
class SessionAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->cookie(Session::COOKIE_NAME);
        if (! $token) {
            return ApiResponse::error(401, 'authentication required');
        }

        $data = Session::get($token);
        if ($data === null) {
            return ApiResponse::error(401, 'session expired or invalid');
        }

        $isSuperadmin = DB::table('roles')
            ->join('users', 'users.role_id', '=', 'roles.id')
            ->where('users.id', $data['user_id'])
            ->where('roles.is_superadmin', true)
            ->exists();

        $request->attributes->set('user_id', $data['user_id']);
        $request->attributes->set('user_uuid', $data['user_uuid']);
        $request->attributes->set('is_superadmin', $isSuperadmin);
        $request->attributes->set('session_token', $token);

        return $next($request);
    }
}
