<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('call_logs')) {
            Schema::create('call_logs', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('order_id');
                $table->unsignedBigInteger('rider_id');
                $table->unsignedBigInteger('customer_id');
                $table->unsignedInteger('attempt_no');
                $table->enum('status', ['pending', 'answered', 'declined', 'timed_out'])->default('pending');
                $table->boolean('counted_as_strike')->default(false);
                $table->boolean('customer_was_offline')->default(false);
                $table->timestamp('created_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('responded_at')->nullable();

                $table->index(['order_id', 'status'], 'idx_call_logs_order_status');
                $table->index(['order_id', 'attempt_no'], 'idx_call_logs_order_attempt');
                $table->index(['customer_id', 'created_at'], 'idx_call_logs_customer_created');
                $table->index(['rider_id', 'created_at'], 'idx_call_logs_rider_created');

                $table->foreign('order_id', 'fk_call_logs_order')
                    ->references('order_id')
                    ->on('orders')
                    ->onDelete('cascade');
                $table->foreign('rider_id', 'fk_call_logs_rider')
                    ->references('rider_id')
                    ->on('riders')
                    ->onDelete('cascade');
                $table->foreign('customer_id', 'fk_call_logs_customer')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('call_logs');
    }
};
