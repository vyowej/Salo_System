<?php

namespace App\Support\Storage;

interface PublicImageStore
{
    /**
     * Store a validated public image and return the DB-storable identifier or relative path.
     *
     * @param  array<string, string>  $meta
     */
    public function put(string $localPath, string $mime, string $name, string $directory, array $meta = []): string;

    /**
     * Delete a stored public image by its DB-stored value.
     */
    public function delete(string $storedValue): bool;

    /**
     * Check whether a stored public image exists.
     */
    public function exists(string $storedValue): bool;

    /**
     * Resolve a DB-stored value into a browser-accessible URL.
     */
    public function url(string $storedValue): ?string;

    /**
     * Read image bytes as a stream (used by proxy serving).
     *
     * @return array{stream: resource, mime: string, size: int}
     */
    public function readStream(string $storedValue): array;
}
