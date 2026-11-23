<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            if (! Schema::hasColumn('payments', 'provider_name')) {
                $table->string('provider_name', 50)->nullable()->after('payment_method');
            }
            if (! Schema::hasColumn('payments', 'payment_channel')) {
                $table->string('payment_channel', 50)->nullable()->after('provider_name');
            }
            if (! Schema::hasColumn('payments', 'provider_payment_id')) {
                $table->string('provider_payment_id', 120)->nullable()->after('payment_reference');
            }
            if (! Schema::hasColumn('payments', 'provider_transaction_id')) {
                $table->string('provider_transaction_id', 120)->nullable()->after('provider_payment_id');
            }
            if (! Schema::hasColumn('payments', 'checkout_url')) {
                $table->string('checkout_url', 1000)->nullable()->after('provider_response');
            }
            if (! Schema::hasColumn('payments', 'expires_at')) {
                $table->timestamp('expires_at')->nullable()->after('paid_at');
            }

            $table->index(['provider_name', 'provider_payment_id'], 'idx_payments_provider_payment');
            $table->index('provider_transaction_id', 'idx_payments_provider_tx');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            if (Schema::hasIndex('payments', 'idx_payments_provider_payment')) {
                $table->dropIndex('idx_payments_provider_payment');
            }
            if (Schema::hasIndex('payments', 'idx_payments_provider_tx')) {
                $table->dropIndex('idx_payments_provider_tx');
            }

            $drops = array_values(array_filter(
                ['provider_name', 'payment_channel', 'provider_payment_id', 'provider_transaction_id', 'checkout_url', 'expires_at'],
                static fn (string $col): bool => Schema::hasColumn('payments', $col),
            ));

            if ($drops !== []) {
                $table->dropColumn($drops);
            }
        });
    }
};
