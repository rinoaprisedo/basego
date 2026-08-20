<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use HasUuid;

    const CREATED_AT = null;
    const UPDATED_AT = 'updated_at';

    protected $fillable = ['key', 'value', 'type'];

    protected $hidden = ['id'];
}
