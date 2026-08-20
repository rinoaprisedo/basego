<?php

namespace App\Support;

/**
 * Mirrors backend-go/modules/auth/password.go's ValidatePasswordPolicy:
 * min 8 chars, uppercase, number, symbol. Hashing itself uses Laravel's
 * Hash facade (bcrypt, cost from BCRYPT_ROUNDS=12 in .env — same cost as Go's
 * bcryptCost constant).
 */
class Password
{
    public static function validatePolicy(string $password): ?string
    {
        if (strlen($password) < 8) {
            return 'password must be at least 8 characters';
        }
        if (! preg_match('/[A-Z]/', $password)) {
            return 'password must contain at least one uppercase letter';
        }
        if (! preg_match('/[0-9]/', $password)) {
            return 'password must contain at least one number';
        }
        if (! preg_match('/[^a-zA-Z0-9]/', $password)) {
            return 'password must contain at least one symbol';
        }
        return null;
    }
}
