<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Menu extends Model
{
    use HasUuid, SoftDeletes;

    protected $fillable = ['menu_section_id', 'parent_id', 'name', 'icon', 'path', 'order', 'is_active'];

    protected $hidden = ['id', 'menu_section_id', 'parent_id', 'created_by', 'updated_by', 'deleted_by', 'deleted_at', 'section', 'parent'];

    protected $appends = ['menu_section_uuid', 'parent_uuid'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(MenuSection::class, 'menu_section_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Menu::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Menu::class, 'parent_id')->orderBy('order');
    }

    protected function menuSectionUuid(): Attribute
    {
        return Attribute::get(fn () => $this->section?->uuid);
    }

    protected function parentUuid(): Attribute
    {
        return Attribute::get(fn () => $this->parent?->uuid);
    }
}
