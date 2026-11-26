<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('riders', 'profile_photo')) {
            Schema::table('riders', function (Blueprint $table): void {
                $table->string('profile_photo', 500)->nullable()->after('preferred_hubs');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('riders', 'profile_photo')) {
            Schema::table('riders', function (Blueprint $table): void {
                $table->dropColumn('profile_photo');
            });
        }
    }
};
