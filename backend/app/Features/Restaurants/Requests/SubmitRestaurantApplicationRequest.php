<?php

namespace App\Features\Restaurants\Requests;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SubmitRestaurantApplicationRequest extends FormRequest
{
    public const RESTAURANT_DOCUMENT_CODES = [
        'dti_certificate',
        'sec_certificate',
        'cda_certificate',
        'other_registration',
        'government_id',
        'mayors_permit',
        'proof_of_address',
        'authorization_letter',
        'bir_2303',
        'barangay_clearance',
        'sanitary_permit',
        'fire_safety_permit',
        'bank_proof',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $maxKb = max(256, (int) config('salo.uploads.max_size_kb', 5120));
        $docMimes = implode(',', (array) config('salo.uploads.allowed_document_types', ['pdf', 'jpg', 'jpeg', 'png']));
        $imgMimes = implode(',', (array) config('salo.uploads.allowed_image_types', ['jpg', 'jpeg', 'png', 'webp']));
        $minAdultDob = Carbon::now('Asia/Manila')->subYears(18)->format('Y-m-d');

        return [
            'restaurant_name' => ['required', 'string', 'max:200'],
            'registered_name' => ['nullable', 'string', 'max:200'],
            'business_type' => ['required', 'string', Rule::in(['restaurant', 'cafe', 'bakery', 'fast_food', 'food_stall', 'food_kiosk', 'cloud_kitchen', 'other'])],
            'ownership_structure' => ['required', 'string', Rule::in(['sole_proprietorship', 'partnership', 'corporation', 'cooperative', 'other'])],
            'description' => ['nullable', 'string', 'max:2000'],
            'business_phone' => ['required', 'string', 'max:30'],
            'business_email' => ['required', 'string', 'email', 'max:255'],
            'categories' => ['nullable', 'array'],
            'categories.*' => ['string', 'max:100'],

            'applicant_position' => ['required', 'string', Rule::in(['business_owner', 'co_owner', 'authorized_representative', 'manager'])],
            'legal_first_name' => ['required', 'string', 'max:100'],
            'legal_middle_name' => ['nullable', 'string', 'max:100'],
            'legal_last_name' => ['required', 'string', 'max:100'],
            'legal_suffix' => ['nullable', 'string', 'max:20'],
            'date_of_birth' => ['required', 'date', "before_or_equal:{$minAdultDob}"],
            'contact_phone' => ['required', 'string', 'max:30'],
            'contact_email' => ['required', 'string', 'email', 'max:255'],

            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'street' => ['nullable', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'string', 'regex:/^[0-9]{4}$/'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],

            'delivery_radius' => ['nullable', 'numeric', 'min:0.5', 'max:100'],
            'offers_delivery' => ['required', 'boolean'],
            'offers_pickup' => ['required', 'boolean'],
            'offers_dine_in' => ['required', 'boolean'],
            'accepts_reservations' => ['nullable', 'boolean'],
            'operating_hours' => ['nullable', 'array'],
            'operating_hours.*.day_of_week' => ['required_with:operating_hours', 'integer', 'between:0,6'],
            'operating_hours.*.opening_time' => ['required_with:operating_hours', 'string'],
            'operating_hours.*.closing_time' => ['required_with:operating_hours', 'string'],
            'operating_hours.*.is_closed' => ['nullable', 'boolean'],

            'payout_provider' => ['required', 'string', 'max:100'],
            'payout_account_type' => ['required', 'string', Rule::in(['savings', 'current_checking', 'e_wallet', 'other'])],
            'payout_account_holder_name' => ['required', 'string', 'max:150'],
            'payout_account_number' => ['required', 'string', 'max:100'],

            'terms_accepted' => ['required', 'accepted'],
            'terms_version' => ['nullable', 'string', 'max:20'],

            'logo_image' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],
            'cover_image' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],

            'documents' => ['required', 'array', 'min:1'],
            'documents.*' => ['file', "mimes:{$docMimes}", "max:{$maxKb}"],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'date_of_birth.before_or_equal' => 'Representative must be at least 18 years old.',
            'terms_accepted.accepted' => 'You must accept the Partner Agreement to submit.',
        ];
    }
}
