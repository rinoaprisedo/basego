<?php

namespace App\Http\Middleware;

use App\Support\ApiResponse;
use App\Support\AuthContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/maintenance.go. settings.maintenance_mode is
 * cached in Redis for 60s to avoid a DB hit on every request; superadmins are
 * never blocked.
 */
class MaintenanceMode
{
    private const CACHE_KEY = 'settings:maintenance_mode';

    public function handle(Request $request, Closure $next): Response
    {
        $value = Redis::get(self::CACHE_KEY);

        if ($value === null) {
            $value = DB::table('settings')->where('key', 'maintenance_mode')->value('value') ?? '';
            Redis::setex(self::CACHE_KEY, 60, $value);
        }

        if ($value === 'true') {
            if (AuthContext::isSuperadmin($request)) {
                return $next($request);
            }
            return ApiResponse::error(503, 'the application is currently under maintenance');
        }

        return $next($request);
    }
}
