<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name');
            $table->string('email')->index();
            $table->string('password');
            $table->string('avatar')->nullable();
            $table->string('status', 20)->default('active');
            $table->timestamp('last_login_at')->nullable();
            $table->foreignId('role_id')->nullable()->constrained('roles')->nullOnDelete();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->unsignedBigInteger('deleted_by')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Partial-unique-index equivalent: email is only unique among non-soft-deleted rows.
        DB::statement(
            "ALTER TABLE users ADD COLUMN email_active VARCHAR(255) " .
            "GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED"
        );
        DB::statement('CREATE UNIQUE INDEX idx_users_email_active ON users (email_active)');
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
