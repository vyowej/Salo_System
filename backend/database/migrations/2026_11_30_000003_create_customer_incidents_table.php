<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer_incidents')) {
            Schema::create('customer_incidents', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('order_id');
                $table->enum('type', ['rider_declined_wait', 'unreachable_cancelled']);
                $table->text('details')->nullable();
                $table->timestamp('created_at')->nullable();

                $table->index(['user_id', 'created_at'], 'idx_customer_incidents_user_created');
                $table->index(['order_id', 'type'], 'idx_customer_incidents_order_type');

                $table->foreign('user_id', 'fk_customer_incidents_user')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('cascade');
                $table->foreign('order_id', 'fk_customer_incidents_order')
                    ->references('order_id')
                    ->on('orders')
                    ->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_incidents');
    }
};
