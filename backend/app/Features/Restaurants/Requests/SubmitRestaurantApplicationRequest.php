<?php

namespace App\Features\Restaurants\Requests;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

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
        $maxTotalBranches = max(1, (int) config('salo.restaurants.max_application_branches', 5));
        $maxAdditionalBranches = max(0, $maxTotalBranches - 1);

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

            'menu_items' => ['nullable', 'array', 'max:8'],
            'menu_items.*.name' => ['required_with:menu_items', 'string', 'max:200'],
            'menu_items.*.description' => ['nullable', 'string', 'max:2000'],
            'menu_items.*.category' => ['nullable', 'string', 'max:100'],
            'menu_items.*.price' => ['required_with:menu_items', 'numeric', 'min:0', 'max:999999.99'],
            'menu_items.*.available' => ['nullable', 'boolean'],
            'menu_item_photos' => ['nullable', 'array', 'max:8'],
            'menu_item_photos.*' => ['nullable', 'file', "mimes:{$imgMimes}", "max:{$maxKb}"],

            'documents' => ['required', 'array', 'min:1'],
            'documents.*' => ['file', "mimes:{$docMimes}", "max:{$maxKb}"],

            'has_branches' => ['nullable', 'boolean'],
            'main_branch_name' => ['nullable', 'string', 'max:150'],
            'branches' => ['nullable', 'array', "max:{$maxAdditionalBranches}"],
            'branches.*.branch_name' => ['required', 'string', 'max:150'],
            'branches.*.contact_phone' => ['nullable', 'string', 'max:30'],
            'branches.*.province' => ['required', 'string', 'max:100'],
            'branches.*.city' => ['required', 'string', 'max:100'],
            'branches.*.barangay' => ['required', 'string', 'max:100'],
            'branches.*.street' => ['nullable', 'string', 'max:255'],
            'branches.*.house_number' => ['nullable', 'string', 'max:50'],
            'branches.*.building_name' => ['nullable', 'string', 'max:150'],
            'branches.*.landmark' => ['nullable', 'string', 'max:500'],
            'branches.*.postal_code' => ['nullable', 'string', 'regex:/^[0-9]{4}$/'],
            'branches.*.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'branches.*.longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'branches.*.permit_required_locally' => ['nullable', 'boolean'],
            'branches.*.permit_exemption_reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $hasBranches = filter_var($this->input('has_branches', false), FILTER_VALIDATE_BOOLEAN);
            $branches = $this->input('branches');
            $hasBranchRows = is_array($branches) && count($branches) > 0;

            if (! $hasBranches && ! $hasBranchRows) {
                return;
            }

            $mainName = trim((string) $this->input('main_branch_name', ''));
            if ($mainName === '') {
                $validator->errors()->add('main_branch_name', 'The main branch name field is required when the business has branches.');
            }

            $seen = [];
            if ($mainName !== '') {
                $seen[mb_strtolower($mainName)] = true;
            }

            if (is_array($branches)) {
                foreach ($branches as $idx => $branch) {
                    if (! is_array($branch)) {
                        continue;
                    }
                    $permitRequired = array_key_exists('permit_required_locally', $branch) && $branch['permit_required_locally'] !== null
                        ? (filter_var($branch['permit_required_locally'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true)
                        : true;
                    if (! $permitRequired) {
                        $reason = trim((string) ($branch['permit_exemption_reason'] ?? ''));
                        $len = mb_strlen($reason);
                        if ($len < 10 || $len > 500) {
                            $validator->errors()->add(
                                "branches.{$idx}.permit_exemption_reason",
                                'Please provide an explanation between 10 and 500 characters when a local permit is not required.'
                            );
                        }
                    }

                    $bName = trim((string) ($branch['branch_name'] ?? ''));
                    if ($bName === '') {
                        continue;
                    }
                    $key = mb_strtolower($bName);
                    if (isset($seen[$key])) {
                        $validator->errors()->add("branches.{$idx}.branch_name", "Duplicate branch name \"{$bName}\". Branch names must be unique within the application.");
                    } else {
                        $seen[$key] = true;
                    }
                }
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'date_of_birth.before_or_equal' => 'Representative must be at least 18 years old.',
            'terms_accepted.accepted' => 'You must accept the Partner Agreement to submit.',
            'menu_items.max' => 'You can add up to 8 initial menu items during application. More items can be added after approval.',
            'menu_item_photos.max' => 'You can upload up to 8 initial menu item photos during application.',
        ];
    }
}
