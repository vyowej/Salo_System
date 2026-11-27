<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('rider_support_tickets')) {
            Schema::create('rider_support_tickets', function (Blueprint $table): void {
                $table->bigIncrements('ticket_id');
                $table->string('ticket_reference', 32)->unique();
                $table->unsignedBigInteger('rider_id');
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('order_id')->nullable();
                $table->string('category', 40);
                $table->string('priority', 20)->default('normal');
                $table->string('subject', 150);
                $table->text('description');
                $table->string('status', 20)->default('open');
                $table->text('admin_response')->nullable();
                $table->unsignedBigInteger('resolved_by')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->timestamps();

                $table->index(['rider_id', 'status', 'created_at'], 'idx_rider_support_rider_status');
                $table->index(['status', 'created_at'], 'idx_rider_support_status_created');

                $table->foreign('rider_id', 'fk_rider_support_rider')
                    ->references('rider_id')
                    ->on('riders')
                    ->onDelete('cascade');
                $table->foreign('user_id', 'fk_rider_support_user')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('cascade');
                $table->foreign('order_id', 'fk_rider_support_order')
                    ->references('order_id')
                    ->on('orders')
                    ->onDelete('set null');
                $table->foreign('resolved_by', 'fk_rider_support_resolver')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('set null');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('rider_support_tickets');
    }
};
