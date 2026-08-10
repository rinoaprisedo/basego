<?php

return [
    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_filter(array_map(
        'trim',
        explode(',', env('FRONTEND_URL', 'http://localhost:8801'))
    )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Origin', 'Content-Type', 'Accept', 'X-CSRF-Token', 'Authorization'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
