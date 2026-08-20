<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Session as SessionModel;
use App\Models\User;
use App\Support\ActivityAction;
use App\Support\ActivityLogger;
use App\Support\ApiResponse;
use App\Support\AuthContext;
use App\Support\FileStorage;
use App\Support\Pagination;
use App\Support\Session;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class UserController extends Controller
{
    private const EXPORT_COLUMNS = ['Name', 'Email', 'Status', 'Role', 'Last Login', 'Created At'];

    public function index(Request $request)
    {
        $p = Pagination::fromRequest($request, 'created_at');
        $query = $this->filtered($request, User::with('role')->newQuery());

        $total = (clone $query)->count();
        $list = $query->orderBy($p->sortBy, $p->sortDir)->skip($p->offset())->take($p->limit)->get();

        return ApiResponse::successList('ok', $list, Pagination::buildMeta($p->page, $p->limit, $total));
    }

    public function show(string $uuid)
    {
        $user = User::with('role')->where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }
        return ApiResponse::success(200, 'ok', $user);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'required|email',
            'password' => 'required',
            'status' => 'nullable|string',
            'role_uuid' => 'nullable|string',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $actorId = AuthContext::userId($request);

        if (User::where('email', $request->input('email'))->exists()) {
            return ApiResponse::error(400, 'failed to create user (email may already be in use)');
        }

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'password' => Hash::make($request->input('password')),
            'status' => $request->input('status') ?: 'active',
            'created_by' => $actorId,
        ]);

        if ($roleUuid = $request->input('role_uuid')) {
            $this->setRole($user, $roleUuid);
        }

        $user->load('role');
        ActivityLogger::log($actorId, ActivityAction::CREATE, 'users', $user->uuid, null, $user->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(201, 'user created', $user);
    }

    public function update(Request $request, string $uuid)
    {
        $user = User::with('role')->where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        $before = $user->replicate();
        $before->setRelation('role', $user->role);

        $actorId = AuthContext::userId($request);
        $statusChanged = $request->filled('status') && $request->input('status') !== $user->status;
        $roleProvided = $request->has('role_uuid');
        $roleUuid = $request->input('role_uuid');
        $roleChanged = $roleProvided && ($user->role?->uuid !== $roleUuid);

        if ($request->filled('name')) {
            $user->name = $request->input('name');
        }
        if ($request->filled('email')) {
            $user->email = $request->input('email');
        }
        if ($request->filled('status')) {
            $user->status = $request->input('status');
        }
        $user->updated_by = $actorId;
        $user->save();

        if ($roleProvided) {
            $this->setRole($user, (string) $roleUuid);
        }

        if ($statusChanged || $roleChanged) {
            $this->invalidateSessions($user->id);
        }

        $user->load('role');
        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'users', $user->uuid, $before->toArray(), $user->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'user updated', $user);
    }

    public function destroy(Request $request, string $uuid)
    {
        $user = User::with('role')->where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }
        if ($user->role?->is_superadmin) {
            return ApiResponse::error(403, 'superadmin user cannot be deleted');
        }

        $actorId = AuthContext::userId($request);
        $user->deleted_by = $actorId;
        $user->save();
        $user->delete();

        ActivityLogger::log($actorId, ActivityAction::DELETE, 'users', $user->uuid, $user->toArray(), null, $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'user deleted', null);
    }

    public function updateStatus(Request $request, string $uuid)
    {
        $validator = Validator::make($request->all(), ['status' => 'required|string']);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $user = User::with('role')->where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }
        if ($user->role?->is_superadmin) {
            return ApiResponse::error(403, 'superadmin status cannot be changed');
        }

        $oldStatus = $user->status;
        $user->status = $request->input('status');
        $user->save();

        if ($oldStatus !== $user->status) {
            $this->invalidateSessions($user->id);
        }

        $actorId = AuthContext::userId($request);
        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'users', $user->uuid, ['status' => $oldStatus], ['status' => $user->status], $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'status updated', $user);
    }

    public function uploadAvatar(Request $request, string $uuid)
    {
        if (! $request->hasFile('avatar')) {
            return ApiResponse::error(400, 'avatar file is required');
        }

        $user = User::where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        try {
            $path = FileStorage::upload($request->file('avatar'), 'avatars');
        } catch (\RuntimeException $e) {
            return ApiResponse::error(400, $e->getMessage());
        }

        $user->avatar = $path;
        $user->save();

        return ApiResponse::success(200, 'avatar uploaded', ['avatar' => FileStorage::url($path)]);
    }

    public function listSessions(string $uuid)
    {
        $user = User::where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        $sessions = SessionModel::where('user_id', $user->id)->where('expired_at', '>', now())->get();

        return ApiResponse::success(200, 'ok', $sessions);
    }

    public function kickSession(string $uuid, string $sessionUuid)
    {
        $user = User::where('uuid', $uuid)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        $session = SessionModel::where('uuid', $sessionUuid)->where('user_id', $user->id)->first();
        if (! $session) {
            return ApiResponse::error(404, 'user not found');
        }

        Session::delete($session->token, $user->id);
        $session->delete();

        return ApiResponse::success(200, 'session removed', null);
    }

    public function exportCsv(Request $request): StreamedResponse
    {
        $list = $this->filtered($request, User::with('role')->newQuery())->orderByDesc('created_at')->get();
        $filename = 'users_'.now()->format('Ymd_His').'.csv';

        return response()->streamDownload(function () use ($list) {
            $out = fopen('php://output', 'w');
            fputcsv($out, self::EXPORT_COLUMNS);
            foreach ($list as $user) {
                fputcsv($out, $this->exportRow($user));
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    public function exportExcel(Request $request): StreamedResponse
    {
        $list = $this->filtered($request, User::with('role')->newQuery())->orderByDesc('created_at')->get();
        $filename = 'users_'.now()->format('Ymd_His').'.xlsx';

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Users');

        foreach (self::EXPORT_COLUMNS as $i => $col) {
            $sheet->setCellValue([$i + 1, 1], $col);
        }
        foreach ($list as $r => $user) {
            foreach ($this->exportRow($user) as $i => $value) {
                $sheet->setCellValue([$i + 1, $r + 2], $value);
            }
        }

        return new StreamedResponse(function () use ($spreadsheet) {
            (new Xlsx($spreadsheet))->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename={$filename}",
        ]);
    }

    private function exportRow(User $user): array
    {
        return [
            $user->name,
            $user->email,
            $user->status,
            $user->role?->name ?? '',
            $user->last_login_at?->format('Y-m-d H:i:s') ?? '',
            $user->created_at->format('Y-m-d H:i:s'),
        ];
    }

    private function filtered(Request $request, $query)
    {
        if ($search = $request->query('search')) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"));
        }
        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($roleUuid = $request->query('role')) {
            $query->join('roles', 'roles.id', '=', 'users.role_id')->where('roles.uuid', $roleUuid)->select('users.*');
        }
        return $query;
    }

    private function setRole(User $user, string $roleUuid): void
    {
        if ($roleUuid === '') {
            $user->role_id = null;
            $user->save();
            return;
        }
        $role = Role::where('uuid', $roleUuid)->first();
        if ($role) {
            $user->role_id = $role->id;
            $user->save();
        }
    }

    private function invalidateSessions(int $userId): void
    {
        Session::deleteAllForUser($userId);
        SessionModel::where('user_id', $userId)->delete();
    }
}
