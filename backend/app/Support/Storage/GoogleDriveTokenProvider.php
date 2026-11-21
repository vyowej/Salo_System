<?php

namespace App\Support\Storage;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GoogleDriveTokenProvider
{
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const CACHE_KEY = 'salo_gdrive_access_token';

    public function getAccessToken(bool $forceRefresh = false): string
    {
        if (! $forceRefresh) {
            $cached = Cache::get(self::CACHE_KEY);
            if (is_string($cached) && $cached !== '') {
                return $cached;
            }
        }

        $clientId = trim((string) config('salo.uploads.google_drive.client_id', ''));
        $clientSecret = trim((string) config('salo.uploads.google_drive.client_secret', ''));
        $refreshToken = trim((string) config('salo.uploads.google_drive.refresh_token', ''));

        if ($clientId === '' || $clientSecret === '' || $refreshToken === '') {
            Log::critical('Google Drive OAuth credentials are not configured.');
            throw ImageStorageUnavailableException::credentialsInvalid();
        }

        $timeout = max(5, (int) config('salo.uploads.google_drive.timeout_seconds', 20));

        try {
            $response = Http::asForm()
                ->connectTimeout(5)
                ->timeout($timeout)
                ->post(self::TOKEN_URL, [
                    'grant_type' => 'refresh_token',
                    'client_id' => $clientId,
                    'client_secret' => $clientSecret,
                    'refresh_token' => $refreshToken,
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Google Drive token refresh connection failure.', ['error' => $e->getMessage()]);
            throw ImageStorageUnavailableException::temporarilyUnavailable($e);
        }

        if ($response->successful()) {
            $accessToken = (string) ($response->json('access_token') ?? '');
            if ($accessToken === '') {
                Log::warning('Google Drive token response missing access_token.');
                throw ImageStorageUnavailableException::temporarilyUnavailable();
            }

            $expiresIn = (int) ($response->json('expires_in') ?? 3600);
            $ttl = max(60, $expiresIn - 300);
            Cache::put(self::CACHE_KEY, $accessToken, $ttl);

            return $accessToken;
        }

        $errorCode = (string) ($response->json('error') ?? '');
        if ($response->status() === 400 && in_array($errorCode, ['invalid_grant', 'unauthorized_client', 'invalid_client'], true)) {
            Log::critical('Drive credentials invalid — re-authorize.', [
                'status' => $response->status(),
                'reason' => $errorCode,
            ]);
            throw ImageStorageUnavailableException::credentialsInvalid();
        }

        Log::warning('Google Drive token refresh failed.', [
            'status' => $response->status(),
            'reason' => $errorCode !== '' ? $errorCode : 'unknown',
        ]);
        throw ImageStorageUnavailableException::temporarilyUnavailable();
    }

    public function forgetToken(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
