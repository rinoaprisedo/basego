<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\MenuSectionController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    Route::prefix('auth')->group(function () {
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware(['login.lockout', 'rate_limit:login,'.env('RATE_LIMIT_LOGIN', 5).',60']);
        Route::post('/logout', [AuthController::class, 'logout'])->middleware('session.auth');
        Route::get('/me', [AuthController::class, 'me'])->middleware('session.auth');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
            ->middleware('rate_limit:forgot-password,3,3600');
        Route::post('/reset-password', [AuthController::class, 'resetPassword']);
        Route::put('/change-password', [AuthController::class, 'changePassword'])->middleware('session.auth');
    });

    Route::prefix('activity-logs')->group(function () {
        Route::get('/', [ActivityLogController::class, 'index'])->middleware(['session.auth', 'permission:activity-logs,view']);
        Route::get('/{uuid}', [ActivityLogController::class, 'show'])->middleware(['session.auth', 'permission:activity-logs,view']);
        Route::delete('/cleanup', [ActivityLogController::class, 'cleanup'])->middleware(['session.auth', 'permission:activity-logs,delete']);
    });

    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index'])->middleware(['session.auth', 'permission:users,view']);
        Route::get('/export/csv', [UserController::class, 'exportCsv'])->middleware(['session.auth', 'permission:users,view']);
        Route::get('/export/excel', [UserController::class, 'exportExcel'])->middleware(['session.auth', 'permission:users,view']);
        Route::get('/{uuid}', [UserController::class, 'show'])->middleware(['session.auth', 'permission:users,view']);
        Route::post('/', [UserController::class, 'store'])->middleware(['session.auth', 'permission:users,create']);
        Route::put('/{uuid}', [UserController::class, 'update'])->middleware(['session.auth', 'permission:users,edit']);
        Route::delete('/{uuid}', [UserController::class, 'destroy'])->middleware(['session.auth', 'permission:users,delete']);
        Route::put('/{uuid}/status', [UserController::class, 'updateStatus'])->middleware(['session.auth', 'permission:users,edit']);
        Route::post('/{uuid}/avatar', [UserController::class, 'uploadAvatar'])->middleware(['session.auth', 'permission:users,edit', 'rate_limit:upload,10,60']);
        Route::get('/{uuid}/sessions', [UserController::class, 'listSessions'])->middleware(['session.auth', 'permission:users,view']);
        Route::delete('/{uuid}/sessions/{session_uuid}', [UserController::class, 'kickSession'])->middleware(['session.auth', 'permission:users,edit']);
    });

    Route::prefix('roles')->group(function () {
        Route::get('/', [RoleController::class, 'index'])->middleware(['session.auth', 'permission:roles,view']);
        Route::get('/{uuid}', [RoleController::class, 'show'])->middleware(['session.auth', 'permission:roles,view']);
        Route::post('/', [RoleController::class, 'store'])->middleware(['session.auth', 'permission:roles,create']);
        Route::put('/{uuid}', [RoleController::class, 'update'])->middleware(['session.auth', 'permission:roles,edit']);
        Route::delete('/{uuid}', [RoleController::class, 'destroy'])->middleware(['session.auth', 'permission:roles,delete']);
        Route::get('/{uuid}/permissions', [RoleController::class, 'permissions'])->middleware(['session.auth', 'permission:roles,view']);
        Route::put('/{uuid}/permissions', [RoleController::class, 'updatePermissions'])->middleware(['session.auth', 'permission:roles,edit']);
    });

    Route::prefix('menus')->group(function () {
        Route::get('/', [MenuController::class, 'index'])->middleware('session.auth');
        Route::put('/reorder', [MenuController::class, 'reorder'])->middleware(['session.auth', 'permission:menus,edit']);
        Route::get('/{uuid}', [MenuController::class, 'show'])->middleware(['session.auth', 'permission:menus,view']);
        Route::post('/', [MenuController::class, 'store'])->middleware(['session.auth', 'permission:menus,create']);
        Route::put('/{uuid}', [MenuController::class, 'update'])->middleware(['session.auth', 'permission:menus,edit']);
        Route::delete('/{uuid}', [MenuController::class, 'destroy'])->middleware(['session.auth', 'permission:menus,delete']);
    });

    Route::prefix('menu-sections')->group(function () {
        Route::get('/', [MenuSectionController::class, 'index'])->middleware(['session.auth', 'permission:menu-sections,view']);
        Route::put('/reorder', [MenuSectionController::class, 'reorder'])->middleware(['session.auth', 'permission:menu-sections,edit']);
        Route::get('/{uuid}', [MenuSectionController::class, 'show'])->middleware(['session.auth', 'permission:menu-sections,view']);
        Route::post('/', [MenuSectionController::class, 'store'])->middleware(['session.auth', 'permission:menu-sections,create']);
        Route::put('/{uuid}', [MenuSectionController::class, 'update'])->middleware(['session.auth', 'permission:menu-sections,edit']);
        Route::delete('/{uuid}', [MenuSectionController::class, 'destroy'])->middleware(['session.auth', 'permission:menu-sections,delete']);
    });

    Route::prefix('settings')->group(function () {
        Route::get('/public', [SettingController::class, 'public']);
        Route::get('/', [SettingController::class, 'index'])->middleware(['session.auth', 'permission:settings,view']);
        Route::put('/', [SettingController::class, 'bulkUpdate'])->middleware(['session.auth', 'permission:settings,edit']);
        Route::post('/upload', [SettingController::class, 'upload'])->middleware(['session.auth', 'permission:settings,edit', 'rate_limit:upload,10,60']);
    });
});
