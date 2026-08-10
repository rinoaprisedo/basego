<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PasswordHistory extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'password'];

    protected static function booted(): void
    {
        static::creating(function (self $history) {
            $history->created_at ??= now();
        });
    }
}
