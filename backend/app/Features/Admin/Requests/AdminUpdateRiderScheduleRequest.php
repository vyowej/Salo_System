<?php

namespace App\Features\Admin\Requests;

use App\Features\Riders\Services\RiderScheduleService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdminUpdateRiderScheduleRequest extends FormRequest
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
            'available_days' => ['required', 'array', 'min:1'],
            'available_days.*' => ['string', Rule::in(RiderScheduleService::VALID_DAYS)],
            'preferred_shifts' => ['required', 'array', 'min:1'],
            'preferred_shifts.*' => ['string', Rule::in(RiderScheduleService::VALID_SHIFTS)],
            'preferred_hubs' => ['nullable'],
            'effective_date' => ['required', 'date_format:Y-m-d'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
