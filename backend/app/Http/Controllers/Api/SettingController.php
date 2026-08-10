<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\ActivityAction;
use App\Support\ActivityLogger;
use App\Support\ApiResponse;
use App\Support\AuthContext;
use App\Support\FileStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class SettingController extends Controller
{
    private const PUBLIC_KEYS = ['app_name', 'app_logo', 'app_favicon', 'primary_color'];
    private const UPLOAD_TARGETS = ['app_logo', 'app_favicon'];

    public function index()
    {
        return ApiResponse::success(200, 'ok', $this->allAsMap());
    }

    public function public()
    {
        $all = $this->allAsMap();
        $result = [];
        foreach (self::PUBLIC_KEYS as $key) {
            if (array_key_exists($key, $all)) {
                $result[$key] = $all[$key];
            }
        }
        return ApiResponse::success(200, 'ok', $result);
    }

    public function bulkUpdate(Request $request)
    {
        $payload = $request->json()->all();
        if (! is_array($payload)) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        foreach ($payload as $key => $value) {
            $this->upsert((string) $key, (string) $value);
        }

        if (array_key_exists('maintenance_mode', $payload)) {
            Redis::del('settings:maintenance_mode');
        }

        $actorId = AuthContext::userId($request);
        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'settings', null, null, $payload, $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'settings updated', null);
    }

    public function upload(Request $request)
    {
        $target = (string) $request->input('target');
        if (! in_array($target, self::UPLOAD_TARGETS, true)) {
            return ApiResponse::error(400, 'target must be app_logo or app_favicon');
        }

        if (! $request->hasFile('file')) {
            return ApiResponse::error(400, 'file is required');
        }

        try {
            $path = FileStorage::upload($request->file('file'), 'settings');
        } catch (\RuntimeException $e) {
            return ApiResponse::error(400, $e->getMessage());
        }

        $this->upsert($target, $path, 'file');

        return ApiResponse::success(200, 'file uploaded', ['url' => FileStorage::url($path)]);
    }

    private function allAsMap(): array
    {
        return Setting::all(['key', 'value'])->pluck('value', 'key')->all();
    }

    private function upsert(string $key, string $value, string $type = 'string'): void
    {
        $setting = Setting::where('key', $key)->first();
        if ($setting) {
            $setting->value = $value;
            $setting->save();
            return;
        }
        Setting::create(['key' => $key, 'value' => $value, 'type' => $type]);
    }
}
