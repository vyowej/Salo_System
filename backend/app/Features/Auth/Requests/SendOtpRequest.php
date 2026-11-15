<?php

namespace App\Features\Auth\Requests;

use App\Features\Auth\Services\OtpService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SendOtpRequest extends FormRequest
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
            'email' => ['required', 'string', 'email', 'max:255'],
            'purpose' => ['required', 'string', Rule::in(OtpService::PURPOSES)],
        ];
    }
}
