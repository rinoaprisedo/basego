<?php

use App\Http\Middleware\Csrf;
use App\Http\Middleware\LoginLockoutCheck;
use App\Http\Middleware\MaintenanceMode;
use App\Http\Middleware\RateLimit;
use App\Http\Middleware\RequestSizeLimit;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\SessionAuth;
use App\Http\Middleware\XssSanitizer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Mirrors backend-go/main.go's global router.Use(...) chain, applied to
        // every /api/v1 request in this exact order.
        $middleware->group('api', [
            HandleCors::class,
            SecurityHeaders::class,
            RequestSizeLimit::class,
            Csrf::class,
            XssSanitizer::class,
            MaintenanceMode::class,
            RateLimit::class.':api,'.env('RATE_LIMIT_API', 100).',60',
        ]);

        $middleware->alias([
            'session.auth' => SessionAuth::class,
            'permission' => RequirePermission::class,
            'login.lockout' => LoginLockoutCheck::class,
            'rate_limit' => RateLimit::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
