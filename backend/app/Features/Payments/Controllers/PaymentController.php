<?php

namespace App\Features\Payments\Controllers;

use App\Features\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentService $paymentService,
    ) {}

    public function show(Request $request, int $paymentId): JsonResponse
    {
        return ApiResponse::success(
            data: ['payment' => $this->paymentService->getCustomerPayment($request->user(), $paymentId)],
            message: 'Payment retrieved.',
        );
    }

    public function initiate(Request $request, int $paymentId): JsonResponse
    {
        return ApiResponse::success(
            data: [
                'payment' => $this->paymentService->initiateProviderPayment(
                    paymentId: $paymentId,
                    context: ['payer_email' => $request->user()?->email],
                    customer: $request->user(),
                ),
            ],
            message: 'Payment initiated.',
        );
    }

    public function confirm(Request $request, int $paymentId): JsonResponse
    {
        $this->paymentService->assertSandboxEndpointAllowed();

        $validated = $request->validate([
            'provider_reference' => ['nullable', 'string', 'max:100'],
        ]);

        return ApiResponse::success(
            data: [
                'payment' => $this->paymentService->confirmOnlinePayment(
                    paymentId: $paymentId,
                    customer: $request->user(),
                    providerReference: $validated['provider_reference'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Payment confirmed.',
        );
    }

    public function fail(Request $request, int $paymentId): JsonResponse
    {
        $this->paymentService->assertSandboxEndpointAllowed();

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        return ApiResponse::success(
            data: [
                'payment' => $this->paymentService->failOnlinePayment(
                    paymentId: $paymentId,
                    customer: $request->user(),
                    reason: $validated['reason'] ?? null,
                    request: $request,
                ),
            ],
            message: 'Payment marked as failed.',
        );
    }

    public function webhook(Request $request): JsonResponse
    {
        $this->paymentService->assertSandboxEndpointAllowed();

        $validated = $request->validate([
            'payment_id' => ['required', 'integer', 'min:1'],
            'status' => ['required', 'string', 'in:paid,failed'],
            'provider_reference' => ['nullable', 'string', 'max:100'],
            'event_key' => ['nullable', 'string', 'max:191'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $payment = $validated['status'] === 'paid'
            ? $this->paymentService->confirmOnlinePayment(
                paymentId: (int) $validated['payment_id'],
                customer: null,
                providerReference: $validated['provider_reference'] ?? null,
                eventKey: $validated['event_key'] ?? null,
                request: $request,
            )
            : $this->paymentService->failOnlinePayment(
                paymentId: (int) $validated['payment_id'],
                customer: null,
                reason: $validated['reason'] ?? null,
                eventKey: $validated['event_key'] ?? null,
                request: $request,
            );

        return ApiResponse::success(
            data: ['payment' => $payment],
            message: 'Webhook processed.',
        );
    }

    public function xenditWebhook(Request $request): JsonResponse
    {
        $payment = $this->paymentService->handleXenditWebhook($request);

        return ApiResponse::success(
            data: ['payment' => $payment],
            message: 'Xendit webhook processed.',
        );
    }
}
