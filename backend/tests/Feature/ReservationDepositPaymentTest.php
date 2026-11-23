<?php

namespace Tests\Feature;

use App\Features\Payments\Services\RefundService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ReservationDepositPaymentTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'rdep'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => 'Res',
            'last_name' => 'Tester',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createDepositReservation(string $status = 'awaiting_payment', string $depositStatus = 'pending'): array
    {
        $owner = $this->createUser('customer', 'rdepown');
        $customer = $this->createUser('customer', 'rdepcust');
        $admin = $this->createUser('admin', 'rdepadm');

        $addrId = app(\App\Support\AddressService::class)->createAddress([
            'province' => 'Metro Manila',
            'city' => 'Quezon City',
            'barangay' => 'Diliman',
            'street' => '42 Maginhawa St',
        ]);

        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Deposit Bistro',
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'contact_phone' => '09172223333',
            'business_email' => 'dep_'.random_int(1000, 9999).'@example.com',
            'address_id' => $addrId,
            'offers_delivery' => 1,
            'offers_pickup' => 1,
            'offers_dine_in' => 1,
            'accepting_orders' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'reservation_deposit_required' => 1,
            'reservation_deposit_amount' => '250.00',
            'reservation_service_fee' => '35.00',
            'reservation_cancellation_cutoff_minutes' => 120,
            'restaurant_status' => 'active',
            'is_published' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('restaurant_owners')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $owner->user_id,
        ]);

        $tableId = (int) DB::table('restaurant_tables')->insertGetId([
            'restaurant_id' => $restaurantId,
            'table_name' => 'T1',
            'dining_area' => 'Main Dining',
            'seating_capacity' => 4,
            'min_party_size' => 1,
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $start = now('Asia/Manila')->addDays(2)->setTime(18, 0, 0);
        $end = $start->copy()->addMinutes(90);

        $reservationId = (int) DB::table('reservations')->insertGetId([
            'reservation_reference' => 'RES-TEST-'.random_int(10000, 99999),
            'customer_id' => $customer->user_id,
            'restaurant_id' => $restaurantId,
            'table_id' => $tableId,
            'contact_name' => 'Res Tester',
            'contact_phone' => '09171234567',
            'reservation_start' => $start->format('Y-m-d H:i:s'),
            'reservation_end' => $end->format('Y-m-d H:i:s'),
            'number_of_guests' => 2,
            'reservation_status' => $status,
            'deposit_amount' => '250.00',
            'deposit_status' => $depositStatus,
            'service_fee' => '35.00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$owner, $customer, $admin, $restaurantId, $reservationId];
    }

    public function test_deposit_payment_blocked_while_pending_and_blocks_second_payment(): void
    {
        [, $customer, , , $pendingResId] = $this->createDepositReservation('pending', 'pending');

        // Cannot pay while reservation is pending
        $this->actingAs($customer)->postJson("/api/customer/reservations/{$pendingResId}/deposit/initiate", [
            'payment_method' => 'gcash',
            'idempotency_key' => 'idem-pending-1234',
        ])->assertStatus(409);

        [, $customer2, , , $awaitingResId] = $this->createDepositReservation('awaiting_payment', 'pending');

        // First payment succeeds and charges exact deposit_amount (250.00, not 250+35)
        $payRes = $this->actingAs($customer2)->postJson("/api/customer/reservations/{$awaitingResId}/deposit/initiate", [
            'payment_method' => 'gcash',
            'idempotency_key' => 'idem-await-1111',
        ])->assertStatus(201);

        $paymentId = (int) $payRes->json('data.payment.payment_id');
        $this->assertEquals(250.0, (float) $payRes->json('data.payment.amount'));

        // Second payment blocked while pending regardless of idempotency key
        $this->actingAs($customer2)->postJson("/api/customer/reservations/{$awaitingResId}/deposit/initiate", [
            'payment_method' => 'maya',
            'idempotency_key' => 'idem-await-2222',
        ])->assertStatus(409);

        // Confirm sandbox payment -> reservation becomes confirmed & ledger payment journal posted
        $this->actingAs($customer2)->postJson("/api/customer/payments/{$paymentId}/confirm")
            ->assertOk()
            ->assertJsonPath('data.payment.payment_status', 'paid');

        $resRow = DB::table('reservations')->where('reservation_id', $awaitingResId)->first();
        $this->assertSame('confirmed', $resRow->reservation_status);
        $this->assertSame('paid', $resRow->deposit_status);

        $journal = DB::table('ledger_journals')
            ->where('reservation_id', $awaitingResId)
            ->where('journal_type', 'payment')
            ->first();
        $this->assertNotNull($journal);

        // Second payment blocked while paid
        $this->actingAs($customer2)->postJson("/api/customer/reservations/{$awaitingResId}/deposit/initiate", [
            'payment_method' => 'card',
            'idempotency_key' => 'idem-await-3333',
        ])->assertStatus(409);
    }

    public function test_xendit_webhook_validation_idempotency_and_late_payment_after_rejection(): void
    {
        config([
            'salo.payments.driver' => 'xendit',
            'services.xendit.mode' => 'test',
            'services.xendit.base_url' => 'https://api.xendit.co',
            'services.xendit.secret_key' => 'xnd_development_test_key',
            'services.xendit.webhook_token' => 'test-webhook-token-123',
        ]);

        Http::fake([
            'https://api.xendit.co/v2/invoices' => Http::response([
                'id' => 'inv_res_9001',
                'status' => 'PENDING',
                'invoice_url' => 'https://checkout.xendit.co/web/inv_res_9001',
                'expiry_date' => now()->addHours(2)->toIso8601String(),
            ], 200),
        ]);

        [$owner, $customer, , , $resId] = $this->createDepositReservation('awaiting_payment', 'pending');

        $initRes = $this->actingAs($customer)->postJson("/api/customer/reservations/{$resId}/deposit/initiate", [
            'payment_method' => 'gcash',
            'idempotency_key' => 'idem-xendit-1234',
        ])->assertStatus(201);

        $paymentId = (int) $initRes->json('data.payment.payment_id');
        $paymentRef = (string) $initRes->json('data.payment.payment_reference');

        // Invalid webhook signature -> 403
        $this->postJson('/api/payments/xendit/webhook', [
            'id' => 'inv_res_9001',
            'external_id' => $paymentRef,
            'status' => 'PAID',
            'amount' => 250.00,
            'currency' => 'PHP',
        ], ['x-callback-token' => 'wrong-token'])->assertStatus(403);

        // Amount mismatch -> 422
        $this->postJson('/api/payments/xendit/webhook', [
            'id' => 'inv_res_9001',
            'external_id' => $paymentRef,
            'status' => 'PAID',
            'amount' => 100.00,
            'currency' => 'PHP',
        ], ['x-callback-token' => 'test-webhook-token-123'])->assertStatus(422);

        // Restaurant cancels while payment is pending -> pending payment is voided
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$resId}/cancel", [
            'reason' => 'Private event',
        ])->assertOk();

        $this->assertSame('voided', DB::table('payments')->where('payment_id', $paymentId)->value('payment_status'));

        // Late webhook arrives after cancellation -> does NOT confirm reservation, flags for review, requests full refund
        $this->postJson('/api/payments/xendit/webhook', [
            'id' => 'inv_res_9001',
            'external_id' => $paymentRef,
            'status' => 'PAID',
            'amount' => 250.00,
            'currency' => 'PHP',
        ], ['x-callback-token' => 'test-webhook-token-123'])->assertOk();

        // Duplicate webhook is idempotent (only 1 payment_events & 1 refund)
        $this->postJson('/api/payments/xendit/webhook', [
            'id' => 'inv_res_9001',
            'external_id' => $paymentRef,
            'status' => 'PAID',
            'amount' => 250.00,
            'currency' => 'PHP',
        ], ['x-callback-token' => 'test-webhook-token-123'])->assertOk();

        $resRow = DB::table('reservations')->where('reservation_id', $resId)->first();
        $this->assertSame('cancelled', $resRow->reservation_status);

        $this->assertSame(1, DB::table('audit_logs')
            ->where('entity_type', 'reservations')
            ->where('entity_id', $resId)
            ->where('action', 'reservation_late_payment_review')
            ->count());

        $this->assertSame(1, DB::table('payments')
            ->where('related_payment_id', $paymentId)
            ->where('payment_type', 'refund')
            ->count());
    }

    public function test_restaurant_cancel_triggers_single_full_refund_and_ledger_on_confirmation(): void
    {
        [$owner, $customer, $admin, , $resId] = $this->createDepositReservation('awaiting_payment', 'pending');

        $payRes = $this->actingAs($customer)->postJson("/api/customer/reservations/{$resId}/deposit/initiate", [
            'payment_method' => 'maya',
            'idempotency_key' => 'idem-rfd-111111',
        ])->assertStatus(201);
        $paymentId = (int) $payRes->json('data.payment.payment_id');

        $this->actingAs($customer)->postJson("/api/customer/payments/{$paymentId}/confirm")->assertOk();

        // Restaurant cancels paid reservation -> creates requested refund, keeps deposit_status = 'paid' until provider confirms
        $this->actingAs($owner)->postJson("/api/restaurant/reservations/{$resId}/cancel", [
            'reason' => 'Kitchen maintenance',
            'refund_deposit' => true,
        ])->assertOk();

        $this->assertSame('paid', DB::table('reservations')->where('reservation_id', $resId)->value('deposit_status'));

        $refundRow = DB::table('payments')
            ->where('related_payment_id', $paymentId)
            ->where('payment_type', 'refund')
            ->first();
        $this->assertNotNull($refundRow);
        $this->assertSame('requested', $refundRow->refund_status);
        $this->assertEquals(250.0, (float) $refundRow->amount);

        // Calling refundReservationDepositIfPaid again must NOT double-refund
        $duplicate = app(RefundService::class)->refundReservationDepositIfPaid($resId, $owner->user_id, 'Duplicate attempt');
        $this->assertNull($duplicate);

        // Provider confirms refund via Admin Finance submit (sandbox) -> deposit_status = 'refunded' & refund ledger journal posted
        $this->actingAs($admin)->postJson("/api/admin/finance/refunds/{$refundRow->payment_id}/submit")
            ->assertOk()
            ->assertJsonPath('data.refund.refund_status', 'successful');

        $this->assertSame('refunded', DB::table('reservations')->where('reservation_id', $resId)->value('deposit_status'));
        $this->assertNotNull(DB::table('ledger_journals')
            ->where('reservation_id', $resId)
            ->where('journal_type', 'refund')
            ->where('payment_id', $refundRow->payment_id)
            ->first());
    }

    public function test_customer_cancel_paid_reservation_keeps_deposit_paid_and_flags_admin_review(): void
    {
        [, $customer, $admin, , $resId] = $this->createDepositReservation('awaiting_payment', 'pending');

        $payRes = $this->actingAs($customer)->postJson("/api/customer/reservations/{$resId}/deposit/initiate", [
            'payment_method' => 'card',
            'idempotency_key' => 'idem-custcan-1111',
        ])->assertStatus(201);
        $paymentId = (int) $payRes->json('data.payment.payment_id');

        $this->actingAs($customer)->postJson("/api/customer/payments/{$paymentId}/confirm")->assertOk();

        $cancelRes = $this->actingAs($customer)->postJson("/api/customer/reservations/{$resId}/cancel", [
            'reason' => 'Change of plans',
        ])->assertOk();

        $this->assertSame('cancelled', $cancelRes->json('data.reservation.reservation_status'));
        $this->assertSame('paid', $cancelRes->json('data.reservation.deposit_status'));
        $this->assertTrue($cancelRes->json('data.reservation.deposit_under_review'));

        // NO refund created
        $this->assertSame(0, DB::table('payments')
            ->where('related_payment_id', $paymentId)
            ->where('payment_type', 'refund')
            ->count());

        // Audit log recorded & visible to admins
        $this->assertSame(1, DB::table('audit_logs')
            ->where('entity_type', 'reservations')
            ->where('entity_id', $resId)
            ->where('action', 'customer_paid_reservation_cancelled_review')
            ->count());

        $this->actingAs($admin)->getJson("/api/admin/reservations/{$resId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.needs_admin_review', true);
    }
}
