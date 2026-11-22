<?php

namespace Database\Seeders;

use App\Features\Notifications\Services\NotificationService;
use App\Models\User;
use App\Support\AddressService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class QaNotificationsSeeder extends Seeder
{
    public function run(): void
    {
        $resolvedDb = DB::connection()->getDatabaseName();
        if (app()->environment() !== 'qa' || $resolvedDb !== 'salo_test') {
            throw new RuntimeException(
                'QaNotificationsSeeder aborted: expected APP_ENV=qa and DB_DATABASE=salo_test, got APP_ENV='
                .app()->environment()." and DB_DATABASE={$resolvedDb}."
            );
        }

        $password = (string) env('QA_CUSTOMER_PASSWORD', 'QaPassword123!');
        $notifService = app(NotificationService::class);
        $addressService = app(AddressService::class);

        $customer = $this->ensureUser('qa_customer', 'qa.customer@salo.local', 'QA', 'Customer', 'customer', $password);
        $inviteeDecline = $this->ensureUser('qa_customer_two', 'qa.customer2@salo.local', 'QA', 'Invitee', 'customer', $password);
        $owner = $this->ensureUser('qa_owner', 'qa.owner@salo.local', 'QA', 'Owner', 'customer', $password);
        $staff = $this->ensureUser('qa_staff', 'qa.staff@salo.local', 'QA', 'Staff', 'customer', $password);
        $riderUser = $this->ensureUser('qa_rider', 'qa.rider@salo.local', 'QA', 'Rider', 'customer', $password);
        $admin = $this->ensureUser('qa_admin', 'qa.admin@salo.local', 'QA', 'Admin', 'admin', $password);

        // Ensure active QA restaurant
        $restaurant = DB::table('restaurants')->where('restaurant_name', 'QA Bistro')->first();
        if (! $restaurant) {
            $addrId = $addressService->createAddress([
                'province' => 'Metro Manila',
                'city' => 'Quezon City',
                'barangay' => 'Diliman',
                'street' => '10 QA Test Ave',
            ]);
            $restaurantId = (int) DB::table('restaurants')->insertGetId([
                'parent_restaurant_id' => null,
                'brand_restaurant_id' => null,
                'restaurant_name' => 'QA Bistro',
                'business_type' => 'restaurant',
                'ownership_structure' => 'sole_proprietorship',
                'business_email' => 'qa.bistro@salo.local',
                'contact_phone' => '09170000010',
                'address_id' => $addrId,
                'restaurant_status' => 'active',
                'accepting_orders' => 1,
                'offers_delivery' => 1,
                'offers_pickup' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('restaurants')
                ->where('restaurant_id', $restaurantId)
                ->update(['brand_restaurant_id' => $restaurantId]);
        } else {
            $restaurantId = (int) $restaurant->restaurant_id;
        }

        DB::table('restaurant_owners')->updateOrInsert(
            ['restaurant_id' => $restaurantId, 'user_id' => $owner->user_id],
            ['joined_at' => now()],
        );

        DB::table('restaurant_staff')->updateOrInsert(
            ['restaurant_id' => $restaurantId, 'user_id' => $staff->user_id],
            [
                'invited_by' => $owner->user_id,
                'staff_position' => 'Order Handler',
                'staff_status' => 'active',
                'invited_at' => now()->subDays(2),
                'responded_at' => now()->subDays(1),
                'joined_at' => now()->subDays(1),
                'updated_at' => now(),
            ],
        );

        // Ensure pending staff invitations for QA customer & QA invitee2
        $this->ensurePendingInvitation($restaurantId, $customer->user_id, $owner->user_id, 'Order Handler', 'Welcome to QA Bistro');
        $this->ensurePendingInvitation($restaurantId, $inviteeDecline->user_id, $owner->user_id, 'Inventory Manager', 'Decline test invite');

        // Ensure active QA rider
        $cityId = (int) (DB::table('cities')->value('city_id') ?? 1);
        DB::table('riders')->updateOrInsert(
            ['user_id' => $riderUser->user_id],
            [
                'vehicle_type' => 'bicycle',
                'emergency_contact_name' => 'QA Contact',
                'emergency_contact_relationship' => 'sibling',
                'emergency_contact_phone' => '09170000099',
                'base_city_id' => $cityId,
                'rider_status' => 'active',
                'approved_at' => now()->subDays(1),
                'updated_at' => now(),
            ],
        );

        // Seed sample notifications per workspace if none exist for each QA user
        if (! DB::table('notifications')->where('user_id', $customer->user_id)->where('workspace', 'customer')->exists()) {
            $notifService->notifyUser($customer->user_id, 'customer', 'order_accepted', 'Order QA-ORD-101 accepted', 'QA Bistro accepted your order.', 'order', 101);
            $notifService->notifyUser($customer->user_id, 'customer', 'staff_invitation_received', 'Staff invitation from QA Bistro', 'QA invited you to join QA Bistro as Order Handler.', 'staff_invitation', 1);
        }

        if (! DB::table('notifications')->where('user_id', $owner->user_id)->where('workspace', 'restaurant')->exists()) {
            $notifService->notifyUser($owner->user_id, 'restaurant', 'order_received', 'New order QA-ORD-102', 'QA placed a pickup order (QA-ORD-102).', 'order', 102);
        }

        if (! DB::table('notifications')->where('user_id', $riderUser->user_id)->where('workspace', 'rider')->exists()) {
            $notifService->notifyUser($riderUser->user_id, 'rider', 'rider_application_approved', 'Rider application approved', 'Your rider application (QA-RID-1) is approved.', 'rider_applications', 1);
            $notifService->notifyUser($riderUser->user_id, 'rider', 'rider_activated', 'Rider account activated', 'Your rider account has been activated. You can now go online.', 'rider', 1);
        }

        if (! DB::table('notifications')->where('user_id', $admin->user_id)->where('workspace', 'admin')->exists()) {
            $notifService->notifyUser($admin->user_id, 'admin', 'restaurant_application_submitted', 'New restaurant application', 'QA submitted a restaurant application (QA-APP-1).', 'restaurant_applications', 1);
        }

        $this->command?->info('QA notifications and accounts seeded into salo_test.');
    }

    private function ensureUser(string $username, string $email, string $firstName, string $lastName, string $role, string $password): User
    {
        $existing = User::where('email', $email)->orWhere('username', $username)->first();
        if ($existing) {
            return $existing;
        }

        return User::create([
            'username' => $username,
            'first_name' => $firstName,
            'middle_initial' => null,
            'last_name' => $lastName,
            'email' => $email,
            'password_hash' => Hash::make($password),
            'phone_number' => '09170000001',
            'date_of_birth' => '1995-05-15',
            'user_role' => $role,
            'account_status' => 'active',
            'email_verified_at' => now(),
        ]);
    }

    private function ensurePendingInvitation(int $restaurantId, int $userId, int $ownerId, string $position, string $note): void
    {
        $existing = DB::table('restaurant_staff')
            ->where('restaurant_id', $restaurantId)
            ->where('user_id', $userId)
            ->first();

        if (! $existing || $existing->staff_status !== 'invited') {
            DB::table('restaurant_staff')->updateOrInsert(
                ['restaurant_id' => $restaurantId, 'user_id' => $userId],
                [
                    'invited_by' => $ownerId,
                    'staff_position' => $position,
                    'invitation_note' => $note,
                    'staff_status' => 'invited',
                    'invited_at' => now(),
                    'expires_at' => now()->addDays(7),
                    'responded_at' => null,
                    'joined_at' => null,
                    'updated_at' => now(),
                ],
            );
        }
    }
}
