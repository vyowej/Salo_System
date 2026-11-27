<?php

namespace App\Features\Riders\Requests;

use App\Features\Riders\Services\RiderSupportService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateRiderSupportTicketRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'category' => ['required', 'string', Rule::in(RiderSupportService::CATEGORIES)],
            'priority' => ['sometimes', 'string', Rule::in(RiderSupportService::PRIORITIES)],
            'order_id' => ['nullable', 'integer', 'min:1'],
            'subject' => ['required', 'string', 'min:4', 'max:150'],
            'description' => ['required', 'string', 'min:10', 'max:2000'],
        ];
    }
}
