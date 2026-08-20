<?php

namespace App\Support;

use App\Jobs\LogActivityJob;

/**
 * Mirrors backend-go/modules/activity_logs/logger.go's LogActivity() free
 * function: fire-and-forget, safe to call from any controller/service.
 */
class ActivityLogger
{
    public static function log(
        ?int $userId,
        string $action,
        ?string $module,
        ?string $recordId,
        mixed $oldValue,
        mixed $newValue,
        ?string $ip,
        ?string $userAgent,
    ): void {
        LogActivityJob::dispatch($userId, $action, $module, $recordId, $oldValue, $newValue, $ip, $userAgent);
    }
}
