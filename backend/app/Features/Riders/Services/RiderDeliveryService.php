<?php

namespace App\Features\Riders\Services;

use App\Features\Notifications\Services\NotificationService;
use App\Features\Orders\Support\OrderTimestampFormatter;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\Money;
use App\Support\RestaurantBranchService;
use App\Support\WorkspaceAccessResolver;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class RiderDeliveryService
{
    public function __construct(
        private readonly RiderService $riderService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
        private readonly WorkspaceAccessResolver $workspaceAccessResolver,
        private readonly FileStorageService $fileStorageService,
    ) {}

    public function requireActiveRider(User $user): object
    {
        return $this->workspaceAccessResolver->requireActiveRider($user);
    }

    /**
     * List ready, unassigned delivery orders for an active, online rider with no unfinished delivery.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listAvailable(User $user, array $filters = []): array
    {
        $rider = $this->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        if (! $this->riderService->isOnline($riderId)) {
            abort(403, 'Forbidden: go online to view available deliveries.');
        }

        if ($this->hasUnfinishedDelivery($riderId)) {
            abort(403, 'Forbidden: finish your current delivery before viewing new deliveries.');
        }

        $perPage = max(1, min(50, (int) ($filters['per_page'] ?? 15)));
        $page = max(1, (int) ($filters['page'] ?? 1));

        $baseQuery = DB::table('orders as o')
            ->leftJoin('deliveries as d', 'd.order_id', '=', 'o.order_id')
            ->where('o.order_status', 'ready')
            ->where('o.order_type', 'delivery')
            ->where(function ($sub): void {
                $sub->whereNull('d.delivery_id')
                    ->orWhere(function ($unassigned): void {
                        $unassigned->whereNull('d.rider_id')
                            ->whereIn('d.delivery_status', ['pending_assignment', 'offered']);
                    });
            });

        $total = (int) (clone $baseQuery)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));

        $rows = $baseQuery
            ->select([
                'o.order_id',
                'o.order_reference',
                'o.restaurant_id',
                'o.restaurant_name',
                'o.delivery_fee',
                'o.total_amount',
                'o.delivery_address_text',
                'o.placed_at',
            ])
            ->orderByDesc('o.placed_at')
            ->orderByDesc('o.order_id')
            ->forPage($page, $perPage)
            ->get();

        $orderIds = $rows->pluck('order_id')->map(fn ($id) => (int) $id)->all();
        $restaurantIds = $rows->pluck('restaurant_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

        $pickupAddressesByRestaurantId = $restaurantIds === []
            ? collect()
            : DB::table('restaurants as r')
                ->leftJoin('addresses as ra', 'ra.address_id', '=', 'r.address_id')
                ->leftJoin('barangays as rb', 'rb.barangay_id', '=', 'ra.barangay_id')
                ->leftJoin('cities as rc', 'rc.city_id', '=', 'rb.city_id')
                ->leftJoin('provinces as rp', 'rp.province_id', '=', 'rc.province_id')
                ->whereIn('r.restaurant_id', $restaurantIds)
                ->select([
                    'r.restaurant_id',
                    'r.restaurant_name as live_restaurant_name',
                    'r.branch_name as live_branch_name',
                    'ra.street as pickup_street',
                    'rb.barangay_name as pickup_barangay',
                    'rc.city_name as pickup_city',
                    'rp.province_name as pickup_province',
                ])
                ->get()
                ->keyBy('restaurant_id');

        $itemCounts = $orderIds === []
            ? collect()
            : DB::table('order_items')
                ->whereIn('order_id', $orderIds)
                ->selectRaw('order_id, COUNT(*) as line_count, SUM(quantity) as total_qty')
                ->groupBy('order_id')
                ->get()
                ->keyBy('order_id');

        $deliveries = $rows->map(function (object $row) use ($itemCounts, $pickupAddressesByRestaurantId): array {
            $counts = $itemCounts->get((int) $row->order_id);
            $pickupAddr = $pickupAddressesByRestaurantId->get((int) $row->restaurant_id);
            $restaurantName = $pickupAddr
                ? RestaurantBranchService::formatDisplayName((string) $pickupAddr->live_restaurant_name, $pickupAddr->live_branch_name ?? null)
                : $row->restaurant_name;

            return [
                'order_id' => (int) $row->order_id,
                'order_reference' => $row->order_reference,
                'restaurant_id' => (int) $row->restaurant_id,
                'restaurant_name' => $restaurantName,
                'item_count' => (int) ($counts->total_qty ?? $counts->line_count ?? 0),
                'delivery_fee' => (float) $row->delivery_fee,
                'order_total' => (float) $row->total_amount,
                'pickup_address_text' => $this->formatAddressText(
                    $pickupAddr?->pickup_street,
                    $pickupAddr?->pickup_barangay,
                    $pickupAddr?->pickup_city,
                    $pickupAddr?->pickup_province,
                    $restaurantName,
                ),
                'dropoff_address_text' => $row->delivery_address_text,
                'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            ];
        })->all();

        return [
            'deliveries' => $deliveries,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }

    /**
     * Return the active rider's current unfinished delivery (or null if none).
     *
     * @return array<string, mixed>|null
     */
    public function getCurrentDelivery(User $user): ?array
    {
        $rider = $this->requireActiveRider($user);

        $row = $this->baseAssignedDeliveryQuery((int) $rider->rider_id)
            ->whereIn('d.delivery_status', ['accepted', 'picked_up'])
            ->orderByDesc('d.accepted_at')
            ->first();

        return $row ? $this->formatAssignedDelivery($row) : null;
    }

    /**
     * Accept a ready, unassigned delivery order (first rider wins).
     *
     * @return array<string, mixed>
     */
    public function acceptDelivery(User $user, int $orderId, Request $request): array
    {
        $rider = $this->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        if (! $this->riderService->isOnline($riderId)) {
            abort(403, 'Forbidden: go online before accepting a delivery.');
        }

        DB::transaction(function () use ($user, $riderId, $orderId, $request): void {
            $order = DB::table('orders')
                ->where('order_id', $orderId)
                ->lockForUpdate()
                ->first();

            if (! $order) {
                throw new NotFoundHttpException('Order not found.');
            }

            if ((int) $order->customer_id === (int) $user->user_id) {
                abort(403, 'Forbidden: riders cannot accept their own orders.');
            }

            $isOwner = DB::table('restaurant_owners')
                ->where('restaurant_id', $order->restaurant_id)
                ->where('user_id', $user->user_id)
                ->exists();
            $isStaff = DB::table('restaurant_staff')
                ->where('restaurant_id', $order->restaurant_id)
                ->where('user_id', $user->user_id)
                ->where('staff_status', 'active')
                ->exists();

            if ($isOwner || $isStaff) {
                abort(403, 'Forbidden: riders cannot accept deliveries from a restaurant they own or work at.');
            }

            if ($this->hasUnfinishedDelivery($riderId)) {
                throw new ConflictHttpException('You already have an unfinished delivery.');
            }

            if ($order->order_type !== 'delivery' || $order->order_status !== 'ready') {
                throw new ConflictHttpException('Order is not ready for delivery assignment.');
            }

            $existing = DB::table('deliveries')
                ->where('order_id', $orderId)
                ->lockForUpdate()
                ->first();

            if ($existing) {
                if (
                    $existing->rider_id !== null
                    || ! in_array($existing->delivery_status, ['pending_assignment', 'offered'], true)
                ) {
                    throw new ConflictHttpException('This delivery has already been assigned to another rider.');
                }

                $now = now();
                $previousStatus = (string) $existing->delivery_status;
                DB::table('deliveries')
                    ->where('delivery_id', $existing->delivery_id)
                    ->update([
                        'rider_id' => $riderId,
                        'delivery_status' => 'accepted',
                        'assigned_at' => $existing->assigned_at ?? $now,
                        'accepted_at' => $now,
                        'updated_at' => $now,
                    ]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'rider_delivery_accepted',
                    entityType: 'deliveries',
                    entityId: (int) $existing->delivery_id,
                    oldValues: ['delivery_status' => $previousStatus],
                    newValues: ['delivery_status' => 'accepted', 'order_id' => $orderId, 'rider_id' => $riderId],
                    request: $request,
                );

                $this->notifyDeliveryAssigned($order, $user);

                return;
            }

            $now = now();
            try {
                $deliveryId = (int) DB::table('deliveries')->insertGetId([
                    'order_id' => $orderId,
                    'rider_id' => $riderId,
                    'delivery_status' => 'accepted',
                    'assigned_at' => $now,
                    'accepted_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } catch (QueryException $e) {
                if ($this->isDuplicateKeyException($e)) {
                    throw new ConflictHttpException('This delivery has already been assigned to another rider.');
                }
                throw $e;
            }

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_delivery_accepted',
                entityType: 'deliveries',
                entityId: $deliveryId,
                oldValues: ['delivery_status' => null],
                newValues: ['delivery_status' => 'accepted', 'order_id' => $orderId, 'rider_id' => $riderId],
                request: $request,
            );

            $this->notifyDeliveryAssigned($order, $user);
        });

        $row = $this->baseAssignedDeliveryQuery($riderId)
            ->where('d.order_id', $orderId)
            ->first();

        return $this->formatAssignedDelivery($row);
    }

    /**
     * Mark an accepted delivery as picked up (order_status -> out_for_delivery).
     *
     * @return array<string, mixed>
     */
    public function markPickedUp(User $user, int $orderId, Request $request): array
    {
        $rider = $this->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        DB::transaction(function () use ($user, $riderId, $orderId, $request): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();

            if (! $order || ! $delivery || (int) $delivery->rider_id !== $riderId) {
                throw new NotFoundHttpException('Delivery not found.');
            }

            if ($delivery->delivery_status !== 'accepted' || $order->order_status !== 'ready') {
                throw new ConflictHttpException(
                    "Cannot mark picked up from delivery status '{$delivery->delivery_status}' and order status '{$order->order_status}'."
                );
            }

            $now = now();
            DB::table('deliveries')
                ->where('delivery_id', $delivery->delivery_id)
                ->update([
                    'delivery_status' => 'picked_up',
                    'picked_up_at' => $now,
                    'updated_at' => $now,
                ]);

            DB::table('orders')
                ->where('order_id', $orderId)
                ->update([
                    'order_status' => 'out_for_delivery',
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_delivery_picked_up',
                entityType: 'deliveries',
                entityId: (int) $delivery->delivery_id,
                oldValues: ['delivery_status' => 'accepted', 'order_status' => 'ready'],
                newValues: ['delivery_status' => 'picked_up', 'order_status' => 'out_for_delivery'],
                request: $request,
            );

            $riderFirstName = trim((string) ($user->first_name ?? '')) ?: 'Your rider';
            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'order_out_for_delivery',
                title: "Order {$order->order_reference} is out for delivery",
                body: "{$riderFirstName} picked up your order from {$order->restaurant_name} and is on the way.",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );
        });

        $row = $this->baseAssignedDeliveryQuery($riderId)->where('d.order_id', $orderId)->first();

        return $this->formatAssignedDelivery($row);
    }

    /**
     * Mark an out_for_delivery order as delivered, capture POD metadata, and record COD collection.
     *
     * @param  array<string, mixed>  $pod
     * @return array<string, mixed>
     */
    public function markDelivered(User $user, int $orderId, mixed $collectedAmount, Request $request, array $pod = []): array
    {
        $rider = $this->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $recipientName = isset($pod['recipient_name']) ? trim((string) $pod['recipient_name']) : null;
        if ($recipientName === '') {
            $recipientName = null;
        }
        if ($recipientName !== null && mb_strlen($recipientName) > 150) {
            throw ValidationException::withMessages([
                'recipient_name' => ['Recipient name must not exceed 150 characters.'],
            ]);
        }

        $deliveryNotes = isset($pod['delivery_notes']) ? trim((string) $pod['delivery_notes']) : null;
        if ($deliveryNotes === '') {
            $deliveryNotes = null;
        }
        if ($deliveryNotes !== null && mb_strlen($deliveryNotes) > 1000) {
            throw ValidationException::withMessages([
                'delivery_notes' => ['Delivery notes must not exceed 1000 characters.'],
            ]);
        }

        $proofLat = isset($pod['proof_latitude']) && is_numeric($pod['proof_latitude'])
            ? (float) $pod['proof_latitude']
            : null;
        $proofLng = isset($pod['proof_longitude']) && is_numeric($pod['proof_longitude'])
            ? (float) $pod['proof_longitude']
            : null;

        $storedProofPath = null;
        $proofPhoto = $pod['proof_photo'] ?? null;
        if ($proofPhoto instanceof UploadedFile) {
            $stored = $this->fileStorageService->storePrivateDocument(
                file: $proofPhoto,
                directory: "deliveries/{$orderId}/proof",
                fieldName: 'proof_photo',
            );
            $storedProofPath = $stored['path'];
        }

        try {
            DB::transaction(function () use (
                $user,
                $riderId,
                $orderId,
                $collectedAmount,
                $request,
                $recipientName,
                $deliveryNotes,
                $proofLat,
                $proofLng,
                $storedProofPath,
            ): void {
                $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
                $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();

                if (! $order || ! $delivery || (int) $delivery->rider_id !== $riderId) {
                    throw new NotFoundHttpException('Delivery not found.');
                }

                if ($delivery->delivery_status !== 'picked_up' || $order->order_status !== 'out_for_delivery') {
                    throw new ConflictHttpException(
                        "Cannot mark delivered from delivery status '{$delivery->delivery_status}' and order status '{$order->order_status}'."
                    );
                }

                $payment = DB::table('payment_allocations as pa')
                    ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
                    ->where('pa.order_id', $orderId)
                    ->where('pa.allocation_type', 'order_payment')
                    ->lockForUpdate()
                    ->select(['p.payment_id', 'p.payment_method', 'p.payment_status', 'p.amount'])
                    ->first();

                $now = now();
                $deliveryUpdates = [
                    'delivery_status' => 'delivered',
                    'delivered_at' => $now,
                    'updated_at' => $now,
                ];
                if ($recipientName !== null) {
                    $deliveryUpdates['recipient_name'] = $recipientName;
                }
                if ($deliveryNotes !== null) {
                    $deliveryUpdates['delivery_notes'] = $deliveryNotes;
                }
                if ($storedProofPath !== null) {
                    $deliveryUpdates['proof_photo'] = $storedProofPath;
                }
                if ($proofLat !== null && $proofLng !== null) {
                    $deliveryUpdates['proof_latitude'] = $proofLat;
                    $deliveryUpdates['proof_longitude'] = $proofLng;
                }
                if ($storedProofPath !== null || $recipientName !== null) {
                    $deliveryUpdates['proof_captured_at'] = $now;
                }

                $oldAudit = ['delivery_status' => 'picked_up', 'order_status' => 'out_for_delivery'];
                $newAudit = ['delivery_status' => 'delivered', 'order_status' => 'delivered'];
                if ($recipientName !== null) {
                    $newAudit['recipient_name'] = $recipientName;
                }
                if ($storedProofPath !== null) {
                    $newAudit['has_proof_photo'] = true;
                }

                if ($payment && $payment->payment_method === 'cash' && $payment->payment_status === 'pending') {
                    if ($collectedAmount === null || $collectedAmount === '' || ! is_numeric($collectedAmount)) {
                        throw ValidationException::withMessages([
                            'collected_amount' => ['The exact COD collected amount is required.'],
                        ]);
                    }

                    $expectedCents = Money::parseStrictCents((string) $payment->amount);
                    $receivedCents = Money::parseStrictCents((string) $collectedAmount);
                    if ($receivedCents <= 0 || $receivedCents !== $expectedCents) {
                        throw ValidationException::withMessages([
                            'collected_amount' => [
                                'Collected amount must exactly match the COD payment amount ('
                                .number_format((float) $payment->amount, 2, '.', '')
                                .').',
                            ],
                        ]);
                    }

                    $deliveryUpdates['cod_amount_collected'] = $payment->amount;
                    $deliveryUpdates['cod_collected_at'] = $now;
                    $deliveryUpdates['cod_remittance_status'] = 'pending';

                    DB::table('payments')
                        ->where('payment_id', $payment->payment_id)
                        ->where('payment_method', 'cash')
                        ->where('payment_status', 'pending')
                        ->update([
                            'payment_status' => 'paid',
                            'paid_at' => $now,
                            'updated_at' => $now,
                        ]);

                    $oldAudit['payment_status'] = 'pending';
                    $newAudit['payment_status'] = 'paid';
                }

                DB::table('deliveries')
                    ->where('delivery_id', $delivery->delivery_id)
                    ->update($deliveryUpdates);

                DB::table('orders')
                    ->where('order_id', $orderId)
                    ->update([
                        'order_status' => 'delivered',
                        'updated_at' => $now,
                    ]);

                $this->auditLogService->record(
                    actorUserId: (int) $user->user_id,
                    action: 'rider_delivery_delivered',
                    entityType: 'deliveries',
                    entityId: (int) $delivery->delivery_id,
                    oldValues: $oldAudit,
                    newValues: $newAudit,
                    request: $request,
                );

                $riderFirstName = trim((string) ($user->first_name ?? '')) ?: 'Your rider';
                $this->notificationService->notifyUser(
                    userId: (int) $order->customer_id,
                    workspace: 'customer',
                    type: 'order_delivered',
                    title: "Order {$order->order_reference} delivered",
                    body: "Your order from {$order->restaurant_name} has been delivered by {$riderFirstName}.",
                    relatedEntityType: 'order',
                    relatedEntityId: $orderId,
                );
            });
        } catch (\Throwable $e) {
            if ($storedProofPath !== null) {
                $this->fileStorageService->cleanupStoredPaths(privatePaths: [$storedProofPath]);
            }
            throw $e;
        }

        $row = $this->baseAssignedDeliveryQuery($riderId)->where('d.order_id', $orderId)->first();

        return $this->formatAssignedDelivery($row);
    }

    /**
     * Report a delivery as failed (from accepted or picked_up state) with a mandatory failure reason.
     *
     * @return array<string, mixed>
     */
    public function markFailed(
        User $user,
        int $orderId,
        string $failureReason,
        ?string $deliveryNotes,
        Request $request,
    ): array {
        $rider = $this->requireActiveRider($user);
        $riderId = (int) $rider->rider_id;

        $trimmedReason = trim($failureReason);
        if (mb_strlen($trimmedReason) < 5 || mb_strlen($trimmedReason) > 255) {
            throw ValidationException::withMessages([
                'failure_reason' => ['Failure reason must be between 5 and 255 characters.'],
            ]);
        }

        $trimmedNotes = $deliveryNotes !== null ? trim($deliveryNotes) : null;
        if ($trimmedNotes === '') {
            $trimmedNotes = null;
        }
        if ($trimmedNotes !== null && mb_strlen($trimmedNotes) > 1000) {
            throw ValidationException::withMessages([
                'delivery_notes' => ['Delivery notes must not exceed 1000 characters.'],
            ]);
        }

        DB::transaction(function () use ($user, $riderId, $orderId, $trimmedReason, $trimmedNotes, $request): void {
            $order = DB::table('orders')->where('order_id', $orderId)->lockForUpdate()->first();
            $delivery = DB::table('deliveries')->where('order_id', $orderId)->lockForUpdate()->first();

            if (! $order || ! $delivery || (int) $delivery->rider_id !== $riderId) {
                throw new NotFoundHttpException('Delivery not found.');
            }

            if (! in_array($delivery->delivery_status, ['accepted', 'picked_up'], true)
                || ! in_array($order->order_status, ['ready', 'out_for_delivery'], true)) {
                throw new ConflictHttpException(
                    "Cannot mark failed from delivery status '{$delivery->delivery_status}' and order status '{$order->order_status}'."
                );
            }

            $now = now();
            $oldDeliveryStatus = (string) $delivery->delivery_status;
            $oldOrderStatus = (string) $order->order_status;

            $deliveryUpdates = [
                'delivery_status' => 'failed',
                'failed_at' => $now,
                'failure_reason' => $trimmedReason,
                'cod_remittance_status' => 'not_applicable',
                'updated_at' => $now,
            ];
            if ($trimmedNotes !== null) {
                $deliveryUpdates['delivery_notes'] = $trimmedNotes;
            }

            DB::table('deliveries')
                ->where('delivery_id', $delivery->delivery_id)
                ->update($deliveryUpdates);

            DB::table('orders')
                ->where('order_id', $orderId)
                ->update([
                    'order_status' => 'failed',
                    'updated_at' => $now,
                ]);

            $this->auditLogService->record(
                actorUserId: (int) $user->user_id,
                action: 'rider_delivery_failed',
                entityType: 'deliveries',
                entityId: (int) $delivery->delivery_id,
                oldValues: ['delivery_status' => $oldDeliveryStatus, 'order_status' => $oldOrderStatus],
                newValues: [
                    'delivery_status' => 'failed',
                    'order_status' => 'failed',
                    'failure_reason' => $trimmedReason,
                ],
                reason: $trimmedReason,
                request: $request,
            );

            $this->notificationService->notifyUser(
                userId: (int) $order->customer_id,
                workspace: 'customer',
                type: 'order_delivery_failed',
                title: "Delivery failed for {$order->order_reference}",
                body: "Your delivery could not be completed: {$trimmedReason}",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );

            $recipientIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $order->restaurant_id);
            $this->notificationService->notifyUsers(
                userIds: $recipientIds,
                workspace: 'restaurant',
                type: 'order_delivery_failed',
                title: "Delivery failed for {$order->order_reference}",
                body: "Rider reported a failed delivery: {$trimmedReason}",
                relatedEntityType: 'order',
                relatedEntityId: $orderId,
            );
        });

        $row = $this->baseAssignedDeliveryQuery($riderId)->where('d.order_id', $orderId)->first();

        return $this->formatAssignedDelivery($row);
    }

    public function streamProofPhoto(User $user, int $orderId): StreamedResponse
    {
        $rider = $this->requireActiveRider($user);
        $delivery = DB::table('deliveries')
            ->where('order_id', $orderId)
            ->where('rider_id', (int) $rider->rider_id)
            ->first(['proof_photo']);

        if (! $delivery || empty($delivery->proof_photo)) {
            throw new NotFoundHttpException('Proof of delivery photo not found.');
        }

        $path = (string) $delivery->proof_photo;
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        return $this->fileStorageService->streamPrivateFile($path, basename($path), $mime);
    }

    private function notifyDeliveryAssigned(object $order, User $riderUser): void
    {
        $riderFirstName = trim((string) ($riderUser->first_name ?? '')) ?: 'A rider';
        $orderId = (int) $order->order_id;
        $orderRef = (string) $order->order_reference;
        $restaurantName = (string) $order->restaurant_name;

        $this->notificationService->notifyUser(
            userId: (int) $order->customer_id,
            workspace: 'customer',
            type: 'delivery_rider_assigned',
            title: "Rider assigned to {$orderRef}",
            body: "{$riderFirstName} accepted your delivery from {$restaurantName}.",
            relatedEntityType: 'order',
            relatedEntityId: $orderId,
        );

        $recipientIds = $this->notificationService->resolveRestaurantOrderHandlerUserIds((int) $order->restaurant_id);
        $this->notificationService->notifyUsers(
            userIds: $recipientIds,
            workspace: 'restaurant',
            type: 'delivery_rider_assigned',
            title: "Rider assigned to {$orderRef}",
            body: "{$riderFirstName} accepted delivery for order {$orderRef}.",
            relatedEntityType: 'order',
            relatedEntityId: $orderId,
        );
    }

    private function hasUnfinishedDelivery(int $riderId): bool
    {
        return DB::table('deliveries')
            ->where('rider_id', $riderId)
            ->whereIn('delivery_status', ['accepted', 'picked_up'])
            ->exists();
    }

    private function baseAssignedDeliveryQuery(int $riderId)
    {
        return DB::table('deliveries as d')
            ->join('orders as o', 'o.order_id', '=', 'd.order_id')
            ->join('restaurants as r', 'r.restaurant_id', '=', 'o.restaurant_id')
            ->leftJoin('addresses as ra', 'ra.address_id', '=', 'r.address_id')
            ->leftJoin('barangays as rb', 'rb.barangay_id', '=', 'ra.barangay_id')
            ->leftJoin('cities as rc', 'rc.city_id', '=', 'rb.city_id')
            ->leftJoin('provinces as rp', 'rp.province_id', '=', 'rc.province_id')
            ->leftJoin('users as cu', 'cu.user_id', '=', 'o.customer_id')
            ->where('d.rider_id', $riderId)
            ->select([
                'd.delivery_id',
                'd.order_id',
                'd.rider_id',
                'd.delivery_status',
                'd.cod_amount_collected',
                'd.cod_collected_at',
                'd.cod_remittance_status',
                'd.assigned_at',
                'd.accepted_at',
                'd.picked_up_at',
                'd.delivered_at',
                'd.failed_at',
                'd.failure_reason',
                'd.proof_photo',
                'd.recipient_name',
                'd.proof_captured_at',
                'd.delivery_notes as proof_delivery_notes',
                'o.order_reference',
                'o.order_status',
                'o.order_type',
                'o.restaurant_id',
                'r.restaurant_name',
                'r.branch_name',
                'o.customer_name',
                'o.delivery_phone',
                'cu.phone_number as customer_phone',
                'o.delivery_recipient_name',
                'o.delivery_address_text',
                'o.delivery_notes',
                'o.subtotal_amount',
                'o.delivery_fee',
                'o.total_amount',
                'o.placed_at',
                'ra.street as pickup_street',
                'rb.barangay_name as pickup_barangay',
                'rc.city_name as pickup_city',
                'rp.province_name as pickup_province',
            ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatAssignedDelivery(object $row): array
    {
        $orderId = (int) $row->order_id;
        $items = DB::table('order_items')
            ->where('order_id', $orderId)
            ->orderBy('order_item_id')
            ->get(['order_item_id', 'item_name', 'quantity', 'unit_price', 'line_total'])
            ->map(fn ($it) => [
                'order_item_id' => (int) $it->order_item_id,
                'item_name' => $it->item_name,
                'quantity' => (int) $it->quantity,
                'unit_price' => (float) $it->unit_price,
                'line_total' => (float) $it->line_total,
            ])
            ->values()
            ->all();

        $payment = DB::table('payment_allocations as pa')
            ->join('payments as p', 'p.payment_id', '=', 'pa.payment_id')
            ->where('pa.order_id', $orderId)
            ->where('pa.allocation_type', 'order_payment')
            ->select(['p.payment_method', 'p.payment_status', 'p.amount', 'p.paid_at'])
            ->first();

        $paymentMethod = $payment?->payment_method === 'cash' ? 'cod' : ($payment?->payment_method ?? 'cod');
        $paymentStatus = $payment?->payment_status ?? 'pending';
        $requiresCod = $payment?->payment_method === 'cash' && $paymentStatus === 'pending';

        $restaurantDisplayName = RestaurantBranchService::formatDisplayName((string) $row->restaurant_name, $row->branch_name ?? null);

        return [
            'delivery_id' => (int) $row->delivery_id,
            'order_id' => $orderId,
            'order_reference' => $row->order_reference,
            'order_status' => $row->order_status,
            'delivery_status' => $row->delivery_status,
            'restaurant_id' => (int) $row->restaurant_id,
            'restaurant_name' => $restaurantDisplayName,
            'pickup_address_text' => $this->formatAddressText(
                $row->pickup_street,
                $row->pickup_barangay,
                $row->pickup_city,
                $row->pickup_province,
                $restaurantDisplayName,
            ),
            'dropoff_address_text' => $row->delivery_address_text,
            'delivery_notes' => $row->delivery_notes,
            'customer_name' => $row->delivery_recipient_name ?: $row->customer_name,
            'customer_phone' => $row->delivery_phone ?: $row->customer_phone,
            'subtotal_amount' => (float) $row->subtotal_amount,
            'delivery_fee' => (float) $row->delivery_fee,
            'order_total' => (float) $row->total_amount,
            'payment_method' => $paymentMethod,
            'payment_status' => $paymentStatus,
            'requires_cod_collection' => $requiresCod,
            'amount_to_collect' => $requiresCod ? (float) $payment->amount : 0.0,
            'cod_amount_collected' => $row->cod_amount_collected !== null ? (float) $row->cod_amount_collected : null,
            'cod_collected_at' => OrderTimestampFormatter::toManilaIso($row->cod_collected_at),
            'cod_remittance_status' => $row->cod_remittance_status,
            'paid_at' => OrderTimestampFormatter::toManilaIso($payment?->paid_at),
            'assigned_at' => OrderTimestampFormatter::toManilaIso($row->assigned_at),
            'accepted_at' => OrderTimestampFormatter::toManilaIso($row->accepted_at),
            'picked_up_at' => OrderTimestampFormatter::toManilaIso($row->picked_up_at),
            'delivered_at' => OrderTimestampFormatter::toManilaIso($row->delivered_at),
            'failed_at' => OrderTimestampFormatter::toManilaIso($row->failed_at ?? null),
            'failure_reason' => $row->failure_reason ?? null,
            'has_proof_photo' => ! empty($row->proof_photo),
            'recipient_name' => $row->recipient_name ?? null,
            'proof_captured_at' => OrderTimestampFormatter::toManilaIso($row->proof_captured_at ?? null),
            'proof_delivery_notes' => $row->proof_delivery_notes ?? null,
            'placed_at' => OrderTimestampFormatter::toManilaIso($row->placed_at),
            'items' => $items,
        ];
    }

    private function formatAddressText(
        ?string $street,
        ?string $barangay,
        ?string $city,
        ?string $province,
        string $fallback,
    ): string {
        $parts = array_values(array_filter([
            $street ? trim($street) : null,
            $barangay ? trim($barangay) : null,
            $city ? trim($city) : null,
            $province ? trim($province) : null,
        ], static fn (?string $p): bool => $p !== null && $p !== ''));

        return $parts !== [] ? implode(', ', $parts) : $fallback;
    }

    private function isDuplicateKeyException(QueryException $e): bool
    {
        $sqlState = $e->errorInfo[0] ?? null;
        $driverCode = $e->errorInfo[1] ?? null;

        return $sqlState === '23000' && (int) $driverCode === 1062;
    }
}
