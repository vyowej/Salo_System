<?php

namespace App\Features\Media\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\LocalPublicImageStore;
use App\Support\Storage\PublicImageStore;
use App\Support\Storage\StoragePurpose;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class PublicImageProxyController extends Controller
{
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    public function show(Request $request, string $fileId): Response
    {
        if (preg_match('/^[A-Za-z0-9_-]{10,128}$/', $fileId) !== 1) {
            abort(404, 'Image not found.');
        }

        $storedValue = GoogleDrivePublicImageStore::PREFIX.$fileId;

        $isReferenced = DB::table('restaurants')
            ->where('logo_image', $storedValue)
            ->orWhere('cover_image', $storedValue)
            ->exists()
            || DB::table('menu_items')
                ->where('photo_image', $storedValue)
                ->orWhere('published_photo_image', $storedValue)
                ->exists()
            || DB::table('riders')
                ->where('profile_photo', $storedValue)
                ->exists();

        abort_unless($isReferenced, 404, 'Image not found.');

        $etag = '"gdrive-'.$fileId.'"';
        $headers = [
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'ETag' => $etag,
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
            'Content-Security-Policy' => "default-src 'none'",
        ];

        if ($request->header('If-None-Match') === $etag) {
            return response('', HttpResponse::HTTP_NOT_MODIFIED, $headers);
        }

        $useCache = (bool) config('salo.uploads.google_drive.proxy_cache', true);
        $cacheBinPath = "drive-cache/{$fileId}.bin";
        $cacheMetaPath = "drive-cache/{$fileId}.json";

        if ($useCache && Storage::disk('local')->exists($cacheBinPath) && Storage::disk('local')->exists($cacheMetaPath)) {
            $meta = json_decode((string) Storage::disk('local')->get($cacheMetaPath), true);
            $cachedMime = is_array($meta) ? (string) ($meta['mime'] ?? '') : '';
            $cachedVisibility = is_array($meta) ? (string) ($meta['visibility'] ?? '') : '';

            if ($cachedVisibility === StoragePurpose::VISIBILITY_PUBLIC && in_array($cachedMime, self::ALLOWED_MIME_TYPES, true)) {
                /** @var \Illuminate\Filesystem\FilesystemAdapter $localDisk */
                $localDisk = Storage::disk('local');

                return $localDisk->response($cacheBinPath, null, array_merge($headers, [
                    'Content-Type' => $cachedMime,
                ]));
            }
        }

        $result = $this->readFromDrive($storedValue);
        $stream = $result['stream'];
        $mime = strtolower(trim((string) $result['mime']));
        $appProps = is_array($result['appProperties'] ?? null) ? $result['appProperties'] : [];
        $visibility = (string) ($appProps['visibility'] ?? '');

        if ($visibility !== StoragePurpose::VISIBILITY_PUBLIC || ! in_array($mime, self::ALLOWED_MIME_TYPES, true)) {
            if (is_resource($stream)) {
                fclose($stream);
            }
            abort(404, 'Image not found.');
        }

        $bytes = stream_get_contents($stream);
        if (is_resource($stream)) {
            fclose($stream);
        }

        if ($bytes === false) {
            abort(503, 'Image storage is temporarily unavailable.');
        }

        if ($useCache) {
            Storage::disk('local')->put($cacheBinPath, $bytes);
            Storage::disk('local')->put($cacheMetaPath, json_encode([
                'mime' => $mime,
                'size' => strlen($bytes),
                'visibility' => StoragePurpose::VISIBILITY_PUBLIC,
            ], JSON_THROW_ON_ERROR));
        }

        return response($bytes, HttpResponse::HTTP_OK, array_merge($headers, [
            'Content-Type' => $mime,
            'Content-Length' => (string) strlen($bytes),
        ]));
    }

    /**
     * @return array{stream: resource, mime: string, size: int, appProperties?: array<string, string>}
     */
    private function readFromDrive(string $storedValue): array
    {
        $boundStore = app(PublicImageStore::class);
        if (! $boundStore instanceof LocalPublicImageStore && ! $boundStore instanceof GoogleDrivePublicImageStore) {
            return $boundStore->readStream($storedValue);
        }

        if (app()->bound(DriveClientInterface::class)) {
            return app(DriveClientInterface::class)->readStream($storedValue);
        }

        return $this->resolveDriveCapableStore()->readStream($storedValue);
    }

    private function resolveDriveCapableStore(): PublicImageStore
    {
        $bound = app(PublicImageStore::class);

        if ($bound instanceof LocalPublicImageStore) {
            return app(GoogleDrivePublicImageStore::class);
        }

        return $bound;
    }
}
