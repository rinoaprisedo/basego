<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

/**
 * Mirrors backend-go/utils/response.go's envelope exactly:
 * {success, message, data?, meta?} — data/meta are omitted (not null) when absent.
 */
class ApiResponse
{
    public static function success(int $code, string $message, mixed $data = null): JsonResponse
    {
        $body = ['success' => true, 'message' => $message];
        if ($data !== null) {
            $body['data'] = $data;
        }
        return response()->json($body, $code);
    }

    public static function successList(string $message, mixed $data, array $meta): JsonResponse
    {
        // Go's SuccessList always forces HTTP 200 regardless of caller intent — replicated here.
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $data,
            'meta' => $meta,
        ], 200);
    }

    public static function error(int $code, string $message): JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], $code);
    }
}
