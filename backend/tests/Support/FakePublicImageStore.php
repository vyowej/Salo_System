<?php

namespace Tests\Support;

use App\Support\Storage\ImageStorageUnavailableException;
use App\Support\Storage\PublicImageStore;
use Illuminate\Support\Str;

class FakePublicImageStore implements PublicImageStore
{
    /** @var array<string, array{content: string, mime: string, name: string, directory: string, meta: array<string, string>}> */
    public array $files = [];

    /** @var list<array{name: string, directory: string, mime: string, meta: array<string, string>, stored: string}> */
    public array $putCalls = [];

    /** @var list<string> */
    public array $deleteCalls = [];

    public ?ImageStorageUnavailableException $failNextPutWith = null;

    public function put(string $localPath, string $mime, string $name, string $directory, array $meta = []): string
    {
        if ($this->failNextPutWith !== null) {
            $exception = $this->failNextPutWith;
            $this->failNextPutWith = null;
            throw $exception;
        }

        $id = 'fake_'.Str::random(16);
        $stored = 'gdrive:'.$id;
        $content = (string) @file_get_contents($localPath);

        $this->files[$stored] = [
            'content' => $content,
            'mime' => $mime,
            'name' => $name,
            'directory' => $directory,
            'meta' => $meta,
        ];

        $this->putCalls[] = [
            'name' => $name,
            'directory' => $directory,
            'mime' => $mime,
            'meta' => $meta,
            'stored' => $stored,
        ];

        return $stored;
    }

    public function delete(string $storedValue): bool
    {
        $this->deleteCalls[] = $storedValue;
        if (! isset($this->files[$storedValue])) {
            return false;
        }

        unset($this->files[$storedValue]);

        return true;
    }

    public function exists(string $storedValue): bool
    {
        return isset($this->files[$storedValue]);
    }

    public function url(string $storedValue): ?string
    {
        if (! str_starts_with($storedValue, 'gdrive:')) {
            return null;
        }

        $id = substr($storedValue, strlen('gdrive:'));
        $appUrl = rtrim((string) config('app.url', 'http://localhost:8000'), '/');

        return $appUrl.'/api/media/images/'.$id;
    }

    public function readStream(string $storedValue): array
    {
        if (! isset($this->files[$storedValue])) {
            throw ImageStorageUnavailableException::temporarilyUnavailable();
        }

        $entry = $this->files[$storedValue];
        $stream = fopen('php://temp', 'w+b');
        fwrite($stream, $entry['content']);
        rewind($stream);

        return [
            'stream' => $stream,
            'mime' => $entry['mime'],
            'size' => strlen($entry['content']),
            'appProperties' => array_merge(['visibility' => 'public'], $entry['meta']),
        ];
    }
}
