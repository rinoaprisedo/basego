<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivityLog extends Model
{
    use HasUuid;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'action', 'module', 'record_id', 'old_value', 'new_value', 'ip_address', 'user_agent',
    ];

    protected $hidden = ['id', 'user_id', 'actor'];

    protected $appends = ['user'];

    protected function casts(): array
    {
        return [
            'old_value' => 'array',
            'new_value' => 'array',
        ];
    }

    /**
     * Named `actor` (not `user`) to avoid colliding with the `user` computed
     * attribute below — mirrors Go's LogWithUser.User {uuid, name} DTO,
     * resolved via a plain column lookup to sidestep the users<->activity_logs
     * import-cycle the Go repository comment describes.
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    protected function user(): Attribute
    {
        return Attribute::get(function () {
            if (! $this->relationLoaded('actor') || $this->actor === null) {
                return null;
            }
            return ['uuid' => $this->actor->uuid, 'name' => $this->actor->name];
        });
    }
}
