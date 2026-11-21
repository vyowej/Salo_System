<?php

namespace App\Features\Orders\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CheckoutRequest extends FormRequest
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
        $maxQty = max(1, (int) config('salo.orders.max_item_quantity', 50));

        return [
            'payment_method' => ['required', 'string', Rule::in(['cod'])],
            'idempotency_key' => ['required', 'string', 'min:8', 'max:64'],
            'contact_number_id' => ['nullable', 'integer', 'min:1'],
            'groups' => ['required', 'array', 'min:1', 'max:20'],
            'groups.*.restaurant_id' => ['required', 'integer', 'min:1'],
            'groups.*.fulfillment' => ['required', 'string', Rule::in(['delivery', 'pickup'])],
            'groups.*.address_id' => ['nullable', 'integer', 'min:1'],
            'groups.*.delivery_notes' => ['nullable', 'string', 'max:500'],
            'groups.*.expected_total' => ['nullable', 'numeric', 'min:0'],
            'groups.*.items' => ['required', 'array', 'min:1', 'max:50'],
            'groups.*.items.*.menu_item_id' => ['required', 'integer', 'min:1'],
            'groups.*.items.*.quantity' => ['required', 'integer', 'min:1', "max:{$maxQty}"],
            'groups.*.items.*.add_on_option_ids' => ['sometimes', 'array', 'max:50'],
            'groups.*.items.*.add_on_option_ids.*' => ['integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'payment_method.in' => 'Only Cash on Delivery (cod) is supported.',
        ];
    }
}
