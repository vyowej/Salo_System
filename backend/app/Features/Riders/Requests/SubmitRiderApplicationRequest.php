<?php

namespace App\Features\Riders\Requests;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SubmitRiderApplicationRequest extends FormRequest
{
    public const RIDER_DOCUMENT_CODES = [
        'government_id_front',
        'government_id_back',
        'selfie',
        'driver_license',
        'lto_or',
        'lto_cr',
        'motorcycle_photo',
        'vehicle_authorization',
        'motor_insurance',
        'bicycle_photo',
        'bicycle_proof',
        'ebike_photo',
        'ebike_proof',
        'escooter_photo',
        'escooter_proof',
        'nbi_clearance',
        'police_clearance',
        'medical_clearance',
        'barangay_clearance',
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
        $minAdultDob = Carbon::now('Asia/Manila')->subYears(18)->format('Y-m-d');

        return [
            'legal_first_name' => ['required', 'string', 'max:100'],
            'legal_middle_name' => ['nullable', 'string', 'max:100'],
            'legal_last_name' => ['required', 'string', 'max:100'],
            'legal_suffix' => ['nullable', 'string', 'max:20'],
            'date_of_birth' => ['required', 'date', "before_or_equal:{$minAdultDob}"],
            'gender' => ['nullable', 'string', Rule::in(['prefer_not_to_say', 'male', 'female', 'non_binary_other'])],
            'contact_phone' => ['required', 'string', 'max:30'],
            'contact_email' => ['required', 'string', 'email', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:200'],

            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'street' => ['nullable', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'string', 'regex:/^[0-9]{4}$/'],

            'gov_id_type' => ['required', 'string', Rule::in(['philid', 'drivers_license', 'passport', 'umid', 'sss', 'postal_id', 'prc', 'voters_comelec', 'other'])],
            'gov_id_number' => ['required', 'string', 'max:100'],
            'gov_id_is_permanent' => ['required', 'boolean'],
            'gov_id_expires_on' => ['nullable', 'required_if:gov_id_is_permanent,false', 'date', 'after:today'],

            'vehicle_type' => ['required', 'string', Rule::in(['motorcycle', 'bicycle', 'e_bike', 'e_scooter', 'walking'])],
            'vehicle_brand' => ['nullable', 'string', 'max:100'],
            'vehicle_model' => ['nullable', 'string', 'max:100'],
            'vehicle_color' => ['nullable', 'string', 'max:50'],
            'vehicle_year' => ['nullable', 'required_if:vehicle_type,motorcycle', 'integer', 'min:1980', 'max:'.((int) date('Y') + 1)],
            'plate_number' => ['nullable', 'required_if:vehicle_type,motorcycle', 'string', 'max:30'],
            'mv_file_number' => ['nullable', 'string', 'max:20'],
            'vehicle_ownership' => ['nullable', 'required_if:vehicle_type,motorcycle', 'string', Rule::in(['personally_owned', 'family_owned', 'borrowed', 'rented_leased', 'company_owned'])],
            'vehicle_owner_name' => ['nullable', 'string', 'max:150'],
            'vehicle_owner_relationship' => ['nullable', 'string', 'max:100'],
            'bicycle_type' => ['nullable', 'string', Rule::in(['road', 'mountain', 'city_commuter', 'folding', 'gravel', 'cargo', 'other'])],
            'motor_wattage' => ['nullable', 'string', 'max:50'],

            'emergency_contact_name' => ['required', 'string', 'max:150'],
            'emergency_contact_relationship' => ['required', 'string', Rule::in(['parent', 'spouse_partner', 'sibling', 'child', 'relative', 'friend', 'colleague', 'other'])],
            'emergency_contact_phone' => ['required', 'string', 'max:30'],
            'emergency_contact_alt_phone' => ['nullable', 'string', 'max:30'],
            'base_city' => ['required', 'string', 'max:100'],
            'base_province' => ['nullable', 'string', 'max:100'],
            'preferred_hubs' => ['nullable', 'string', 'max:255'],
            'preferred_shifts' => ['nullable', 'array'],
            'preferred_shifts.*' => ['string', Rule::in(['breakfast', 'lunch', 'afternoon', 'dinner', 'late_night', 'flexible'])],
            'available_days' => ['nullable', 'array'],
            'available_days.*' => ['string', Rule::in(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])],

            'payout_provider' => ['required', 'string', 'max:100'],
            'payout_account_type' => ['required', 'string', Rule::in(['savings', 'current_checking', 'e_wallet', 'other'])],
            'payout_account_holder_name' => ['required', 'string', 'max:150'],
            'payout_account_number' => ['required', 'string', 'max:100'],

            'terms_accepted' => ['required', 'accepted'],
            'terms_version' => ['nullable', 'string', 'max:20'],

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
            'date_of_birth.before_or_equal' => 'Applicant must be at least 18 years old.',
            'terms_accepted.accepted' => 'You must accept the Rider Partner Agreement to submit.',
        ];
    }
}
