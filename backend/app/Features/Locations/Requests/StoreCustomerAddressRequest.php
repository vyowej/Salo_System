<?php

namespace App\Features\Locations\Requests;

use App\Features\Account\Requests\UpdateProfileRequest;
use Illuminate\Foundation\Http\FormRequest;

class StoreCustomerAddressRequest extends FormRequest
{
    public const RECIPIENT_PHONE_REGEX_MESSAGE = 'Enter a valid mobile number, like 09171234567.';

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        self::normalizeRecipientPhoneInput($this);
    }

    public static function normalizeRecipientPhoneInput(FormRequest $request): void
    {
        if ($request->exists('recipient_phone')) {
            $rawPhone = $request->input('recipient_phone');
            $normalizedPhone = is_string($rawPhone) && trim($rawPhone) !== ''
                ? UpdateProfileRequest::normalizePhilippineMobile($rawPhone)
                : null;
            $request->merge(['recipient_phone' => $normalizedPhone]);
        }
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'label' => ['required', 'string', 'max:50'],
            'recipient_name' => ['nullable', 'string', 'max:150'],
            'recipient_phone' => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'province' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'street' => ['required', 'string', 'max:255'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'building_name' => ['nullable', 'string', 'max:150'],
            'landmark' => ['nullable', 'string', 'max:500'],
            'postal_code' => ['nullable', 'regex:/^\d{4}$/'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'gps_accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'is_default' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'recipient_phone.regex' => self::RECIPIENT_PHONE_REGEX_MESSAGE,
        ];
    }
}
