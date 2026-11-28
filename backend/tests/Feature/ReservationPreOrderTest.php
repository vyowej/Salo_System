<?php

namespace Tests\Feature;

use App\Features\Reservations\Support\ReservationStatus;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReservationPreOrderTest extends TestCase
{
    use DatabaseTransactions;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_customer_can_reserve_without_preorder(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        $res = $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-none-'.random_int(1000, 9999),
        ])->assertStatus(201);

        $res->assertJsonPath('data.reservation.pre_order', null);
        $this->assertSame(0, DB::table('orders')->where('reservation_id', $res->json('data.reservation.reservation_id'))->count());
    }

    public function test_customer_can_reserve_with_preorder_addons_notes_and_zero_delivery_fee(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        $payload = [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 3,
            'special_requests' => 'Corner booth please',
            'idempotency_key' => 'pre-full-'.random_int(1000, 9999),
            'pre_order' => [
                'notes' => 'Serve drinks first',
                'items' => [
                    [
                        'menu_item_id' => $env['item1Id'],
                        'quantity' => 2,
                        'add_on_option_ids' => [$env['requiredOptId']],
                        'special_instructions' => 'Extra crispy',
                    ],
                    [
                        'menu_item_id' => $env['item2Id'],
                        'quantity' => 1,
                        'add_on_option_ids' => [],
                    ],
                ],
            ],
        ];

        $res = $this->actingAs($env['customer'])
            ->postJson('/api/customer/reservations', $payload)
            ->assertStatus(201);

        $resId = (int) $res->json('data.reservation.reservation_id');
        // item1: (250 + 30) * 2 = 560; item2: 120 * 1 = 120 -> total 680.00
        $res->assertJsonPath('data.reservation.reservation_status', ReservationStatus::PENDING)
            ->assertJsonPath('data.reservation.pre_order.order_type', 'dine_in')
            ->assertJsonPath('data.reservation.pre_order.order_status', 'pending')
            ->assertJsonPath('data.reservation.pre_order.delivery_fee', '0.00')
            ->assertJsonPath('data.reservation.pre_order.subtotal_amount', '680.00')
            ->assertJsonPath('data.reservation.pre_order.total_amount', '680.00')
            ->assertJsonPath('data.reservation.pre_order.item_count', 3)
            ->assertJsonPath('data.reservation.pre_order.notes', 'Serve drinks first')
            ->assertJsonCount(2, 'data.reservation.pre_order.items')
            ->assertJsonPath('data.reservation.pre_order.items.0.add_ons.0.option_name', 'Large');

        // Idempotent replay returns same reservation & pre-order without duplicating
        $replay = $this->actingAs($env['customer'])
            ->postJson('/api/customer/reservations', $payload)
            ->assertStatus(201);
        $this->assertSame($resId, (int) $replay->json('data.reservation.reservation_id'));
        $this->assertSame(1, DB::table('orders')->where('reservation_id', $resId)->count());

        // Visible in customer detail, owner list/detail, and admin detail
        $this->actingAs($env['customer'])->getJson("/api/customer/reservations/{$resId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.pre_order.total_amount', '680.00');

        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->getJson("/api/restaurant/reservations/{$resId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.pre_order.items.0.special_instructions', 'Extra crispy');

        $this->actingAs($env['admin'])->getJson("/api/admin/reservations/{$resId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.pre_order.total_amount', '680.00');

        // Excluded from regular delivery/pickup order lists
        $this->actingAs($env['customer'])->getJson('/api/customer/orders')
            ->assertOk()
            ->assertJsonCount(0, 'data.orders');

        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->getJson('/api/restaurant/orders')
            ->assertOk()
            ->assertJsonCount(0, 'data.orders');
    }

    public function test_preorder_rejects_cross_restaurant_unavailable_and_missing_required_addons_without_orphans(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        // Cross-restaurant item
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-cross-'.random_int(1000, 9999),
            'pre_order' => [
                'items' => [['menu_item_id' => $env['otherRestaurantItemId'], 'quantity' => 1]],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['pre_order.items.0.menu_item_id']);

        // Sold-out item
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-soldout-'.random_int(1000, 9999),
            'pre_order' => [
                'items' => [['menu_item_id' => $env['soldOutItemId'], 'quantity' => 1]],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['pre_order.items.0.menu_item_id']);

        // Missing required add-on
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-req-'.random_int(1000, 9999),
            'pre_order' => [
                'items' => [['menu_item_id' => $env['item1Id'], 'quantity' => 1, 'add_on_option_ids' => []]],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['pre_order.items.0.add_on_option_ids']);

        // No orphaned reservations or orders
        $this->assertSame(0, DB::table('reservations')->where('restaurant_id', $env['restaurantId'])->count());
        $this->assertSame(0, DB::table('orders')->where('restaurant_id', $env['restaurantId'])->count());
    }

    public function test_customer_edit_and_owner_status_workflow_and_lock_when_preparing(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        $created = $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-flow-'.random_int(1000, 9999),
            'pre_order' => [
                'items' => [['menu_item_id' => $env['item2Id'], 'quantity' => 1]],
            ],
        ])->assertStatus(201);
        $resId = (int) $created->json('data.reservation.reservation_id');

        // Unpermitted staff gets 403
        $this->actingAs($env['unpermittedStaff'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/pre-order/status", ['action' => 'accept'])
            ->assertStatus(403);

        // Owner confirms table reservation AND accepts pre-order independently
        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/approve")
            ->assertOk()
            ->assertJsonPath('data.reservation.reservation_status', ReservationStatus::CONFIRMED);

        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/pre-order/status", ['action' => 'accept'])
            ->assertOk()
            ->assertJsonPath('data.pre_order.order_status', 'accepted');

        // Customer edits accepted pre-order -> status resets to pending for restaurant re-review
        $this->actingAs($env['customer'])
            ->putJson("/api/customer/reservations/{$resId}/pre-order", [
                'notes' => 'Updated note',
                'items' => [['menu_item_id' => $env['item2Id'], 'quantity' => 3]],
            ])
            ->assertOk()
            ->assertJsonPath('data.pre_order.order_status', 'pending')
            ->assertJsonPath('data.pre_order.accepted_at', null)
            ->assertJsonPath('data.pre_order.total_amount', '360.00')
            ->assertJsonPath('data.pre_order.item_count', 3);

        $this->assertSame(
            ReservationStatus::CONFIRMED,
            DB::table('reservations')->where('reservation_id', $resId)->value('reservation_status'),
        );
        $this->assertDatabaseHas('notifications', [
            'related_entity_id' => $resId,
            'type' => 'reservation_preorder_updated',
            'title' => 'Reservation pre-order requires re-acceptance',
        ]);

        // Owner re-accepts updated pre-order, then starts preparing
        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/pre-order/status", ['action' => 'accept'])
            ->assertOk()
            ->assertJsonPath('data.pre_order.order_status', 'accepted');

        // Kitchen starts preparing -> customer edit is now blocked (409)
        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/pre-order/status", ['action' => 'prepare'])
            ->assertOk()
            ->assertJsonPath('data.pre_order.order_status', 'preparing')
            ->assertJsonPath('data.pre_order.can_customer_edit', false);

        $this->actingAs($env['customer'])
            ->putJson("/api/customer/reservations/{$resId}/pre-order", [
                'items' => [['menu_item_id' => $env['item2Id'], 'quantity' => 1]],
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'PRE_ORDER_LOCKED');

        // Kitchen marks ready & completed while reservation remains confirmed
        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/pre-order/status", ['action' => 'ready'])
            ->assertOk()
            ->assertJsonPath('data.pre_order.order_status', 'ready');

        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->postJson("/api/restaurant/reservations/{$resId}/pre-order/status", ['action' => 'complete'])
            ->assertOk()
            ->assertJsonPath('data.pre_order.order_status', 'completed');

        $this->assertSame(
            ReservationStatus::CONFIRMED,
            DB::table('reservations')->where('reservation_id', $resId)->value('reservation_status'),
        );
    }

    public function test_reservation_cancellation_and_expiry_cancel_linked_preorder(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        $r1 = $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-can-'.random_int(1000, 9999),
            'pre_order' => ['items' => [['menu_item_id' => $env['item2Id'], 'quantity' => 1]]],
        ])->assertStatus(201);
        $r1Id = (int) $r1->json('data.reservation.reservation_id');

        $this->actingAs($env['customer'])->postJson("/api/customer/reservations/{$r1Id}/cancel", ['reason' => 'Changed plans'])
            ->assertOk()
            ->assertJsonPath('data.reservation.pre_order.order_status', 'cancelled');

        // Expiry also cancels linked pre-order
        $r2 = $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-29T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-exp-'.random_int(1000, 9999),
            'pre_order' => ['items' => [['menu_item_id' => $env['item2Id'], 'quantity' => 2]]],
        ])->assertStatus(201);
        $r2Id = (int) $r2->json('data.reservation.reservation_id');

        $afterExpiry = $now->addHours(3);
        Carbon::setTestNow($afterExpiry);
        CarbonImmutable::setTestNow($afterExpiry);

        Artisan::call('salo:expire-stale-reservations', ['--restaurant' => $env['restaurantId']]);
        $this->assertSame(ReservationStatus::EXPIRED, DB::table('reservations')->where('reservation_id', $r2Id)->value('reservation_status'));
        $this->assertSame('cancelled', DB::table('orders')->where('reservation_id', $r2Id)->value('order_status'));
    }

    public function test_admin_and_ordinary_order_endpoints_exclude_reservation_preorders(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        $created = $this->actingAs($env['customer'])->postJson('/api/customer/reservations', [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => 'pre-sep-'.random_int(1000, 9999),
            'pre_order' => ['items' => [['menu_item_id' => $env['item2Id'], 'quantity' => 2]]],
        ])->assertStatus(201);

        $resId = (int) $created->json('data.reservation.reservation_id');
        $preOrderId = (int) $created->json('data.reservation.pre_order.order_id');

        // Also seed a normal pickup order to confirm ordinary orders remain visible
        $checkoutId = DB::table('checkouts')->insertGetId([
            'customer_id' => $env['customer']->user_id,
            'checkout_status' => 'pending',
            'total_amount' => '120.00',
        ]);
        $normalOrderId = DB::table('orders')->insertGetId([
            'checkout_id' => $checkoutId,
            'restaurant_id' => $env['restaurantId'],
            'customer_id' => $env['customer']->user_id,
            'restaurant_name' => 'Test Rest',
            'customer_name' => 'PreOrder Tester',
            'order_reference' => 'SALO-ORD-NORM-'.random_int(1000, 9999),
            'order_type' => 'pickup',
            'order_status' => 'pending',
            'subtotal_amount' => '120.00',
            'total_amount' => '120.00',
        ]);

        // Admin orders list excludes reservation pre-order, includes normal pickup order
        $adminList = $this->actingAs($env['admin'])
            ->getJson('/api/admin/orders?restaurant_id='.$env['restaurantId'])
            ->assertOk();
        $listedIds = collect($adminList->json('data.items'))->pluck('order_id')->all();
        $this->assertContains($normalOrderId, $listedIds);
        $this->assertNotContains($preOrderId, $listedIds);

        // Direct ordinary order detail & receipt endpoints return 404 for reservation pre-orders
        $this->actingAs($env['admin'])->getJson("/api/admin/orders/{$preOrderId}")->assertStatus(404);
        $this->actingAs($env['customer'])->getJson("/api/customer/orders/{$preOrderId}")->assertStatus(404);
        $this->actingAs($env['customer'])->getJson("/api/customer/orders/{$preOrderId}/receipt")->assertStatus(404);
        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->getJson("/api/restaurant/orders/{$preOrderId}")
            ->assertStatus(404);
        $this->actingAs($env['owner'])
            ->withHeader('X-Restaurant-Id', (string) $env['restaurantId'])
            ->getJson("/api/restaurant/orders/{$preOrderId}/receipt")
            ->assertStatus(404);

        // Legitimate Admin reservation detail remains intact with pre_order
        $this->actingAs($env['admin'])->getJson("/api/admin/reservations/{$resId}")
            ->assertOk()
            ->assertJsonPath('data.reservation.pre_order.order_id', $preOrderId);
    }

    public function test_idempotency_key_validates_preorder_payload_and_rejects_material_changes(): void
    {
        $now = $this->freezeNow();
        $env = $this->seedEnvironment($now);

        $idemKey = 'pre-idem-mat-'.random_int(1000, 9999);
        $basePayload = [
            'restaurant_id' => $env['restaurantId'],
            'start' => '2026-11-28T18:00',
            'party_size' => 2,
            'idempotency_key' => $idemKey,
            'pre_order' => [
                'notes' => 'Less ice',
                'items' => [
                    [
                        'menu_item_id' => $env['item1Id'],
                        'quantity' => 1,
                        'add_on_option_ids' => [$env['requiredOptId']],
                        'special_instructions' => 'No onions',
                    ],
                    [
                        'menu_item_id' => $env['item2Id'],
                        'quantity' => 2,
                    ],
                ],
            ],
        ];

        $first = $this->actingAs($env['customer'])
            ->postJson('/api/customer/reservations', $basePayload)
            ->assertStatus(201);
        $resId = (int) $first->json('data.reservation.reservation_id');

        // Reordered items array (semantically equivalent) -> valid replay
        $reordered = $basePayload;
        $reordered['pre_order']['items'] = array_reverse($basePayload['pre_order']['items']);
        $replay = $this->actingAs($env['customer'])
            ->postJson('/api/customer/reservations', $reordered)
            ->assertStatus(201);
        $this->assertSame($resId, (int) $replay->json('data.reservation.reservation_id'));

        // Different quantity -> 409
        $diffQty = $basePayload;
        $diffQty['pre_order']['items'][0]['quantity'] = 3;
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', $diffQty)
            ->assertStatus(409)->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');

        // Different item -> 409
        $diffItem = $basePayload;
        $diffItem['pre_order']['items'] = [['menu_item_id' => $env['item2Id'], 'quantity' => 1]];
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', $diffItem)
            ->assertStatus(409)->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');

        // Different add-on -> 409
        $diffAddOn = $basePayload;
        $diffAddOn['pre_order']['items'][0]['add_on_option_ids'] = [];
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', $diffAddOn)
            ->assertStatus(409)->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');

        // Different item note -> 409
        $diffNote = $basePayload;
        $diffNote['pre_order']['items'][0]['special_instructions'] = 'Extra spicy';
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', $diffNote)
            ->assertStatus(409)->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');

        // Missing pre_order vs existing pre_order -> 409
        $noPreOrder = $basePayload;
        unset($noPreOrder['pre_order']);
        $this->actingAs($env['customer'])->postJson('/api/customer/reservations', $noPreOrder)
            ->assertStatus(409)->assertJsonPath('code', 'IDEMPOTENCY_KEY_REUSED');

        // Still only 1 reservation and 1 order
        $this->assertSame(1, DB::table('reservations')->where('customer_id', $env['customer']->user_id)->count());
        $this->assertSame(1, DB::table('orders')->where('reservation_id', $resId)->count());
    }

    private function freezeNow(): CarbonImmutable
    {
        $now = CarbonImmutable::create(2026, 11, 27, 10, 0, 0, 'Asia/Manila');
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        return $now;
    }

    /**
     * @return array<string, mixed>
     */
    private function seedEnvironment(CarbonImmutable $now): array
    {
        $owner = $this->createUser('own_pre_'.random_int(100, 999).'@salo.local');
        $unpermittedStaff = $this->createUser('stf_pre_'.random_int(100, 999).'@salo.local');
        $customer = $this->createUser('cust_pre_'.random_int(100, 999).'@salo.local');
        $admin = $this->createUser('adm_pre_'.random_int(100, 999).'@salo.local', 'admin');

        $barangayId = (int) DB::table('barangays')->value('barangay_id');
        $addressId = DB::table('addresses')->insertGetId([
            'barangay_id' => $barangayId,
            'street' => '789 PreOrder St',
            'postal_code' => '1000',
        ]);

        $restaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'PreOrder Bistro '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'prebistro_'.random_int(100, 999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'offers_dine_in' => 1,
            'accepts_reservations' => 1,
            'accepting_reservations' => 1,
            'is_published' => 1,
            'reservation_pending_expiry_minutes' => 120,
            'reservation_cancellation_cutoff_minutes' => 60,
        ]);

        $otherRestaurantId = DB::table('restaurants')->insertGetId([
            'restaurant_name' => 'Other Kitchen '.random_int(100, 999),
            'business_type' => 'restaurant',
            'ownership_structure' => 'sole_proprietorship',
            'business_email' => 'otherpre_'.random_int(100, 999).'@salo.local',
            'address_id' => $addressId,
            'restaurant_status' => 'active',
            'is_published' => 1,
        ]);

        DB::table('restaurant_owners')->insert(['restaurant_id' => $restaurantId, 'user_id' => $owner->user_id]);
        DB::table('restaurant_staff')->insert([
            'restaurant_id' => $restaurantId,
            'user_id' => $unpermittedStaff->user_id,
            'staff_position' => 'Inventory Manager',
            'staff_status' => 'active',
        ]);

        for ($d = 0; $d < 7; $d++) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => $d,
                'opening_time' => '10:00:00',
                'closing_time' => '23:00:00',
                'closes_next_day' => 0,
                'is_closed' => 0,
            ]);
        }

        DB::table('restaurant_tables')->insert([
            'restaurant_id' => $restaurantId,
            'table_name' => 'T1',
            'dining_area' => 'Indoor',
            'seating_capacity' => 6,
            'min_party_size' => 1,
            'is_active' => 1,
        ]);

        $catId = DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $restaurantId,
            'category_name' => 'Mains',
            'is_active' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_category_name' => 'Mains',
            'published_is_active' => 1,
        ]);

        $otherCatId = DB::table('menu_categories')->insertGetId([
            'restaurant_id' => $otherRestaurantId,
            'category_name' => 'Other',
            'is_active' => 1,
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_category_name' => 'Other',
            'published_is_active' => 1,
        ]);

        $item1Id = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Crispy Pork Sisig',
            'base_price' => '250.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $catId,
            'published_item_name' => 'Crispy Pork Sisig',
            'published_base_price' => '250.00',
            'published_at' => $now,
        ]);

        $grpId = DB::table('add_on_groups')->insertGetId([
            'menu_item_id' => $item1Id,
            'group_name' => 'Portion Size',
            'is_required' => 1,
            'minimum_selections' => 1,
            'maximum_selections' => 1,
        ]);

        $requiredOptId = DB::table('add_on_options')->insertGetId([
            'add_on_group_id' => $grpId,
            'option_name' => 'Large',
            'additional_price' => '30.00',
            'is_available' => 1,
        ]);

        $item2Id = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Calamansi Juice',
            'base_price' => '120.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $catId,
            'published_item_name' => 'Calamansi Juice',
            'published_base_price' => '120.00',
            'published_at' => $now,
        ]);

        $soldOutItemId = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $restaurantId,
            'menu_category_id' => $catId,
            'item_name' => 'Sold Out Steak',
            'base_price' => '900.00',
            'availability_status' => 'sold_out',
            'approval_status' => 'approved',
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $catId,
            'published_item_name' => 'Sold Out Steak',
            'published_base_price' => '900.00',
            'published_at' => $now,
        ]);

        $otherRestaurantItemId = DB::table('menu_items')->insertGetId([
            'restaurant_id' => $otherRestaurantId,
            'menu_category_id' => $otherCatId,
            'item_name' => 'Foreign Dish',
            'base_price' => '150.00',
            'availability_status' => 'available',
            'approval_status' => 'approved',
            'draft_state' => 'clean',
            'is_published' => 1,
            'published_menu_category_id' => $otherCatId,
            'published_item_name' => 'Foreign Dish',
            'published_base_price' => '150.00',
            'published_at' => $now,
        ]);

        return compact(
            'owner',
            'unpermittedStaff',
            'customer',
            'admin',
            'restaurantId',
            'otherRestaurantId',
            'item1Id',
            'item2Id',
            'soldOutItemId',
            'otherRestaurantItemId',
            'requiredOptId',
        );
    }

    private function createUser(string $email, string $role = 'customer'): User
    {
        $user = User::create([
            'username' => explode('@', $email)[0].'_'.random_int(100, 999),
            'first_name' => 'PreOrder',
            'last_name' => 'Tester',
            'email' => $email,
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);

        if ($role !== 'customer') {
            $user->forceFill(['user_role' => $role])->save();
        }

        return $user->fresh();
    }
}
