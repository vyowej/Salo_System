<?php

namespace App\Support\Storage;

use RuntimeException;

class ImageStorageUnavailableException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $statusCode = 503,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function statusCode(): int
    {
        return $this->statusCode;
    }

    public static function temporarilyUnavailable(?\Throwable $previous = null): self
    {
        return new self(
            message: 'Image storage is temporarily unavailable. Your changes were not saved. Please try again in a few minutes.',
            statusCode: 503,
            previous: $previous,
        );
    }

    public static function quotaExceeded(?\Throwable $previous = null): self
    {
        return new self(
            message: 'Image upload is unavailable right now. Please contact SALO support.',
            statusCode: 503,
            previous: $previous,
        );
    }

    public static function credentialsInvalid(?\Throwable $previous = null): self
    {
        return new self(
            message: 'Image upload is unavailable right now. Please contact SALO support.',
            statusCode: 503,
            previous: $previous,
        );
    }
}
