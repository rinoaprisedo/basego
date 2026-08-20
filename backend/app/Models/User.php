<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Model
{
    use HasUuid, SoftDeletes;

    protected $fillable = ['name', 'email', 'password', 'avatar', 'status', 'last_login_at', 'role_id'];

    protected $hidden = ['id', 'password', 'role_id', 'created_by', 'updated_by', 'deleted_by', 'deleted_at', 'email_active'];

    protected function casts(): array
    {
        return [
            'last_login_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function isSuperadmin(): bool
    {
        return (bool) $this->role?->is_superadmin;
    }
}
