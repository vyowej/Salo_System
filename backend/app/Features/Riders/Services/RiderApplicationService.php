<?php

namespace App\Features\Riders\Services;

use App\Features\Auth\Services\OtpService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Riders\Requests\SubmitRiderApplicationRequest;
use App\Models\User;
use App\Support\AddressService;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use App\Support\Storage\StoragePurpose;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RiderApplicationService
{
    public function __construct(
        private readonly OtpService $otpService,
        private readonly AddressService $addressService,
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Submit a new rider application with documents in a single DB transaction.
     *
     * @param  array<string, mixed>  $validated
     * @param  array<string, UploadedFile>  $documentFiles
     * @return array<string, mixed>
     */
    public function submit(User $user, array $validated, array $documentFiles, Request $request): array
    {
        [$contactEmail, $verifiedAt, $vehicleType] = $this->validateSubmissionPreconditions($user, $validated, $documentFiles);

        $storedPrivatePaths = [];

        try {
            $result = DB::transaction(function () use ($user, $validated, $documentFiles, $contactEmail, $verifiedAt, $vehicleType, $request, &$storedPrivatePaths): array {
                $addressId = $this->addressService->createAddress([
                    'province' => $validated['province'],
                    'city' => $validated['city'],
                    'barangay' => $validated['barangay'],
                    'street' => $validated['street'] ?? null,
                    'house_number' => $validated['house_number'] ?? null,
                    'building_name' => $validated['building_name'] ?? null,
                    'landmark' => $validated['landmark'] ?? null,
                    'postal_code' => $validated['postal_code'] ?? null,
                ]);

                $baseCityId = $this->addressService->resolveCityIdByName(
                    (string) $validated['base_city'],
                    $validated['base_province'] ?? $validated['province'],
                );

                $riderId = $this->upsertRiderRecord($user, $validated, $vehicleType, $baseCityId);
                $now = now();
                [$applicationId, $referenceNumber] = $this->createApplicationRecord(
                    $user,
                    $riderId,
                    $addressId,
                    $validated,
                    $contactEmail,
                    $verifiedAt,
                    $now,
                );

                $this->storeApplicationDocuments($user, $applicationId, $documentFiles, $now, $storedPrivatePaths);
                $this->upsertPayoutAccount($riderId, $validated, $now);
                $this->recordSubmissionAuditAndNotify($user, $applicationId, $referenceNumber, $vehicleType, $request);

                return $this->getApplicationById($applicationId);
            });
        } catch (\Throwable $e) {
            $this->fileStorageService->cleanupStoredPaths([], $storedPrivatePaths);
            throw $e;
        }

        $this->otpService->forgetVerified($contactEmail, 'rider_application', (int) $user->user_id);

        return $result;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @param  array<string, UploadedFile>  $documentFiles
     * @return array{string, \Carbon\Carbon, string}
     */
    private function validateSubmissionPreconditions(User $user, array $validated, array $documentFiles): array
    {
        $existingActive = DB::table('rider_applications')
            ->where('applicant_user_id', $user->user_id)
            ->whereIn('application_status', ['submitted', 'pending_review', 'under_review', 'additional_documents_required', 'needs_correction', 'resubmitted', 'approved'])
            ->first();

        if ($existingActive) {
            throw new HttpResponseException(response()->json([
                'success' => false,
                'code' => 'ACTIVE_APPLICATION_EXISTS',
                'message' => "You already have an active or approved rider application ({$existingActive->reference_number}).",
                'data' => [
                    'rider_application_id' => (int) $existingActive->rider_application_id,
                    'application_id' => (int) $existingActive->rider_application_id,
                    'application_status' => (string) $existingActive->application_status,
                ],
            ], 409));
        }

        $contactEmail = strtolower(trim((string) $validated['contact_email']));
        $verifiedAt = $this->otpService->assertVerified($contactEmail, 'rider_application', (int) $user->user_id);

        $vehicleType = (string) $validated['vehicle_type'];
        $ownership = $validated['vehicle_ownership'] ?? null;

        if ($vehicleType !== 'walking' && $ownership && $ownership !== 'personally_owned') {
            if (empty($validated['vehicle_owner_name']) || empty($validated['vehicle_owner_relationship'])) {
                throw ValidationException::withMessages([
                    'vehicle_owner_name' => ['Registered owner name and relationship are required for non-personally owned vehicles.'],
                ]);
            }
        }

        $this->validateDocumentCodes($documentFiles, $vehicleType);

        return [$contactEmail, $verifiedAt, $vehicleType];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function upsertRiderRecord(User $user, array $validated, string $vehicleType, int $baseCityId): int
    {
        $isWalking = $vehicleType === 'walking';
        $ownership = $validated['vehicle_ownership'] ?? null;
        $hideOwner = $isWalking || $ownership === 'personally_owned';

        $riderData = [
            'vehicle_type' => $vehicleType,
            'vehicle_brand' => $isWalking ? null : ($validated['vehicle_brand'] ?? null),
            'vehicle_model' => $isWalking ? null : ($validated['vehicle_model'] ?? null),
            'vehicle_color' => $isWalking ? null : ($validated['vehicle_color'] ?? null),
            'vehicle_year' => $isWalking ? null : ($validated['vehicle_year'] ?? null),
            'plate_number' => $isWalking || empty($validated['plate_number']) ? null : strtoupper(trim((string) $validated['plate_number'])),
            'mv_file_number' => $isWalking ? null : ($validated['mv_file_number'] ?? null),
            'vehicle_ownership' => $isWalking ? null : $ownership,
            'vehicle_owner_name' => $hideOwner ? null : ($validated['vehicle_owner_name'] ?? null),
            'vehicle_owner_relationship' => $hideOwner ? null : ($validated['vehicle_owner_relationship'] ?? null),
            'bicycle_type' => $vehicleType === 'bicycle' ? ($validated['bicycle_type'] ?? null) : null,
            'motor_wattage' => in_array($vehicleType, ['e_bike', 'e_scooter'], true) ? ($validated['motor_wattage'] ?? null) : null,
            'emergency_contact_name' => trim((string) $validated['emergency_contact_name']),
            'emergency_contact_relationship' => (string) $validated['emergency_contact_relationship'],
            'emergency_contact_phone' => trim((string) $validated['emergency_contact_phone']),
            'emergency_contact_alt_phone' => ! empty($validated['emergency_contact_alt_phone']) ? trim((string) $validated['emergency_contact_alt_phone']) : null,
            'base_city_id' => $baseCityId,
            'preferred_hubs' => $validated['preferred_hubs'] ?? null,
            'preferred_shifts' => ! empty($validated['preferred_shifts']) ? implode(',', $validated['preferred_shifts']) : null,
            'available_days' => ! empty($validated['available_days']) ? implode(',', $validated['available_days']) : null,
            'rider_status' => 'pending',
            'approved_at' => null,
            'updated_at' => now(),
        ];

        $existingRiderId = DB::table('riders')->where('user_id', $user->user_id)->value('rider_id');
        if ($existingRiderId) {
            DB::table('riders')->where('rider_id', $existingRiderId)->update($riderData);

            return (int) $existingRiderId;
        }

        $riderData['user_id'] = $user->user_id;
        $riderData['created_at'] = now();

        return (int) DB::table('riders')->insertGetId($riderData);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{int, string}
     */
    private function createApplicationRecord(
        User $user,
        int $riderId,
        int $addressId,
        array $validated,
        string $contactEmail,
        \Carbon\Carbon $verifiedAt,
        mixed $now,
    ): array {
        $referenceNumber = $this->generateReferenceNumber();

        $applicationId = (int) DB::table('rider_applications')->insertGetId([
            'reference_number' => $referenceNumber,
            'applicant_user_id' => $user->user_id,
            'rider_id' => $riderId,
            'application_status' => 'submitted',
            'legal_first_name' => trim((string) $validated['legal_first_name']),
            'legal_middle_name' => ! empty($validated['legal_middle_name']) ? trim((string) $validated['legal_middle_name']) : null,
            'legal_last_name' => trim((string) $validated['legal_last_name']),
            'legal_suffix' => ! empty($validated['legal_suffix']) ? trim((string) $validated['legal_suffix']) : null,
            'date_of_birth' => $validated['date_of_birth'],
            'gender' => $validated['gender'] ?? 'prefer_not_to_say',
            'contact_phone' => trim((string) $validated['contact_phone']),
            'contact_email' => $contactEmail,
            'contact_email_verified_at' => $verifiedAt->format('Y-m-d H:i:s'),
            'company_name' => ! empty($validated['company_name']) ? trim((string) $validated['company_name']) : null,
            'residence_address_id' => $addressId,
            'gov_id_type' => $validated['gov_id_type'],
            'gov_id_number_encrypted' => Crypt::encryptString(trim((string) $validated['gov_id_number'])),
            'gov_id_is_permanent' => (bool) $validated['gov_id_is_permanent'] ? 1 : 0,
            'gov_id_expires_on' => (bool) $validated['gov_id_is_permanent'] ? null : ($validated['gov_id_expires_on'] ?? null),
            'declarations_accepted_at' => $now->format('Y-m-d H:i:s'),
            'terms_version' => (string) ($validated['terms_version'] ?? 'v1.0'),
            'submitted_at' => $now->format('Y-m-d H:i:s'),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [$applicationId, $referenceNumber];
    }

    /**
     * @param  array<string, UploadedFile>  $documentFiles
     * @param  list<string>  $storedPrivatePaths
     */
    private function storeApplicationDocuments(
        User $user,
        int $applicationId,
        array $documentFiles,
        mixed $now,
        array &$storedPrivatePaths,
    ): void {
        $riderName = trim(((string) ($user->first_name ?? '')).' '.((string) ($user->last_name ?? '')));
        $riderContext = [
            'application_type' => 'rider',
            'application_id' => $applicationId,
            'rider_name' => $riderName !== '' ? $riderName : 'Rider',
        ];

        foreach ($documentFiles as $code => $file) {
            $stored = $this->fileStorageService->storePrivateFileForPurpose(
                file: $file,
                purpose: StoragePurpose::APPLICATION_DOCUMENT,
                ownerContext: $riderContext,
                localDirectory: "applications/rider/{$applicationId}",
                fieldName: "documents.{$code}",
            );
            $storedPrivatePaths[] = $stored['path'];

            DB::table('application_documents')->insert([
                'rider_application_id' => $applicationId,
                'document_code' => $code,
                'file_path' => $stored['path'],
                'original_filename' => $stored['original_filename'],
                'mime_type' => $stored['mime_type'],
                'file_size_bytes' => $stored['size_bytes'],
                'document_status' => 'pending_review',
                'uploaded_by' => $user->user_id,
                'uploaded_at' => $now->format('Y-m-d H:i:s'),
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function upsertPayoutAccount(int $riderId, array $validated, mixed $now): void
    {
        $existingPayout = DB::table('payout_accounts')->where('rider_id', $riderId)->value('payout_account_id');
        $payoutPayload = [
            'provider' => trim((string) $validated['payout_provider']),
            'account_type' => $validated['payout_account_type'],
            'account_holder_name' => trim((string) $validated['payout_account_holder_name']),
            'account_number_encrypted' => Crypt::encryptString(trim((string) $validated['payout_account_number'])),
            'updated_at' => $now,
        ];

        if ($existingPayout) {
            DB::table('payout_accounts')->where('payout_account_id', $existingPayout)->update($payoutPayload);

            return;
        }

        $payoutPayload['rider_id'] = $riderId;
        $payoutPayload['created_at'] = $now;
        DB::table('payout_accounts')->insert($payoutPayload);
    }

    private function recordSubmissionAuditAndNotify(
        User $user,
        int $applicationId,
        string $referenceNumber,
        string $vehicleType,
        Request $request,
    ): void {
        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'rider_application_submitted',
            entityType: 'rider_applications',
            entityId: $applicationId,
            newValues: [
                'reference_number' => $referenceNumber,
                'vehicle_type' => $vehicleType,
                'status' => 'submitted',
            ],
            request: $request,
        );

        $applicantFirstName = trim((string) ($user->first_name ?? '')) ?: 'An applicant';
        $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $user->user_id);
        $this->notificationService->notifyUsers(
            userIds: $adminIds,
            workspace: 'admin',
            type: 'rider_application_submitted',
            title: 'New rider application',
            body: "{$applicantFirstName} submitted a rider application ({$referenceNumber}).",
            relatedEntityType: 'rider_applications',
            relatedEntityId: $applicationId,
        );
    }

    /**
     * Return the authenticated user's latest rider application with documents and requests.
     *
     * @return array<string, mixed>|null
     */
    public function getCurrentForUser(User $user): ?array
    {
        $row = DB::table('rider_applications')
            ->where('applicant_user_id', $user->user_id)
            ->orderByDesc('submitted_at')
            ->orderByDesc('rider_application_id')
            ->first();

        if (! $row) {
            return null;
        }

        return $this->getApplicationById((int) $row->rider_application_id);
    }

    /**
     * Upload a new/replacement document or fulfill an admin document request.
     *
     * @return array<string, mixed>
     */
    public function uploadDocument(User $user, int $applicationId, string $documentCode, UploadedFile $file, ?int $requestId, Request $request): array
    {
        $app = DB::table('rider_applications')->where('rider_application_id', $applicationId)->first();
        if (! $app || (int) $app->applicant_user_id !== (int) $user->user_id) {
            abort(404, 'Rider application not found.');
        }

        if (! in_array($documentCode, [...SubmitRiderApplicationRequest::RIDER_DOCUMENT_CODES, 'requested_document'], true)) {
            throw ValidationException::withMessages(['document_code' => ['Invalid rider document code.']]);
        }

        $riderName = trim(((string) ($user->first_name ?? '')).' '.((string) ($user->last_name ?? '')));
        $stored = $this->fileStorageService->storePrivateFileForPurpose(
            file: $file,
            purpose: StoragePurpose::APPLICATION_DOCUMENT,
            ownerContext: [
                'application_type' => 'rider',
                'application_id' => $applicationId,
                'rider_name' => $riderName !== '' ? $riderName : 'Rider',
            ],
            localDirectory: "applications/rider/{$applicationId}",
            fieldName: 'file',
        );

        try {
            DB::transaction(function () use ($user, $applicationId, $app, $documentCode, $stored, $requestId, $request): void {
                $this->persistUploadedDocument($user, $applicationId, $app, $documentCode, $stored, $requestId, $request);
            });
        } catch (\Throwable $e) {
            $this->fileStorageService->cleanupStoredPaths([], [$stored['path']]);
            throw $e;
        }

        return $this->getApplicationById($applicationId);
    }

    /**
     * @param  array<string, mixed>  $stored
     */
    private function persistUploadedDocument(
        User $user,
        int $applicationId,
        object $app,
        string $documentCode,
        array $stored,
        ?int $requestId,
        Request $request,
    ): void {
        $now = now();

        DB::table('application_documents')->insert([
            'rider_application_id' => $applicationId,
            'request_id' => $requestId,
            'document_code' => $documentCode,
            'file_path' => $stored['path'],
            'original_filename' => $stored['original_filename'],
            'mime_type' => $stored['mime_type'],
            'file_size_bytes' => $stored['size_bytes'],
            'document_status' => 'pending_review',
            'uploaded_by' => $user->user_id,
            'uploaded_at' => $now->format('Y-m-d H:i:s'),
        ]);

        if ($requestId) {
            DB::table('application_document_requests')
                ->where('request_id', $requestId)
                ->where('rider_application_id', $applicationId)
                ->update([
                    'request_status' => 'submitted',
                    'fulfilled_at' => $now->format('Y-m-d H:i:s'),
                ]);
        }

        if (in_array($app->application_status, ['needs_correction', 'additional_documents_required'], true)) {
            DB::table('rider_applications')
                ->where('rider_application_id', $applicationId)
                ->update([
                    'application_status' => 'resubmitted',
                    'updated_at' => $now,
                ]);

            $applicantFirstName = trim((string) ($user->first_name ?? '')) ?: 'An applicant';
            $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $user->user_id);
            $this->notificationService->notifyUsers(
                userIds: $adminIds,
                workspace: 'admin',
                type: 'rider_application_resubmitted',
                title: 'Rider application resubmitted',
                body: "{$applicantFirstName} uploaded requested documents for application {$app->reference_number}.",
                relatedEntityType: 'rider_applications',
                relatedEntityId: $applicationId,
            );
        }

        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'rider_document_uploaded',
            entityType: 'rider_applications',
            entityId: $applicationId,
            newValues: ['document_code' => $documentCode, 'request_id' => $requestId],
            request: $request,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function getApplicationById(int $applicationId): array
    {
        $row = $this->loadApplicationRow($applicationId);
        $documents = $this->loadApplicationDocuments($applicationId);
        $requests = $this->loadApplicationDocumentRequests($applicationId);

        return $this->formatApplicationPayload($row, $documents, $requests);
    }

    private function loadApplicationRow(int $applicationId): object
    {
        $row = DB::table('rider_applications as ra')
            ->join('riders as r', 'r.rider_id', '=', 'ra.rider_id')
            ->join('cities as bc', 'bc.city_id', '=', 'r.base_city_id')
            ->join('addresses as addr', 'addr.address_id', '=', 'ra.residence_address_id')
            ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('ra.rider_application_id', $applicationId)
            ->select([
                'ra.*',
                'r.vehicle_type',
                'r.vehicle_brand',
                'r.vehicle_model',
                'r.vehicle_color',
                'r.vehicle_year',
                'r.plate_number',
                'r.mv_file_number',
                'r.vehicle_ownership',
                'r.vehicle_owner_name',
                'r.vehicle_owner_relationship',
                'r.bicycle_type',
                'r.motor_wattage',
                'r.emergency_contact_name',
                'r.emergency_contact_relationship',
                'r.emergency_contact_phone',
                'r.emergency_contact_alt_phone',
                'r.preferred_hubs',
                'r.preferred_shifts',
                'r.available_days',
                'r.rider_status',
                'r.approved_at as rider_approved_at',
                'bc.city_name as base_city_name',
                'addr.street',
                'addr.house_number',
                'addr.building_name',
                'addr.landmark',
                'addr.postal_code',
                'brgy.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->first();

        abort_unless($row !== null, 404, 'Rider application not found.');

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadApplicationDocuments(int $applicationId): array
    {
        return DB::table('application_documents')
            ->where('rider_application_id', $applicationId)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('document_id')
            ->get()
            ->map(fn ($doc) => [
                'document_id' => (int) $doc->document_id,
                'document_code' => $doc->document_code,
                'original_filename' => $doc->original_filename,
                'mime_type' => $doc->mime_type,
                'file_size_bytes' => (int) $doc->file_size_bytes,
                'document_status' => $doc->document_status,
                'review_note' => $doc->review_note,
                'uploaded_at' => $doc->uploaded_at,
                'reviewed_at' => $doc->reviewed_at,
                'file_url' => "/api/applications/documents/{$doc->document_id}/file",
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadApplicationDocumentRequests(int $applicationId): array
    {
        return DB::table('application_document_requests')
            ->where('rider_application_id', $applicationId)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($req) => [
                'request_id' => (int) $req->request_id,
                'document_name' => $req->document_name,
                'reason' => $req->reason,
                'instructions' => $req->instructions,
                'due_date' => $req->due_date,
                'request_status' => $req->request_status,
                'created_at' => $req->created_at,
                'fulfilled_at' => $req->fulfilled_at,
            ])
            ->values()
            ->all();
    }

    /**
     * @param  list<array<string, mixed>>  $documents
     * @param  list<array<string, mixed>>  $requests
     * @return array<string, mixed>
     */
    private function formatApplicationPayload(object $row, array $documents, array $requests): array
    {
        return [
            'rider_application_id' => (int) $row->rider_application_id,
            'rider_id' => (int) $row->rider_id,
            'reference_number' => $row->reference_number,
            'application_status' => $row->application_status,
            'rider_status' => $row->rider_status,
            'legal_first_name' => $row->legal_first_name,
            'legal_middle_name' => $row->legal_middle_name,
            'legal_last_name' => $row->legal_last_name,
            'legal_suffix' => $row->legal_suffix,
            'date_of_birth' => $row->date_of_birth,
            'gender' => $row->gender,
            'contact_phone' => $row->contact_phone,
            'contact_email' => $row->contact_email,
            'contact_email_verified_at' => $row->contact_email_verified_at,
            'company_name' => $row->company_name,
            'address' => [
                'province' => $row->province_name,
                'city' => $row->city_name,
                'barangay' => $row->barangay_name,
                'street' => $row->street,
                'house_number' => $row->house_number,
                'building_name' => $row->building_name,
                'landmark' => $row->landmark,
                'postal_code' => $row->postal_code,
            ],
            'vehicle_type' => $row->vehicle_type,
            'vehicle_brand' => $row->vehicle_brand,
            'vehicle_model' => $row->vehicle_model,
            'vehicle_color' => $row->vehicle_color,
            'vehicle_year' => $row->vehicle_year ? (int) $row->vehicle_year : null,
            'plate_number' => $row->plate_number,
            'mv_file_number' => $row->mv_file_number,
            'vehicle_ownership' => $row->vehicle_ownership,
            'bicycle_type' => $row->bicycle_type,
            'motor_wattage' => $row->motor_wattage,
            'base_city' => $row->base_city_name,
            'preferred_hubs' => $row->preferred_hubs,
            'preferred_shifts' => $row->preferred_shifts ? explode(',', $row->preferred_shifts) : [],
            'available_days' => $row->available_days ? explode(',', $row->available_days) : [],
            'emergency_contact_name' => $row->emergency_contact_name,
            'emergency_contact_relationship' => $row->emergency_contact_relationship,
            'emergency_contact_phone' => $row->emergency_contact_phone,
            'gov_id_type' => $row->gov_id_type,
            'gov_id_is_permanent' => (bool) $row->gov_id_is_permanent,
            'gov_id_expires_on' => $row->gov_id_expires_on,
            'reviewer_note' => $row->reviewer_note,
            'submitted_at' => $row->submitted_at,
            'reviewed_at' => $row->reviewed_at,
            'decided_at' => $row->decided_at,
            'documents' => $documents,
            'document_requests' => $requests,
        ];
    }

    /**
     * @param  array<string, UploadedFile>  $documentFiles
     */
    private function validateDocumentCodes(array $documentFiles, string $vehicleType): void
    {
        foreach (array_keys($documentFiles) as $code) {
            if (! in_array($code, SubmitRiderApplicationRequest::RIDER_DOCUMENT_CODES, true)) {
                throw ValidationException::withMessages([
                    "documents.{$code}" => ["Unsupported rider document code: {$code}."],
                ]);
            }
        }

        $required = ['government_id_front', 'selfie'];
        if ($vehicleType === 'motorcycle') {
            $required = [...$required, 'driver_license', 'lto_or', 'lto_cr'];
        }

        foreach ($required as $reqCode) {
            if (! isset($documentFiles[$reqCode])) {
                throw ValidationException::withMessages([
                    "documents.{$reqCode}" => ["Required document '{$reqCode}' is missing."],
                ]);
            }
        }
    }

    private function generateReferenceNumber(): string
    {
        $datePart = now()->format('Ymd');
        do {
            $ref = 'SALO-RIDER-'.$datePart.'-'.random_int(1000, 9999);
            $exists = DB::table('rider_applications')->where('reference_number', $ref)->exists();
        } while ($exists);

        return $ref;
    }
}
