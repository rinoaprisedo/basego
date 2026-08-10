<?php

// Mirrors backend-go/config/config.go's Config struct — every value here is
// read somewhere in the codebase (session lifecycle, rate limits, uploads,
// log retention). Don't add a knob without wiring it to real behavior.

return [
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:8801'),

    'session_max_age' => (int) env('SESSION_MAX_AGE', 86400),
    'session_max_concurrent' => (int) env('SESSION_MAX_CONCURRENT', 3),

    'storage_max_size' => (int) env('STORAGE_MAX_SIZE', 2097152),

    'log_cleanup_days' => (int) env('LOG_CLEANUP_DAYS', 90),
    'rate_limit_login' => (int) env('RATE_LIMIT_LOGIN', 5),
    'rate_limit_login_lockout_minutes' => (int) env('RATE_LIMIT_LOGIN_LOCKOUT_MINUTES', 15),
    'rate_limit_api' => (int) env('RATE_LIMIT_API', 100),
];
