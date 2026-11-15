<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $connection = config('database.default');
        $configuredDatabase = config("database.connections.{$connection}.database");

        if ($configuredDatabase !== 'salo_test') {
            $this->fail("Unsafe test database configuration: expected 'salo_test', got '{$configuredDatabase}'.");
        }

        try {
            $actualDatabase = DB::selectOne('SELECT DATABASE() AS db')?->db;
        } catch (\Throwable $e) {
            $this->fail('Could not verify active test database connection to salo_test: '.$e->getMessage());
        }

        if ($actualDatabase !== 'salo_test') {
            $this->fail("Unsafe active test database: expected 'salo_test', connected to '{$actualDatabase}'.");
        }
    }
}
