<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('user_addresses')) {
            return;
        }

        $columnsToDrop = array_values(array_filter(
            ['recipient_name', 'recipient_phone'],
            fn (string $column): bool => Schema::hasColumn('user_addresses', $column),
        ));

        if ($columnsToDrop !== []) {
            Schema::table('user_addresses', function (Blueprint $table) use ($columnsToDrop): void {
                $table->dropColumn($columnsToDrop);
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('user_addresses')) {
            return;
        }

        Schema::table('user_addresses', function (Blueprint $table): void {
            if (! Schema::hasColumn('user_addresses', 'recipient_name')) {
                $table->string('recipient_name', 150)->nullable()->after('is_default');
            }
            if (! Schema::hasColumn('user_addresses', 'recipient_phone')) {
                $table->string('recipient_phone', 30)->nullable()->after('recipient_name');
            }
        });
    }
};
