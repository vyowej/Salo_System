<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('waiting_requests')) {
            Schema::create('waiting_requests', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('order_id');
                $table->unsignedBigInteger('customer_id');
                $table->unsignedBigInteger('rider_id');
                $table->unsignedTinyInteger('request_no');
                $table->enum('status', ['pending', 'accepted', 'declined', 'expired'])->default('pending');
                $table->unsignedInteger('requested_minutes')->default(5);
                $table->timestamp('requested_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('responded_at')->nullable();
                $table->timestamp('wait_ends_at')->nullable();

                $table->index(['order_id', 'status'], 'idx_waiting_requests_order_status');
                $table->index(['order_id', 'request_no'], 'idx_waiting_requests_order_no');

                $table->foreign('order_id', 'fk_waiting_requests_order')
                    ->references('order_id')
                    ->on('orders')
                    ->onDelete('cascade');
                $table->foreign('customer_id', 'fk_waiting_requests_customer')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('cascade');
                $table->foreign('rider_id', 'fk_waiting_requests_rider')
                    ->references('rider_id')
                    ->on('riders')
                    ->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('waiting_requests');
    }
};
