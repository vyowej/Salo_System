<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderSupportAndReviewsTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(string $role = 'customer', string $prefix = 'rsr'): User
    {
        return User::forceCreate([
            'username' => "{$prefix}_".random_int(10000, 99999),
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'phone_number' => '+639171234567',
            'email' => "{$prefix}_".random_int(10000, 99999).'@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => $role,
            'account_status' => 'active',
        ]);
    }

    private function createRiderRecord(User $user): int
    {
        $cityId = (int) (DB::table('cities')->value('city_id')
            ?? DB::table('cities')->insertGetId([
                'province_id' => DB::table('provinces')->value('province_id')
                    ?? DB::table('provinces')->insertGetId(['province_name' => 'Metro Manila']),
                'city_name' => 'Quezon City',
            ]));

        return (int) DB::table('riders')->insertGetId([
            'user_id' => $user->user_id,
            'vehicle_type' => 'bicycle',
            'emergency_contact_name' => 'Maria Dela Cruz',
            'emergency_contact_relationship' => 'sibling',
            'emergency_contact_phone' => '09171112222',
            'base_city_id' => $cityId,
            'rider_status' => 'active',
            'approved_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_rider_can_create_list_view_and_close_support_tickets(): void
    {
        $riderUser = $this->createUser('customer', 'sup_rider');
        $this->createRiderRecord($riderUser);

        $otherRiderUser = $this->createUser('customer', 'sup_other');
        $this->createRiderRecord($otherRiderUser);

        $createRes = $this->actingAs($riderUser)->postJson('/api/rider/support/tickets', [
            'category' => 'delivery_issue',
            'priority' => 'high',
            'subject' => 'Customer address pin is inaccurate',
            'description' => 'The drop-off pin is 2km away from the actual street.',
        ]);

        $createRes->assertStatus(201);
        $ticketId = (int) $createRes->json('data.ticket.ticket_id');
        $this->assertGreaterThan(0, $ticketId);
        $this->assertSame('open', $createRes->json('data.ticket.status'));
        $this->assertStringStartsWith('SUP-', (string) $createRes->json('data.ticket.ticket_reference'));

        $listRes = $this->actingAs($riderUser)->getJson('/api/rider/support/tickets');
        $listRes->assertOk();
        $this->assertSame(1, $listRes->json('data.counts.open'));
        $this->assertSame(1, $listRes->json('data.counts.total'));

        $showRes = $this->actingAs($riderUser)->getJson("/api/rider/support/tickets/{$ticketId}");
        $showRes->assertOk();
        $this->assertSame('Customer address pin is inaccurate', $showRes->json('data.ticket.subject'));

        $otherShowRes = $this->actingAs($otherRiderUser)->getJson("/api/rider/support/tickets/{$ticketId}");
        $otherShowRes->assertStatus(404);

        $closeRes = $this->actingAs($riderUser)->patchJson("/api/rider/support/tickets/{$ticketId}/close");
        $closeRes->assertOk();
        $this->assertSame('closed', $closeRes->json('data.ticket.status'));
    }

    public function test_admin_support_overview_includes_open_rider_tickets(): void
    {
        $riderUser = $this->createUser('customer', 'adm_sup_r');
        $this->createRiderRecord($riderUser);

        $adminUser = $this->createUser('admin', 'adm_sup_a');

        $this->actingAs($riderUser)->postJson('/api/rider/support/tickets', [
            'category' => 'safety_incident',
            'priority' => 'urgent',
            'subject' => 'Flat tire near dropoff',
            'description' => 'Had a flat tire along Katipunan Avenue while delivering.',
        ])->assertStatus(201);

        $overviewRes = $this->actingAs($adminUser)->getJson('/api/admin/support/overview');
        $overviewRes->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) $overviewRes->json('data.counts.rider_tickets'));
        $this->assertNotEmpty($overviewRes->json('data.rider_tickets'));
    }

    public function test_rider_can_fetch_customer_ratings_and_comments(): void
    {
        $riderUser = $this->createUser('customer', 'rev_rider');
        $riderId = $this->createRiderRecord($riderUser);

        $res = $this->actingAs($riderUser)->getJson('/api/rider/reviews');
        $res->assertOk();
        $this->assertSame($riderId, $res->json('data.rider_id'));
        $this->assertArrayHasKey('rating_summary', $res->json('data'));
        $this->assertArrayHasKey('reviews', $res->json('data'));
        $this->assertArrayHasKey('pagination', $res->json('data'));
    }
}
