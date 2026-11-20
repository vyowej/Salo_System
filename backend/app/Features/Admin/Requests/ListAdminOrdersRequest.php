<?php

namespace App\Features\Admin\Requests;

use App\Features\Admin\Services\AdminOrderService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListAdminOrdersRequest extends FormRequest
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
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'order_status' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], AdminOrderService::ORDER_STATUSES))],
            'order_type' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], AdminOrderService::ORDER_TYPES))],
            'payment_status' => ['sometimes', 'nullable', 'string', Rule::in(array_merge(['all'], AdminOrderService::PAYMENT_STATUSES))],
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'direction' => ['sometimes', 'nullable', 'string', Rule::in(['asc', 'desc'])],
        ];
    }
}
