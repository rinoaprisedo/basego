<?php

namespace App\Support;

use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

/**
 * Redis-backed session store. Mirrors backend-go/session/session.go exactly:
 * Redis is the source of truth (session:<token> key + user_sessions:<userID>
 * sorted set for SESSION_MAX_CONCURRENT eviction). The `sessions` DB table is
 * a separate write-through mirror maintained by the auth/users controllers.
 */
class Session
{
    public const COOKIE_NAME = 'session';

    public static function key(string $token): string
    {
        return "session:{$token}";
    }

    public static function userSetKey(int $userId): string
    {
        return "user_sessions:{$userId}";
    }

    public static function generateToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    /**
     * @param array{user_id:int,user_uuid:string,ip_address:string,user_agent:string} $data
     */
    public static function create(string $token, array $data, int $ttlSeconds, int $maxConcurrent): void
    {
        $userId = $data['user_id'];
        $setKey = self::userSetKey($userId);

        Redis::pipeline(function ($pipe) use ($token, $data, $ttlSeconds, $setKey) {
            $pipe->setex(self::key($token), $ttlSeconds, json_encode($data));
            $pipe->zadd($setKey, time(), $token);
            $pipe->expire($setKey, $ttlSeconds);
        });

        $count = Redis::zcard($setKey);
        if ($count > $maxConcurrent) {
            $toEvict = $count - $maxConcurrent;
            $oldest = Redis::zrange($setKey, 0, $toEvict - 1);
            foreach ($oldest as $oldToken) {
                Redis::del(self::key($oldToken));
                Redis::zrem($setKey, $oldToken);
            }
        }
    }

    /**
     * @return array{user_id:int,user_uuid:string,ip_address:string,user_agent:string}|null
     */
    public static function get(string $token): ?array
    {
        $raw = Redis::get(self::key($token));
        if ($raw === null) {
            return null;
        }

        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    public static function delete(string $token, int $userId): void
    {
        Redis::pipeline(function ($pipe) use ($token, $userId) {
            $pipe->del(self::key($token));
            $pipe->zrem(self::userSetKey($userId), $token);
        });
    }

    public static function deleteAllForUser(int $userId): void
    {
        $setKey = self::userSetKey($userId);
        $tokens = Redis::zrange($setKey, 0, -1);
        foreach ($tokens as $token) {
            Redis::del(self::key($token));
        }
        Redis::del($setKey);
    }
}
