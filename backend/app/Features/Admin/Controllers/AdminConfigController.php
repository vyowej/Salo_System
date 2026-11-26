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
        $config = $settings->getFeesConfig();

        return ApiResponse::success([
            'flat_delivery_fee' => $config['base_fee'],
            'flat_delivery_fee_formatted' => $config['base_fee_formatted'],
            'base_fee' => $config['base_fee'],
            'base_fee_formatted' => $config['base_fee_formatted'],
            'base_distance_km' => $config['base_distance_km'],
            'per_extra_km' => $config['per_extra_km'],
            'per_extra_km_formatted' => $config['per_extra_km_formatted'],
            'max_fee' => $config['max_fee'],
            'max_fee_formatted' => $config['max_fee_formatted'],
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
        $data = $settings->updateDeliveryFeeConfig(
            admin: $request->user(),
            input: $request->only([
                'base_fee',
                'flat_delivery_fee',
                'base_distance_km',
                'per_extra_km',
                'max_fee',
            ]),
            reason: $request->input('reason'),
            request: $request,
        );

        return ApiResponse::success($data, 'Delivery fee configuration updated successfully.');
    }

    public function platformConfig(): JsonResponse
    {
        return ApiResponse::success([
            'configurable' => false,
            'items' => [],
        ], 'No additional platform settings are configurable yet.');
    }
}
