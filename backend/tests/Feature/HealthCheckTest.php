<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    public function test_api_health_returns_app_and_database_status(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Service is healthy.',
                'data' => [
                    'app' => 'up',
                    'database' => 'up',
                ],
            ]);
    }
}
