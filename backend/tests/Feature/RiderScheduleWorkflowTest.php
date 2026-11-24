<?php

namespace Tests\Feature;

use App\Features\Riders\Services\RiderScheduleService;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderScheduleWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role, string $prefix): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => ucfirst($prefix),
            'last_name' => 'Tester',
            'phone_number' => '+63917'.random_int(1000000, 9999999),
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function ensureCityId(): int
    {
        $existing = DB::table('cities')->value('city_id');
        if ($existing !== null) {
            return (int) $existing;
        }

        return (int) DB::table('cities')->insertGetId([
            'city_name' => 'Quezon City',
            'province' => 'Metro Manila',
        ]);
    }

    private function createRiderRecord(User $user, array $overrides = []): int
    {
        $cityId = $this->ensureCityId();

        return (int) DB::table('riders')->insertGetId(array_merge([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Test Contact',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '+639171234567',
            'base_city_id' => $cityId,
            'preferred_hubs' => 'Diliman, Katipunan',
            'preferred_shifts' => 'lunch,dinner',
            'available_days' => 'mon,tue,wed,thu,fri',
            'rider_status' => 'active',
            'approved_at' => now()->subDays(10),
        ], $overrides));
    }

    public function test_rider_can_view_approved_schedule_and_submit_request_notifying_admins(): void
    {
        $admin = $this->createUser('admin', 'sched_admin');
        $riderUser = $this->createUser('customer', 'sched_rider');
        $riderId = $this->createRiderRecord($riderUser);

        $getRes = $this->actingAs($riderUser)->getJson('/api/rider/schedule');
        $getRes->assertOk()
            ->assertJsonPath('data.rider_id', $riderId)
            ->assertJsonPath('data.approved_schedule.available_days', ['mon', 'tue', 'wed', 'thu', 'fri'])
            ->assertJsonPath('data.approved_schedule.preferred_shifts', ['lunch', 'dinner'])
            ->assertJsonPath('data.approved_schedule.preferred_hubs', ['Diliman', 'Katipunan'])
            ->assertJsonPath('data.pending_request', null);

        $today = now('Asia/Manila')->toDateString();
        $submitRes = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['tue', 'thu', 'sat'],
            'preferred_shifts' => ['breakfast', 'lunch'],
            'preferred_hubs' => ['Cubao'],
            'effective_date' => $today,
            'reason' => 'Adjusting availability for morning deliveries.',
        ]);

        $submitRes->assertCreated()
            ->assertJsonPath('data.request.status', 'pending')
            ->assertJsonPath('data.request.entry_type', 'rider_request')
            ->assertJsonPath('data.request.available_days', ['tue', 'thu', 'sat']);

        $requestId = (int) $submitRes->json('data.request.id');

        // Approved schedule on riders table must remain unchanged while pending
        $riderRow = DB::table('riders')->where('rider_id', $riderId)->first();
        $this->assertSame('mon,tue,wed,thu,fri', $riderRow->available_days);

        // Duplicate pending request is blocked
        $dupRes = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['mon'],
            'preferred_shifts' => ['flexible'],
            'effective_date' => $today,
            'reason' => 'Duplicate pending attempt.',
        ]);
        $dupRes->assertStatus(409);

        // Admin notification persisted in notifications table
        $adminNotif = DB::table('notifications')
            ->where('user_id', $admin->user_id)
            ->where('workspace', 'admin')
            ->where('type', 'rider_schedule_request_submitted')
            ->where('related_entity_id', $requestId)
            ->first();
        $this->assertNotNull($adminNotif);
    }

    public function test_invalid_schedule_requests_and_unauthorized_access_are_rejected(): void
    {
        $riderUser = $this->createUser('customer', 'inv_rider');
        $otherRider = $this->createUser('customer', 'other_rider');
        $this->createRiderRecord($riderUser);
        $this->createRiderRecord($otherRider);

        $today = now('Asia/Manila')->toDateString();
        $yesterday = now('Asia/Manila')->subDay()->toDateString();

        // Unauthenticated cannot access
        $this->getJson('/api/rider/schedule')->assertStatus(401);
        $this->getJson('/api/admin/rider-schedule-requests')->assertStatus(401);

        // Conflicting flexible + specific shift
        $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['mon'],
            'preferred_shifts' => ['flexible', 'lunch'],
            'effective_date' => $today,
            'reason' => 'Invalid shift combination.',
        ])->assertStatus(422);

        // Past effective date
        $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['mon'],
            'preferred_shifts' => ['lunch'],
            'effective_date' => $yesterday,
            'reason' => 'Past effective date.',
        ])->assertStatus(422);

        // Rider cannot access Admin endpoints
        $this->actingAs($riderUser)->getJson('/api/admin/rider-schedule-requests')->assertStatus(403);
        $this->actingAs($riderUser)->postJson('/api/admin/rider-schedule-requests/1/approve')->assertStatus(403);

        // Rider cannot cancel another rider's request
        $created = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['mon'],
            'preferred_shifts' => ['flexible'],
            'effective_date' => $today,
            'reason' => 'Valid request for ownership test.',
        ])->assertCreated();

        $reqId = (int) $created->json('data.request.id');
        $this->actingAs($otherRider)->postJson("/api/rider/schedule/requests/{$reqId}/cancel")->assertStatus(404);
    }

    public function test_admin_can_approve_request_with_immediate_and_future_effective_date(): void
    {
        $admin = $this->createUser('admin', 'app_admin');
        $riderUser = $this->createUser('customer', 'app_rider');
        $riderId = $this->createRiderRecord($riderUser);

        $today = now('Asia/Manila')->toDateString();
        $future = now('Asia/Manila')->addDays(5)->toDateString();

        // 1. Immediate effective date (today)
        $res1 = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['mon', 'wed', 'fri', 'sat'],
            'preferred_shifts' => ['breakfast'],
            'preferred_hubs' => ['UP Town'],
            'effective_date' => $today,
            'reason' => 'Immediate morning schedule update.',
        ])->assertCreated();
        $req1Id = (int) $res1->json('data.request.id');

        $approve1 = $this->actingAs($admin)->postJson("/api/admin/rider-schedule-requests/{$req1Id}/approve", [
            'remarks' => 'Approved for immediate morning coverage.',
        ]);
        $approve1->assertOk()
            ->assertJsonPath('data.request.status', 'approved')
            ->assertJsonPath('data.request.admin_remarks', 'Approved for immediate morning coverage.');

        $riderRow = DB::table('riders')->where('rider_id', $riderId)->first();
        $this->assertSame('mon,wed,fri,sat', $riderRow->available_days);
        $this->assertSame('breakfast', $riderRow->preferred_shifts);
        $this->assertSame('UP Town', $riderRow->preferred_hubs);

        // Rider notification created
        $this->assertTrue(
            DB::table('notifications')
                ->where('user_id', $riderUser->user_id)
                ->where('workspace', 'rider')
                ->where('type', 'rider_schedule_request_approved')
                ->where('related_entity_id', $req1Id)
                ->exists()
        );

        // Double-approval is prevented
        $this->actingAs($admin)->postJson("/api/admin/rider-schedule-requests/{$req1Id}/approve")->assertStatus(409);

        // 2. Future effective date
        $res2 = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['sat', 'sun'],
            'preferred_shifts' => ['flexible'],
            'preferred_hubs' => ['Cubao'],
            'effective_date' => $future,
            'reason' => 'Future weekend-only schedule.',
        ])->assertCreated();
        $req2Id = (int) $res2->json('data.request.id');

        $this->actingAs($admin)->postJson("/api/admin/rider-schedule-requests/{$req2Id}/approve")->assertOk();

        // Active schedule remains mon,wed,fri,sat until future date arrives
        $riderAfterFutureApproval = DB::table('riders')->where('rider_id', $riderId)->first();
        $this->assertSame('mon,wed,fri,sat', $riderAfterFutureApproval->available_days);

        $riderView = $this->actingAs($riderUser)->getJson('/api/rider/schedule')->assertOk();
        $riderView->assertJsonPath('data.approved_schedule.available_days', ['mon', 'wed', 'fri', 'sat'])
            ->assertJsonPath('data.upcoming_schedule.id', $req2Id);

        // Simulate effective_date reaching today and verify promotion
        DB::table('rider_schedule_change_requests')
            ->where('schedule_request_id', $req2Id)
            ->update(['effective_date' => $today]);

        app(RiderScheduleService::class)->promoteDueApprovedSchedules($riderId);
        $riderPromoted = DB::table('riders')->where('rider_id', $riderId)->first();
        $this->assertSame('sat,sun', $riderPromoted->available_days);
        $this->assertSame('flexible', $riderPromoted->preferred_shifts);
    }

    public function test_admin_rejection_requires_remarks_preserves_schedule_and_notifies_rider(): void
    {
        $admin = $this->createUser('admin', 'rej_admin');
        $riderUser = $this->createUser('customer', 'rej_rider');
        $riderId = $this->createRiderRecord($riderUser);
        $today = now('Asia/Manila')->toDateString();

        $created = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['sun'],
            'preferred_shifts' => ['late_night'],
            'effective_date' => $today,
            'reason' => 'Requesting Sunday late-night only.',
        ])->assertCreated();
        $reqId = (int) $created->json('data.request.id');

        // Remarks required
        $this->actingAs($admin)->postJson("/api/admin/rider-schedule-requests/{$reqId}/reject", [
            'remarks' => 'no',
        ])->assertStatus(422);

        $rejRes = $this->actingAs($admin)->postJson("/api/admin/rider-schedule-requests/{$reqId}/reject", [
            'remarks' => 'Late night Sunday coverage is already at capacity.',
        ]);
        $rejRes->assertOk()
            ->assertJsonPath('data.request.status', 'rejected')
            ->assertJsonPath('data.request.admin_remarks', 'Late night Sunday coverage is already at capacity.');

        // Approved schedule unchanged
        $riderRow = DB::table('riders')->where('rider_id', $riderId)->first();
        $this->assertSame('mon,tue,wed,thu,fri', $riderRow->available_days);

        // Rider notification created
        $this->assertTrue(
            DB::table('notifications')
                ->where('user_id', $riderUser->user_id)
                ->where('workspace', 'rider')
                ->where('type', 'rider_schedule_request_rejected')
                ->where('related_entity_id', $reqId)
                ->exists()
        );
    }

    public function test_admin_direct_schedule_update_preserves_pending_request_and_notifies_rider(): void
    {
        $admin = $this->createUser('admin', 'dir_admin');
        $riderUser = $this->createUser('customer', 'dir_rider');
        $riderId = $this->createRiderRecord($riderUser);
        $today = now('Asia/Manila')->toDateString();

        // Rider submits a pending request first
        $pending = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['sat', 'sun'],
            'preferred_shifts' => ['dinner'],
            'effective_date' => $today,
            'reason' => 'Pending rider request.',
        ])->assertCreated();
        $pendingId = (int) $pending->json('data.request.id');

        // Admin directly updates rider's schedule
        $directRes = $this->actingAs($admin)->patchJson("/api/admin/riders/{$riderId}/schedule", [
            'available_days' => ['mon', 'tue', 'wed'],
            'preferred_shifts' => ['lunch'],
            'preferred_hubs' => ['Katipunan'],
            'effective_date' => $today,
            'reason' => 'Hub rebalancing adjustment.',
        ]);

        $directRes->assertOk()
            ->assertJsonPath('data.approved_schedule.available_days', ['mon', 'tue', 'wed'])
            ->assertJsonPath('data.pending_request.id', $pendingId)
            ->assertJsonPath('data.pending_request.status', 'pending');

        // Rider notification created
        $this->assertTrue(
            DB::table('notifications')
                ->where('user_id', $riderUser->user_id)
                ->where('workspace', 'rider')
                ->where('type', 'rider_schedule_admin_updated')
                ->exists()
        );
    }

    public function test_rider_can_cancel_own_pending_request_and_admin_sees_cancellation(): void
    {
        $admin = $this->createUser('admin', 'can_admin');
        $riderUser = $this->createUser('customer', 'can_rider');
        $riderId = $this->createRiderRecord($riderUser);
        $today = now('Asia/Manila')->toDateString();

        $created = $this->actingAs($riderUser)->postJson('/api/rider/schedule/requests', [
            'available_days' => ['fri'],
            'preferred_shifts' => ['afternoon'],
            'effective_date' => $today,
            'reason' => 'Temporary Friday afternoon shift.',
        ])->assertCreated();
        $reqId = (int) $created->json('data.request.id');

        $cancelRes = $this->actingAs($riderUser)->postJson("/api/rider/schedule/requests/{$reqId}/cancel");
        $cancelRes->assertOk()->assertJsonPath('data.request.status', 'cancelled');

        // Cannot cancel again
        $this->actingAs($riderUser)->postJson("/api/rider/schedule/requests/{$reqId}/cancel")->assertStatus(409);

        // Approved schedule unchanged
        $riderRow = DB::table('riders')->where('rider_id', $riderId)->first();
        $this->assertSame('mon,tue,wed,thu,fri', $riderRow->available_days);

        // Admin list reflects cancelled status and Admin notification exists
        $adminList = $this->actingAs($admin)->getJson('/api/admin/rider-schedule-requests?status=cancelled')->assertOk();
        $items = $adminList->json('data.items');
        $this->assertTrue(collect($items)->contains('id', $reqId));
        $this->assertTrue(
            DB::table('notifications')
                ->where('user_id', $admin->user_id)
                ->where('workspace', 'admin')
                ->where('type', 'rider_schedule_request_cancelled')
                ->where('related_entity_id', $reqId)
                ->exists()
        );
    }
}
