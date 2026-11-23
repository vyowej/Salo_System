<?php

namespace Tests\Unit;

use App\Support\Storage\GoogleDriveClient;
use App\Support\Storage\GoogleDriveTokenProvider;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleDriveClientMoveTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();

        config([
            'salo.uploads.google_drive.client_id' => 'test-client-id',
            'salo.uploads.google_drive.client_secret' => 'test-client-secret',
            'salo.uploads.google_drive.refresh_token' => 'test-refresh-token',
            'salo.uploads.google_drive.timeout_seconds' => 10,
        ]);
    }

    public function test_move_file_without_app_properties_sends_no_json_body(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/drive/v3/files/file_123?fields=*' => Http::response([
                'id' => 'file_123',
                'parents' => ['old_parent'],
            ], 200),
            'https://www.googleapis.com/drive/v3/files/file_123?addParents=*' => Http::response([
                'id' => 'file_123',
                'parents' => ['new_parent'],
            ], 200),
        ]);

        $client = new GoogleDriveClient(new GoogleDriveTokenProvider, 0);
        $this->assertTrue($client->moveFile('gdrive:file_123', 'new_parent'));

        Http::assertSent(function (ClientRequest $request): bool {
            if ($request->method() !== 'PATCH') {
                return false;
            }
            $url = $request->url();

            return str_contains($url, 'addParents=new_parent')
                && str_contains($url, 'removeParents=old_parent')
                && $request->body() === '';
        });
    }

    public function test_move_and_tag_file_with_app_properties_sends_metadata_body(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok_ok', 'expires_in' => 3600], 200),
            'https://www.googleapis.com/drive/v3/files/file_456?fields=*' => Http::response([
                'id' => 'file_456',
                'parents' => ['flat_root'],
            ], 200),
            'https://www.googleapis.com/drive/v3/files/file_456?addParents=*' => Http::response([
                'id' => 'file_456',
                'parents' => ['cat_folder'],
                'appProperties' => ['visibility' => 'public'],
            ], 200),
        ]);

        $client = new GoogleDriveClient(new GoogleDriveTokenProvider, 0);
        $this->assertTrue($client->moveAndTagFile('gdrive:file_456', 'cat_folder', ['visibility' => 'public']));

        Http::assertSent(function (ClientRequest $request): bool {
            if ($request->method() !== 'PATCH') {
                return false;
            }
            $data = $request->data();

            return str_contains($request->url(), 'addParents=cat_folder')
                && ($data['appProperties']['visibility'] ?? null) === 'public';
        });
    }
}
