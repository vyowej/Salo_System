<?php

namespace App\Features\Restaurants\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreBranchRequest extends FormRequest
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
            'branch_name' => ['required', 'string', 'max:150'],
            'main_branch_name' => ['nullable', 'string', 'max:150'],
            'contact_phone' => ['nullable', 'string', 'max:30'],

            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'street' => ['nullable', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'string', 'regex:/^[0-9]{4}$/'],
            'latitude' => ['nullable', 'required_with:longitude', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'required_with:latitude', 'numeric', 'between:-180,180'],

            'offers_delivery' => ['nullable', 'boolean'],
            'offers_pickup' => ['nullable', 'boolean'],
            'offers_dine_in' => ['nullable', 'boolean'],
            'accepts_reservations' => ['nullable', 'boolean'],

            'copy_operating_hours' => ['nullable', 'boolean'],
            'copy_menu' => ['nullable', 'boolean'],
            'copy_from_restaurant_id' => ['nullable', 'integer', 'min:1'],

            'mayors_permit' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
            'is_required_locally' => ['nullable', 'boolean'],
            'exemption_reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
