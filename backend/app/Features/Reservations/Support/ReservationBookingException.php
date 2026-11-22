<?php

namespace App\Features\Reservations\Support;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class ReservationBookingException extends RuntimeException
{
    /**
     * @param  array<string, array<int, string>>|null  $errors
     * @param  array<string, mixed>  $extra
     */
    public function __construct(
        private readonly string $errorCode,
        string $message,
        private readonly int $statusCode = 409,
        private readonly ?array $errors = null,
        private readonly array $extra = [],
    ) {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function statusCode(): int
    {
        return $this->statusCode;
    }

    /**
     * @return array<string, array<int, string>>|null
     */
    public function errors(): ?array
    {
        return $this->errors;
    }

    /**
     * @return array<string, mixed>
     */
    public function extra(): array
    {
        return $this->extra;
    }

    public function toResponse(): JsonResponse
    {
        $payload = [
            'success' => false,
            'code' => $this->errorCode,
            'reason_code' => $this->errorCode,
            'message' => $this->getMessage(),
        ];

        if ($this->errors !== null) {
            $payload['errors'] = $this->errors;
        }

        foreach ($this->extra as $key => $value) {
            $payload[$key] = $value;
        }

        if ($this->extra !== [] && ! isset($payload['data'])) {
            $payload['data'] = $this->extra;
        }

        return response()->json($payload, $this->statusCode);
    }
}
