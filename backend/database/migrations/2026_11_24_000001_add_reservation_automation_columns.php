<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('reservations')) {
            return;
        }

        Schema::table('reservations', function (Blueprint $table): void {
            if (! Schema::hasColumn('reservations', 'reminder_sent_at')) {
                $table->dateTime('reminder_sent_at')->nullable()->after('expired_at');
            }
            if (! Schema::hasColumn('reservations', 'expiry_warning_sent_at')) {
                $table->dateTime('expiry_warning_sent_at')->nullable()->after('reminder_sent_at');
            }
        });

        $hasIndex = DB::select("SHOW INDEX FROM reservations WHERE Key_name = 'idx_reservations_status_start'");
        if (empty($hasIndex)) {
            Schema::table('reservations', function (Blueprint $table): void {
                $table->index(['reservation_status', 'reservation_start'], 'idx_reservations_status_start');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('reservations')) {
            return;
        }

        $hasIndex = DB::select("SHOW INDEX FROM reservations WHERE Key_name = 'idx_reservations_status_start'");
        if (! empty($hasIndex)) {
            Schema::table('reservations', function (Blueprint $table): void {
                $table->dropIndex('idx_reservations_status_start');
            });
        }

        Schema::table('reservations', function (Blueprint $table): void {
            $toDrop = [];
            if (Schema::hasColumn('reservations', 'expiry_warning_sent_at')) {
                $toDrop[] = 'expiry_warning_sent_at';
            }
            if (Schema::hasColumn('reservations', 'reminder_sent_at')) {
                $toDrop[] = 'reminder_sent_at';
            }
            if ($toDrop !== []) {
                $table->dropColumn($toDrop);
            }
        });
    }
};
