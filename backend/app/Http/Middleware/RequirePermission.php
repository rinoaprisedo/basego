<?php

namespace App\Http\Middleware;

use App\Support\ApiResponse;
use App\Support\AuthContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend-go/middleware/permission.go's RequirePermission. Must run
 * after SessionAuth (see the `permission.guard:menuPath,action` route-group
 * middleware combinator registered in bootstrap/app.php).
 */
class RequirePermission
{
    private const COLUMN_MAP = [
        'view' => 'can_view',
        'create' => 'can_create',
        'edit' => 'can_edit',
        'delete' => 'can_delete',
    ];

    public function handle(Request $request, Closure $next, string $menuPath, string $action): Response
    {
        if (AuthContext::isSuperadmin($request)) {
            return $next($request);
        }

        $userId = AuthContext::userId($request);
        if ($userId === null) {
            return ApiResponse::error(401, 'authentication required');
        }

        $column = self::COLUMN_MAP[$action];

        $allowed = DB::table('permissions')
            ->join('menus', 'menus.id', '=', 'permissions.menu_id')
            ->join('users', 'users.role_id', '=', 'permissions.role_id')
            ->where('users.id', $userId)
            ->where('menus.path', $menuPath)
            ->where("permissions.{$column}", true)
            ->exists();

        if (! $allowed) {
            return ApiResponse::error(403, 'you do not have permission to perform this action');
        }

        return $next($request);
    }
}
