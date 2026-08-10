<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Session extends Model
{
    use HasUuid;

    public $timestamps = false;

    protected $fillable = ['uuid', 'user_id', 'token', 'ip_address', 'user_agent', 'expired_at'];

    protected $hidden = ['id', 'user_id', 'token'];

    protected function casts(): array
    {
        return [
            'expired_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
