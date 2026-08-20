<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Support\ApiResponse;
use App\Support\Pagination;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $p = Pagination::fromRequest($request, 'created_at');

        $query = ActivityLog::query()->with('actor');

        if ($userUuid = $request->query('user')) {
            $query->whereHas('actor', fn ($q) => $q->where('uuid', $userUuid));
        }
        if ($module = $request->query('module')) {
            $query->where('module', $module);
        }
        if ($action = $request->query('action')) {
            $query->where('action', $action);
        }
        if ($dateFrom = $request->query('date_from')) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo = $request->query('date_to')) {
            $query->where('created_at', '<=', $dateTo);
        }

        $total = (clone $query)->count();
        $list = $query->orderBy($p->sortBy, $p->sortDir)->skip($p->offset())->take($p->limit)->get();

        return ApiResponse::successList('ok', $list, Pagination::buildMeta($p->page, $p->limit, $total));
    }

    public function show(string $uuid)
    {
        $entry = ActivityLog::with('actor')->where('uuid', $uuid)->first();
        if (! $entry) {
            return ApiResponse::error(404, 'activity log not found');
        }

        return ApiResponse::success(200, 'ok', $entry);
    }

    public function cleanup()
    {
        $cutoff = now()->subDays((int) config('baseadmin.log_cleanup_days'));
        $deleted = ActivityLog::where('created_at', '<', $cutoff)->delete();

        return ApiResponse::success(200, 'activity logs cleaned up', ['deleted' => $deleted]);
    }
}
