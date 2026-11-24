<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('conversations')) {
            Schema::create('conversations', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('order_id')->unique('uk_conversations_order');
                $table->unsignedBigInteger('customer_id');
                $table->unsignedBigInteger('rider_id');
                $table->timestamps();

                $table->index(['customer_id', 'updated_at'], 'idx_conversations_customer');
                $table->index(['rider_id', 'updated_at'], 'idx_conversations_rider');

                $table->foreign('order_id', 'fk_conversations_order')
                    ->references('order_id')
                    ->on('orders')
                    ->onDelete('cascade');
                $table->foreign('customer_id', 'fk_conversations_customer')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('cascade');
                $table->foreign('rider_id', 'fk_conversations_rider')
                    ->references('rider_id')
                    ->on('riders')
                    ->onDelete('cascade');
            });
        }

        if (! Schema::hasTable('messages')) {
            Schema::create('messages', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('conversation_id');
                $table->unsignedBigInteger('sender_id');
                $table->text('message');
                $table->timestamp('created_at')->nullable();
                $table->timestamp('read_at')->nullable();

                $table->index(['conversation_id', 'created_at'], 'idx_messages_conv_created');
                $table->index(['conversation_id', 'read_at'], 'idx_messages_conv_read');

                $table->foreign('conversation_id', 'fk_messages_conversation')
                    ->references('id')
                    ->on('conversations')
                    ->onDelete('cascade');
                $table->foreign('sender_id', 'fk_messages_sender')
                    ->references('user_id')
                    ->on('users')
                    ->onDelete('cascade');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
    }
};
