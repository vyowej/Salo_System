<?php

namespace App\Features\Riders\Requests;

use App\Features\Riders\Services\RiderService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRiderAvailabilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'status' => ['required', 'string', Rule::in(RiderService::AVAILABILITY_STATUSES)],
        ];
    }
}
