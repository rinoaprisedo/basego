<?php

namespace App\Jobs;

use App\Models\ActivityLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Mirrors backend-go/modules/activity_logs/logger.go's worker: persists a log
 * entry off the request/response cycle so callers never block on the write.
 * Dispatched onto the redis queue by App\Support\ActivityLogger::log().
 */
class LogActivityJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly ?int $userId,
        public readonly string $action,
        public readonly ?string $module,
        public readonly ?string $recordId,
        public readonly mixed $oldValue,
        public readonly mixed $newValue,
        public readonly ?string $ipAddress,
        public readonly ?string $userAgent,
    ) {}

    public function handle(): void
    {
        ActivityLog::create([
            'user_id' => $this->userId,
            'action' => $this->action,
            'module' => $this->module,
            'record_id' => $this->recordId,
            'old_value' => $this->oldValue,
            'new_value' => $this->newValue,
            'ip_address' => $this->ipAddress,
            'user_agent' => $this->userAgent,
        ]);
    }
}
