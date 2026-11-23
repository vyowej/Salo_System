<?php

namespace App\Features\Admin\Controllers;

use App\Features\Reviews\Services\PlatformSettingsService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminConfigController extends Controller
{
    public function publicDeliveryFee(PlatformSettingsService $settings): JsonResponse
    {
        $fee = $settings->getFlatDeliveryFee();

        return ApiResponse::success([
            'flat_delivery_fee' => (float) $fee,
            'flat_delivery_fee_formatted' => $fee,
        ], 'Delivery fee retrieved successfully.');
    }

    public function fees(PlatformSettingsService $settings): JsonResponse
    {
        return ApiResponse::success(
            $settings->getFeesConfig(),
            'Fee configuration retrieved successfully.',
        );
    }

    public function updateFees(Request $request, PlatformSettingsService $settings): JsonResponse
    {
        $data = $settings->updateFlatDeliveryFee(
            admin: $request->user(),
            rawFee: $request->input('flat_delivery_fee'),
            reason: $request->input('reason'),
            request: $request,
        );

        return ApiResponse::success($data, 'Flat delivery fee updated successfully.');
    }

    public function platformConfig(): JsonResponse
    {
        return ApiResponse::success([
            'configurable' => false,
            'items' => [],
        ], 'No additional platform settings are configurable yet.');
    }
}
