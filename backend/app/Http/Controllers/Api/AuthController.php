<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PasswordHistory;
use App\Models\PasswordResetToken;
use App\Models\Session as SessionModel;
use App\Models\User;
use App\Support\ActivityAction;
use App\Support\ActivityLogger;
use App\Support\ApiResponse;
use App\Support\AuthContext;
use App\Support\LoginLockout;
use App\Support\Password;
use App\Support\Session;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $email = $request->input('email');
        $password = $request->input('password');
        $ip = $request->ip();
        $userAgent = (string) $request->userAgent();

        $user = User::with('role')->where('email', $email)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            LoginLockout::registerFailure($ip, (int) config('baseadmin.rate_limit_login'), (int) config('baseadmin.rate_limit_login_lockout_minutes'));
            ActivityLogger::log(null, ActivityAction::LOGIN, 'auth', null, null, ['email' => $email, 'result' => 'failed'], $ip, $userAgent);
            return ApiResponse::error(401, 'invalid email or password');
        }

        if ($user->status !== 'active') {
            return ApiResponse::error(403, 'account is not active');
        }

        $token = Session::generateToken();
        Session::create($token, [
            'user_id' => $user->id,
            'user_uuid' => $user->uuid,
            'ip_address' => $ip,
            'user_agent' => $userAgent,
        ], (int) config('baseadmin.session_max_age'), (int) config('baseadmin.session_max_concurrent'));

        SessionModel::create([
            'user_id' => $user->id,
            'token' => $token,
            'ip_address' => $ip,
            'user_agent' => $userAgent,
            'expired_at' => now()->addSeconds((int) config('baseadmin.session_max_age')),
        ]);

        $user->forceFill(['last_login_at' => now()])->save();

        LoginLockout::clearFailures($ip);
        ActivityLogger::log($user->id, ActivityAction::LOGIN, 'auth', $user->uuid, null, ['result' => 'success'], $ip, $userAgent);

        return ApiResponse::success(200, 'login successful', $this->profile($user))
            ->withCookie($this->sessionCookie($token, (int) config('baseadmin.session_max_age')));
    }

    public function logout(Request $request)
    {
        $token = AuthContext::sessionToken($request);
        $userId = AuthContext::userId($request);

        if ($token && $userId) {
            Session::delete($token, $userId);
            SessionModel::where('token', $token)->delete();
            ActivityLogger::log($userId, ActivityAction::LOGOUT, 'auth', null, null, null, $request->ip(), (string) $request->userAgent());
        }

        return ApiResponse::success(200, 'logout successful', null)
            ->withCookie($this->sessionCookie('', -1));
    }

    public function me(Request $request)
    {
        $userId = AuthContext::userId($request);
        if ($userId === null) {
            return ApiResponse::error(401, 'authentication required');
        }

        $user = User::with('role')->find($userId);
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        return ApiResponse::success(200, 'ok', $this->profile($user));
    }

    public function forgotPassword(Request $request)
    {
        $validator = Validator::make($request->all(), ['email' => 'required|email']);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $email = $request->input('email');
        $user = User::where('email', $email)->first();

        if ($user) {
            $token = Session::generateToken();
            PasswordResetToken::create([
                'email' => $email,
                'token' => $token,
                'expired_at' => now()->addHour(),
            ]);
            // SMTP is not configured for the base project; log instead of sending.
            logger()->info("password reset requested for {$email} token: {$token}");
        }

        return ApiResponse::success(200, 'if the email exists, a reset link has been sent', null);
    }

    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'token' => 'required',
            'new_password' => 'required',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        if ($policyError = Password::validatePolicy($request->input('new_password'))) {
            return ApiResponse::error(400, $policyError);
        }

        $reset = PasswordResetToken::where('token', $request->input('token'))->whereNull('used_at')->first();
        if (! $reset) {
            return ApiResponse::error(400, 'invalid or already used token');
        }
        if (now()->greaterThan($reset->expired_at)) {
            return ApiResponse::error(400, 'token has expired');
        }

        $user = User::where('email', $reset->email)->first();
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        $hashed = Hash::make($request->input('new_password'));
        $user->forceFill(['password' => $hashed])->save();
        PasswordHistory::create(['user_id' => $user->id, 'password' => $hashed]);
        $reset->forceFill(['used_at' => now()])->save();

        Session::deleteAllForUser($user->id);

        return ApiResponse::success(200, 'password reset successfully', null);
    }

    public function changePassword(Request $request)
    {
        $userId = AuthContext::userId($request);
        if ($userId === null) {
            return ApiResponse::error(401, 'authentication required');
        }

        $validator = Validator::make($request->all(), [
            'current_password' => 'required',
            'new_password' => 'required',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        if ($policyError = Password::validatePolicy($request->input('new_password'))) {
            return ApiResponse::error(400, $policyError);
        }

        $user = User::find($userId);
        if (! $user) {
            return ApiResponse::error(404, 'user not found');
        }

        if (! Hash::check($request->input('current_password'), $user->password)) {
            return ApiResponse::error(400, 'current password is incorrect');
        }

        $newPassword = $request->input('new_password');
        $recent = PasswordHistory::where('user_id', $user->id)->orderByDesc('created_at')->take(5)->get();
        foreach ($recent as $history) {
            if (Hash::check($newPassword, $history->password)) {
                return ApiResponse::error(400, 'cannot reuse any of your last 5 passwords');
            }
        }
        if (Hash::check($newPassword, $user->password)) {
            return ApiResponse::error(400, 'cannot reuse any of your last 5 passwords');
        }

        $hashed = Hash::make($newPassword);
        $user->forceFill(['password' => $hashed])->save();
        PasswordHistory::create(['user_id' => $user->id, 'password' => $hashed]);

        return ApiResponse::success(200, 'password changed successfully', null);
    }

    private function profile(User $user): array
    {
        $roleNames = [];
        $isSuperadmin = false;
        $permissions = [];

        if ($user->role) {
            $roleNames[] = $user->role->name;
            $isSuperadmin = (bool) $user->role->is_superadmin;
            if (! $isSuperadmin) {
                $permissions = $this->rolePermissions($user->role->id);
            }
        }

        return [
            'uuid' => $user->uuid,
            'name' => $user->name,
            'email' => $user->email,
            'avatar' => $user->avatar,
            'status' => $user->status,
            'roles' => $roleNames,
            'is_superadmin' => $isSuperadmin,
            'permissions' => $permissions,
        ];
    }

    private function rolePermissions(int $roleId): array
    {
        return \Illuminate\Support\Facades\DB::table('permissions')
            ->join('menus', 'menus.id', '=', 'permissions.menu_id')
            ->where('permissions.role_id', $roleId)
            ->selectRaw('menus.path as path,
                MAX(CASE WHEN permissions.can_view THEN 1 ELSE 0 END) as can_view,
                MAX(CASE WHEN permissions.can_create THEN 1 ELSE 0 END) as can_create,
                MAX(CASE WHEN permissions.can_edit THEN 1 ELSE 0 END) as can_edit,
                MAX(CASE WHEN permissions.can_delete THEN 1 ELSE 0 END) as can_delete')
            ->groupBy('menus.path')
            ->get()
            ->map(fn ($row) => [
                'path' => $row->path,
                'can_view' => (bool) $row->can_view,
                'can_create' => (bool) $row->can_create,
                'can_edit' => (bool) $row->can_edit,
                'can_delete' => (bool) $row->can_delete,
            ])->all();
    }

    private function sessionCookie(string $token, int $maxAgeSeconds): \Symfony\Component\HttpFoundation\Cookie
    {
        return Cookie::make(
            name: Session::COOKIE_NAME,
            value: $token,
            minutes: $maxAgeSeconds > 0 ? intdiv($maxAgeSeconds, 60) : -1,
            path: '/',
            domain: null,
            secure: app()->environment('production'),
            httpOnly: true,
            raw: true,
            sameSite: 'strict',
        );
    }
}
