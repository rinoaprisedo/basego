<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Menu;
use App\Models\Permission;
use App\Models\Role;
use App\Support\ActivityAction;
use App\Support\ActivityLogger;
use App\Support\ApiResponse;
use App\Support\AuthContext;
use App\Support\Pagination;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $p = Pagination::fromRequest($request, 'created_at');
        $query = Role::query();
        if ($p->search !== '') {
            $query->where('name', 'like', "%{$p->search}%");
        }

        $total = (clone $query)->count();
        $list = $query->orderBy($p->sortBy, $p->sortDir)->skip($p->offset())->take($p->limit)->get();

        return ApiResponse::successList('ok', $list, Pagination::buildMeta($p->page, $p->limit, $total));
    }

    public function show(string $uuid)
    {
        $role = Role::where('uuid', $uuid)->first();
        if (! $role) {
            return ApiResponse::error(404, 'role not found');
        }

        return ApiResponse::success(200, 'ok', [
            'role' => $role,
            'permissions' => $this->permissionRows($role->id),
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), ['name' => 'required']);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        if (Role::where('name', $request->input('name'))->exists()) {
            return ApiResponse::error(400, 'failed to create role (name may already be in use)');
        }

        $actorId = AuthContext::userId($request);
        $role = Role::create([
            'name' => $request->input('name'),
            'description' => $request->input('description', ''),
            'is_superadmin' => (bool) $request->input('is_superadmin', false),
            'created_by' => $actorId,
        ]);

        ActivityLogger::log($actorId, ActivityAction::CREATE, 'roles', $role->uuid, null, $role->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(201, 'role created', $role);
    }

    public function update(Request $request, string $uuid)
    {
        $validator = Validator::make($request->all(), ['name' => 'required']);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $role = Role::where('uuid', $uuid)->first();
        if (! $role) {
            return ApiResponse::error(404, 'role not found');
        }

        $before = $role->replicate();
        $isSuperadmin = (bool) $request->input('is_superadmin', false);
        if ($role->is_superadmin && ! $isSuperadmin) {
            return ApiResponse::error(403, 'superadmin role cannot be demoted');
        }

        $actorId = AuthContext::userId($request);
        $role->name = $request->input('name');
        $role->description = $request->input('description', '');
        $role->updated_by = $actorId;
        $role->save();

        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'roles', $role->uuid, $before->toArray(), $role->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'role updated', $role);
    }

    public function destroy(Request $request, string $uuid)
    {
        $role = Role::where('uuid', $uuid)->first();
        if (! $role) {
            return ApiResponse::error(404, 'role not found');
        }
        if ($role->is_superadmin) {
            return ApiResponse::error(403, 'superadmin role cannot be deleted');
        }

        $userCount = DB::table('users')->where('role_id', $role->id)->whereNull('deleted_at')->count();
        if ($userCount > 0) {
            return ApiResponse::error(409, 'role is still assigned to one or more users');
        }

        $actorId = AuthContext::userId($request);
        $role->deleted_by = $actorId;
        $role->save();
        $role->delete();

        ActivityLogger::log($actorId, ActivityAction::DELETE, 'roles', $role->uuid, $role->toArray(), null, $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'role deleted', null);
    }

    public function permissions(string $uuid)
    {
        $role = Role::where('uuid', $uuid)->first();
        if (! $role) {
            return ApiResponse::error(404, 'role not found');
        }

        return ApiResponse::success(200, 'ok', $this->permissionRows($role->id));
    }

    public function updatePermissions(Request $request, string $uuid)
    {
        $validator = Validator::make($request->all(), [
            'permissions' => 'required|array',
            'permissions.*.menu_uuid' => 'required',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $role = Role::where('uuid', $uuid)->first();
        if (! $role) {
            return ApiResponse::error(404, 'role not found');
        }

        foreach ($request->input('permissions') as $item) {
            $menuId = Menu::where('uuid', $item['menu_uuid'])->value('id');
            if (! $menuId) {
                continue;
            }

            Permission::updateOrCreate(
                ['role_id' => $role->id, 'menu_id' => $menuId],
                [
                    'can_view' => (bool) ($item['can_view'] ?? false),
                    'can_create' => (bool) ($item['can_create'] ?? false),
                    'can_edit' => (bool) ($item['can_edit'] ?? false),
                    'can_delete' => (bool) ($item['can_delete'] ?? false),
                ]
            );
        }

        $actorId = AuthContext::userId($request);
        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'role_permissions', $uuid, null, $request->input('permissions'), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'permissions updated', null);
    }

    private function permissionRows(int $roleId): array
    {
        return DB::table('permissions')
            ->join('menus', 'menus.id', '=', 'permissions.menu_id')
            ->where('permissions.role_id', $roleId)
            ->select('menus.uuid as menu_uuid', 'menus.name as menu_name', 'permissions.can_view', 'permissions.can_create', 'permissions.can_edit', 'permissions.can_delete')
            ->get()
            ->map(fn ($row) => [
                'menu_uuid' => $row->menu_uuid,
                'menu_name' => $row->menu_name,
                'can_view' => (bool) $row->can_view,
                'can_create' => (bool) $row->can_create,
                'can_edit' => (bool) $row->can_edit,
                'can_delete' => (bool) $row->can_delete,
            ])->all();
    }
}
