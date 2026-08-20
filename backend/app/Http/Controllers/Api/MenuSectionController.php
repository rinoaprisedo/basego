<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MenuSection;
use App\Support\ActivityAction;
use App\Support\ActivityLogger;
use App\Support\ApiResponse;
use App\Support\AuthContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MenuSectionController extends Controller
{
    public function index()
    {
        $list = MenuSection::orderBy('order')->get();
        return ApiResponse::success(200, 'ok', $list);
    }

    public function show(string $uuid)
    {
        $section = MenuSection::where('uuid', $uuid)->first();
        if (! $section) {
            return ApiResponse::error(404, 'menu section not found');
        }
        return ApiResponse::success(200, 'ok', $section);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), ['name' => 'required']);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $actorId = AuthContext::userId($request);
        $section = MenuSection::create([
            'name' => $request->input('name'),
            'icon' => $request->input('icon', ''),
            'order' => (int) $request->input('order', 0),
            'created_by' => $actorId,
        ]);

        ActivityLogger::log($actorId, ActivityAction::CREATE, 'menu_sections', $section->uuid, null, $section->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(201, 'menu section created', $section);
    }

    public function update(Request $request, string $uuid)
    {
        $validator = Validator::make($request->all(), ['name' => 'required']);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $section = MenuSection::where('uuid', $uuid)->first();
        if (! $section) {
            return ApiResponse::error(404, 'menu section not found');
        }

        $before = $section->replicate();
        $actorId = AuthContext::userId($request);
        $section->name = $request->input('name');
        $section->icon = $request->input('icon', '');
        $section->order = (int) $request->input('order', 0);
        $section->updated_by = $actorId;
        $section->save();

        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'menu_sections', $section->uuid, $before->toArray(), $section->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'menu section updated', $section);
    }

    public function destroy(Request $request, string $uuid)
    {
        $section = MenuSection::where('uuid', $uuid)->first();
        if (! $section) {
            return ApiResponse::error(404, 'menu section not found');
        }

        $actorId = AuthContext::userId($request);
        $section->deleted_by = $actorId;
        $section->save();
        $section->delete();

        ActivityLogger::log($actorId, ActivityAction::DELETE, 'menu_sections', $section->uuid, $section->toArray(), null, $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'menu section deleted', null);
    }

    public function reorder(Request $request)
    {
        $items = $request->json()->all();
        if (! is_array($items)) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        foreach ($items as $item) {
            if (! isset($item['uuid'])) {
                continue;
            }
            MenuSection::where('uuid', $item['uuid'])->update(['order' => (int) ($item['order'] ?? 0)]);
        }

        return ApiResponse::success(200, 'reordered', null);
    }
}
