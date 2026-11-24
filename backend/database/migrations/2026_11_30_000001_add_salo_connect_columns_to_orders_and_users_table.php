<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE orders MODIFY COLUMN order_status ENUM('pending','accepted','preparing','ready','out_for_delivery','arrived','customer_reached','delivered','completed','cancelled','failed','rejected') NOT NULL DEFAULT 'pending'"
            );
        }

        Schema::table('orders', function (Blueprint $table): void {
            if (! Schema::hasColumn('orders', 'arrived_at')) {
                $table->timestamp('arrived_at')->nullable()->after('accepted_at');
            }
            if (! Schema::hasColumn('orders', 'call_attempts')) {
                $table->unsignedInteger('call_attempts')->default(0)->after('arrived_at');
            }
            if (! Schema::hasColumn('orders', 'last_call_resolved_at')) {
                $table->timestamp('last_call_resolved_at')->nullable()->after('call_attempts');
            }
        });

        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'ordering_suspended_until')) {
                $table->timestamp('ordering_suspended_until')->nullable()->after('account_status');
            }
            if (! Schema::hasColumn('users', 'suspension_reason')) {
                $table->string('suspension_reason', 255)->nullable()->after('ordering_suspended_until');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $drop = array_values(array_filter([
                Schema::hasColumn('users', 'ordering_suspended_until') ? 'ordering_suspended_until' : null,
                Schema::hasColumn('users', 'suspension_reason') ? 'suspension_reason' : null,
            ]));
            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });

        Schema::table('orders', function (Blueprint $table): void {
            $drop = array_values(array_filter([
                Schema::hasColumn('orders', 'arrived_at') ? 'arrived_at' : null,
                Schema::hasColumn('orders', 'call_attempts') ? 'call_attempts' : null,
                Schema::hasColumn('orders', 'last_call_resolved_at') ? 'last_call_resolved_at' : null,
            ]));
            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement(
                "ALTER TABLE orders MODIFY COLUMN order_status ENUM('pending','accepted','preparing','ready','out_for_delivery','delivered','completed','cancelled','failed','rejected') NOT NULL DEFAULT 'pending'"
            );
        }
    }
};
