<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table): void {
            if (! Schema::hasColumn('menu_items', 'stock_quantity')) {
                $table->unsignedInteger('stock_quantity')->nullable()->after('base_price');
            }
            if (! Schema::hasColumn('menu_items', 'low_stock_threshold')) {
                $table->unsignedInteger('low_stock_threshold')->nullable()->after('stock_quantity');
            }
        });

        Schema::table('orders', function (Blueprint $table): void {
            if (! Schema::hasColumn('orders', 'inventory_deducted_at')) {
                $table->timestamp('inventory_deducted_at')->nullable()->after('completed_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (Schema::hasColumn('orders', 'inventory_deducted_at')) {
                $table->dropColumn('inventory_deducted_at');
            }
        });

        Schema::table('menu_items', function (Blueprint $table): void {
            $drops = array_values(array_filter(
                ['stock_quantity', 'low_stock_threshold'],
                static fn (string $col): bool => Schema::hasColumn('menu_items', $col),
            ));
            if ($drops !== []) {
                $table->dropColumn($drops);
            }
        });
    }
};
