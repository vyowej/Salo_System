<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminValidationCharacterizationTest extends TestCase
{
    use DatabaseTransactions;

    private function createAdmin(): User
    {
        return User::forceCreate([
            'username' => 'admval_' . random_int(10000, 99999),
            'first_name' => 'Admin',
            'last_name' => 'Validator',
            'email' => 'admval_' . random_int(10000, 99999) . '@example.com',
            'password_hash' => Hash::make('SecretPass123!'),
            'user_role' => 'admin',
            'account_status' => 'active',
        ]);
    }

    public function test_admin_endpoints_return_exact_422_validation_responses(): void
    {
        $admin = $this->createAdmin();

        // 1. AdminManagementController::createUser
        $resCreateUser = $this->actingAs($admin)->postJson('/api/admin/users', [
            'username' => '',
            'first_name' => '',
            'last_name' => '',
            'email' => 'not-an-email',
            'password' => 'short',
            'user_role' => 'superadmin',
            'account_status' => 'banned',
        ]);
        $resCreateUser->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['username', 'first_name', 'last_name', 'email', 'password', 'user_role', 'account_status'])
            ->assertJsonPath('errors.email.0', 'The email field must be a valid email address.')
            ->assertJsonPath('errors.password.0', 'The password field must be at least 8 characters.');

        // 2. AdminManagementController::updateUser
        $resUpdateUser = $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->user_id}", [
            'first_name' => 123,
            'user_role' => 'owner',
            'account_status' => 'deleted',
        ]);
        $resUpdateUser->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['first_name', 'user_role', 'account_status'])
            ->assertJsonPath('errors.user_role.0', 'The selected user role is invalid.');

        // 3. AdminManagementController::updateRestaurantStatus
        $resRestStatus = $this->actingAs($admin)->patchJson('/api/admin/restaurants/1/status', [
            'status' => 'unknown_status',
        ]);
        $resRestStatus->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['status'])
            ->assertJsonPath('errors.status.0', 'The selected status is invalid.');

        // 4. AdminManagementController::updateRiderStatus
        $resRiderStatus = $this->actingAs($admin)->patchJson('/api/admin/riders/1/status', [
            'status' => 'active',
        ]);
        $resRiderStatus->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['status'])
            ->assertJsonPath('errors.status.0', 'The selected status is invalid.');

        // 5. AdminApplicationController::reviewDocument
        $resReviewDoc = $this->actingAs($admin)->patchJson('/api/admin/applications/restaurant/1/documents/1', [
            'status' => 'approved',
        ]);
        $resReviewDoc->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['status'])
            ->assertJsonPath('errors.status.0', 'The selected status is invalid.');

        // 6. AdminApplicationController::requestDocument
        $resReqDoc = $this->actingAs($admin)->postJson('/api/admin/applications/restaurant/1/document-requests', [
            'document_name' => '',
            'reason' => '',
            'due_date' => '2020-01-01',
        ]);
        $resReqDoc->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['document_name', 'reason', 'due_date'])
            ->assertJsonPath('errors.due_date.0', 'The due date field must be a date after or equal to today.');

        // 7. AdminApplicationController::decide
        $resDecide = $this->actingAs($admin)->postJson('/api/admin/applications/restaurant/1/decision', [
            'decision' => 'invalid_decision',
        ]);
        $resDecide->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['decision'])
            ->assertJsonPath('errors.decision.0', 'The selected decision is invalid.');

        // 8. AdminOrderController::index
        $resOrders = $this->actingAs($admin)->getJson('/api/admin/orders?page=0&per_page=101&order_status=bogus&order_type=drone&payment_status=magic&date_from=2026-10-20&date_to=2026-10-01&direction=sideways');
        $resOrders->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonValidationErrors(['page', 'per_page', 'order_status', 'order_type', 'payment_status', 'date_to', 'direction'])
            ->assertJsonPath('errors.per_page.0', 'The per page field must not be greater than 100.')
            ->assertJsonPath('errors.date_to.0', 'The date to field must be a date after or equal to date from.');
    }
}
