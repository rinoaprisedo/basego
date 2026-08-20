<?php

namespace App\Support;

use Illuminate\Support\Facades\Redis;

/**
 * Mirrors backend-go/middleware/rate_limit.go's LoginLockout/RegisterLoginFailure/
 * ClearLoginFailures: a separate lockout counter (distinct from the generic
 * fixed-window RateLimit) keyed by IP, locking out after maxFails failures
 * within a 1 minute window.
 */
class LoginLockout
{
    public static function isLocked(string $ip): bool
    {
        return (bool) Redis::exists(self::lockKey($ip));
    }

    public static function registerFailure(string $ip, int $maxFails, int $lockoutMin): void
    {
        $failKey = self::failKey($ip);
        $count = Redis::incr($failKey);
        if ($count === 1) {
            Redis::expire($failKey, 60);
        }
        if ($count >= $maxFails) {
            Redis::setex(self::lockKey($ip), $lockoutMin * 60, '1');
            Redis::del($failKey);
        }
    }

    public static function clearFailures(string $ip): void
    {
        Redis::del(self::failKey($ip));
    }

    private static function failKey(string $ip): string
    {
        return "login_fails:{$ip}";
    }

    private static function lockKey(string $ip): string
    {
        return "login_lockout:{$ip}";
    }
}
