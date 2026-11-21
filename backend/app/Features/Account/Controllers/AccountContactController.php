<?php

namespace App\Features\Account\Controllers;

use App\Features\Account\Services\AccountContactService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountContactController extends Controller
{
    private const PH_MOBILE_REGEX = '/^(\+63|0)9\d{9}$/';

    public function __construct(
        private readonly AccountContactService $accountContactService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            data: ['contact_numbers' => $this->accountContactService->list($request->user())],
            message: 'Contact numbers retrieved.',
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeInput($request);

        $validated = $request->validate([
            'label' => ['sometimes', 'required', 'string', 'max:40'],
            'phone_number' => ['required', 'string', 'regex:'.self::PH_MOBILE_REGEX],
            'is_default' => ['sometimes', 'boolean'],
        ], [
            'phone_number.regex' => 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).',
        ]);

        $contact = $this->accountContactService->create($request->user(), $validated);

        return ApiResponse::success(
            data: ['contact_number' => $contact],
            message: 'Contact number saved.',
            status: 201,
        );
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->normalizeInput($request);

        $validated = $request->validate([
            'label' => ['sometimes', 'required', 'string', 'max:40'],
            'phone_number' => ['sometimes', 'required', 'string', 'regex:'.self::PH_MOBILE_REGEX],
            'is_default' => ['sometimes', 'boolean'],
        ], [
            'phone_number.regex' => 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).',
        ]);

        $contact = $this->accountContactService->update($request->user(), $id, $validated);

        return ApiResponse::success(
            data: ['contact_number' => $contact],
            message: 'Contact number updated.',
        );
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];
        if ($request->has('phone_number') && is_string($request->input('phone_number'))) {
            $merge['phone_number'] = preg_replace('/[\s\-().]+/', '', trim($request->input('phone_number'))) ?? '';
        }
        if ($request->has('label') && is_string($request->input('label'))) {
            $merge['label'] = trim($request->input('label'));
        }
        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    public function setDefault(Request $request, int $id): JsonResponse
    {
        $contact = $this->accountContactService->setDefault($request->user(), $id);

        return ApiResponse::success(
            data: ['contact_number' => $contact],
            message: 'Default contact number updated.',
        );
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->accountContactService->delete($request->user(), $id);

        return ApiResponse::success(
            data: null,
            message: 'Contact number deleted.',
        );
    }
}
