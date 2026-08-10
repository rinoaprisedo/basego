<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_superadmin')->default(false);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->unsignedBigInteger('deleted_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('name');
        });

        // Partial-unique-index equivalent: name is only unique among non-soft-deleted rows.
        DB::statement(
            "ALTER TABLE roles ADD COLUMN name_active VARCHAR(255) " .
            "GENERATED ALWAYS AS (IF(deleted_at IS NULL, name, NULL)) STORED"
        );
        DB::statement('CREATE UNIQUE INDEX idx_roles_name_active ON roles (name_active)');
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
