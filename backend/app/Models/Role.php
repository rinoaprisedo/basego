<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Role extends Model
{
    use HasUuid, SoftDeletes;

    protected $fillable = ['name', 'description', 'is_superadmin'];

    protected $hidden = ['id', 'created_by', 'updated_by', 'deleted_by', 'deleted_at', 'name_active'];

    protected function casts(): array
    {
        return [
            'is_superadmin' => 'boolean',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(Permission::class);
    }
}
