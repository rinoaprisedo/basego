<?php

namespace App\Http\Middleware;

use App\Support\LoginLockout;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LoginLockoutCheck
{
    public function handle(Request $request, Closure $next): Response
    {
        if (LoginLockout::isLocked($request->ip())) {
            return response()->json([
                'success' => false,
                'message' => 'too many failed login attempts, try again later',
            ], 429);
        }

        return $next($request);
    }
}
