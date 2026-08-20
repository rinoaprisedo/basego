<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class MenuSection extends Model
{
    use HasUuid, SoftDeletes;

    protected $fillable = ['name', 'icon', 'order'];

    protected $hidden = ['id', 'created_by', 'updated_by', 'deleted_by', 'deleted_at'];

    public function menus(): HasMany
    {
        return $this->hasMany(Menu::class);
    }
}
