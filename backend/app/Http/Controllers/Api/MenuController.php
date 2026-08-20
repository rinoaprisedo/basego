<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Menu;
use App\Models\MenuSection;
use App\Support\ActivityAction;
use App\Support\ActivityLogger;
use App\Support\ApiResponse;
use App\Support\AuthContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MenuController extends Controller
{
    public function index(Request $request)
    {
        $sections = MenuSection::orderBy('order')->get();

        $menuQuery = Menu::query()->orderBy('order');
        if ($request->query('is_active') !== null) {
            $menuQuery->where('is_active', $request->query('is_active') === 'true');
        }
        if ($sectionUuid = $request->query('section')) {
            $section = MenuSection::where('uuid', $sectionUuid)->first();
            if ($section) {
                $menuQuery->where('menu_section_id', $section->id);
            }
        }
        $allMenus = $menuQuery->get();

        // Top-level items are those with no parent (parent_id null); children
        // are nested recursively under their parent regardless of depth.
        $childrenByParent = $allMenus->whereNotNull('parent_id')->groupBy('parent_id');
        $buildChildren = function (Menu $menu) use (&$buildChildren, $childrenByParent) {
            $kids = $childrenByParent->get($menu->id, collect());
            return $menu->toArray() + [
                'children' => $kids->map(fn (Menu $child) => $buildChildren($child))->values(),
            ];
        };

        $matched = [];
        $result = [];
        foreach ($sections as $section) {
            $menusForSection = [];
            foreach ($allMenus as $menu) {
                $matched[$menu->id] = $matched[$menu->id] ?? false;
                if ($menu->parent_id !== null) {
                    $matched[$menu->id] = true;
                    continue;
                }
                if ($menu->menu_section_id === $section->id) {
                    $menusForSection[] = $buildChildren($menu);
                    $matched[$menu->id] = true;
                }
            }
            $result[] = array_merge($section->toArray(), ['menus' => $menusForSection]);
        }

        $orphaned = $allMenus->filter(fn ($menu) => $menu->parent_id === null && ! ($matched[$menu->id] ?? false))->values();
        if ($orphaned->isNotEmpty()) {
            $result[] = [
                'uuid' => '00000000-0000-0000-0000-000000000000',
                'name' => 'Uncategorized',
                'icon' => 'FolderOpen',
                'order' => 0,
                'created_at' => '0001-01-01T00:00:00Z',
                'updated_at' => '0001-01-01T00:00:00Z',
                'menus' => $orphaned->map(fn (Menu $menu) => $buildChildren($menu))->values(),
            ];
        }

        return ApiResponse::success(200, 'ok', $result);
    }

    public function show(string $uuid)
    {
        $menu = Menu::with('section')->where('uuid', $uuid)->first();
        if (! $menu) {
            return ApiResponse::error(404, 'menu not found');
        }
        return ApiResponse::success(200, 'ok', $menu);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'menu_section_uuid' => 'required',
            'name' => 'required',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $section = MenuSection::where('uuid', $request->input('menu_section_uuid'))->first();
        if (! $section) {
            return ApiResponse::error(400, 'invalid menu_section_uuid');
        }

        $parentId = null;
        if ($parentUuid = $request->input('parent_uuid')) {
            $parent = Menu::where('uuid', $parentUuid)->first();
            if (! $parent) {
                return ApiResponse::error(400, 'invalid parent_uuid');
            }
            $parentId = $parent->id;
        }

        $actorId = AuthContext::userId($request);
        $menu = Menu::create([
            'menu_section_id' => $section->id,
            'parent_id' => $parentId,
            'name' => $request->input('name'),
            'icon' => $request->input('icon', ''),
            'path' => $request->input('path', ''),
            'order' => (int) $request->input('order', 0),
            'is_active' => (bool) $request->input('is_active', false),
            'created_by' => $actorId,
        ]);
        $menu->setRelation('section', $section);

        ActivityLogger::log($actorId, ActivityAction::CREATE, 'menus', $menu->uuid, null, $menu->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(201, 'menu created', $menu);
    }

    public function update(Request $request, string $uuid)
    {
        $validator = Validator::make($request->all(), [
            'menu_section_uuid' => 'required',
            'name' => 'required',
        ]);
        if ($validator->fails()) {
            return ApiResponse::error(400, 'invalid request payload');
        }

        $menu = Menu::with('section')->where('uuid', $uuid)->first();
        if (! $menu) {
            return ApiResponse::error(404, 'menu not found');
        }

        $before = $menu->replicate();
        $before->setRelation('section', $menu->section);

        $section = MenuSection::where('uuid', $request->input('menu_section_uuid'))->first();
        if (! $section) {
            return ApiResponse::error(400, 'invalid menu_section_uuid');
        }

        if ($request->has('parent_uuid')) {
            $parentUuid = $request->input('parent_uuid');
            if ($parentUuid) {
                $parent = Menu::where('uuid', $parentUuid)->first();
                if (! $parent) {
                    return ApiResponse::error(400, 'invalid parent_uuid');
                }
                $menu->parent_id = $parent->id;
            } else {
                $menu->parent_id = null;
            }
        }

        $actorId = AuthContext::userId($request);
        $menu->menu_section_id = $section->id;
        $menu->name = $request->input('name');
        $menu->icon = $request->input('icon', '');
        $menu->path = $request->input('path', '');
        $menu->order = (int) $request->input('order', 0);
        $menu->is_active = (bool) $request->input('is_active', false);
        $menu->updated_by = $actorId;
        $menu->save();
        $menu->setRelation('section', $section);

        ActivityLogger::log($actorId, ActivityAction::UPDATE, 'menus', $menu->uuid, $before->toArray(), $menu->toArray(), $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'menu updated', $menu);
    }

    public function destroy(Request $request, string $uuid)
    {
        $menu = Menu::where('uuid', $uuid)->first();
        if (! $menu) {
            return ApiResponse::error(404, 'menu not found');
        }

        $actorId = AuthContext::userId($request);
        $menu->deleted_by = $actorId;
        $menu->save();
        $menu->delete();

        ActivityLogger::log($actorId, ActivityAction::DELETE, 'menus', $menu->uuid, $menu->toArray(), null, $request->ip(), (string) $request->userAgent());

        return ApiResponse::success(200, 'menu deleted', null);
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
            Menu::where('uuid', $item['uuid'])->update(['order' => (int) ($item['order'] ?? 0)]);
        }

        return ApiResponse::success(200, 'reordered', null);
    }
}
