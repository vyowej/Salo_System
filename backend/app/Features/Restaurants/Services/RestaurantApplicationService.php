<?php

namespace App\Features\Restaurants\Services;

use App\Features\Auth\Services\OtpService;
use App\Features\Notifications\Services\NotificationService;
use App\Features\Restaurants\Requests\SubmitRestaurantApplicationRequest;
use App\Models\User;
use App\Support\AddressService;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RestaurantApplicationService
{
    public function __construct(
        private readonly OtpService $otpService,
        private readonly AddressService $addressService,
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Submit a new restaurant partner application with logo, cover photo, initial menu items, and documents.
     *
     * @param  array<string, mixed>  $validated
     * @param  array<string, UploadedFile>  $documentFiles
     * @param  array<int|string, UploadedFile>  $menuItemPhotos
     * @return array<string, mixed>
     */
    public function submit(
        User $user,
        array $validated,
        array $documentFiles,
        ?UploadedFile $logoFile,
        ?UploadedFile $coverFile,
        array $menuItemPhotos = [],
        ?Request $request = null,
    ): array {
        [$offersDelivery, $offersPickup, $offersDineIn, $contactEmail, $verifiedAt] = $this->validateSubmissionPreconditions(
            $user,
            $validated,
            $documentFiles,
        );

        $storedPublicPaths = [];
        $storedPrivatePaths = [];

        try {
            $result = DB::transaction(function () use (
                $user,
                $validated,
                $documentFiles,
                $logoFile,
                $coverFile,
                $menuItemPhotos,
                $contactEmail,
                $verifiedAt,
                $offersDelivery,
                $offersPickup,
                $offersDineIn,
                $request,
                &$storedPublicPaths,
                &$storedPrivatePaths,
            ): array {
                $now = now();
                $addressId = $this->createRestaurantAddress($validated);
                $restaurantId = $this->createRestaurantRecord(
                    $validated,
                    $addressId,
                    $offersDelivery,
                    $offersPickup,
                    $offersDineIn,
                    $now,
                );
                $this->storeRestaurantBranding($restaurantId, $logoFile, $coverFile, $now, $storedPublicPaths);

                DB::table('restaurant_owners')->insert([
                    'restaurant_id' => $restaurantId,
                    'user_id' => $user->user_id,
                    'joined_at' => $now,
                ]);

                $this->syncRestaurantCategories($restaurantId, $validated['categories'] ?? [], $now);
                $this->insertOperatingHours($restaurantId, $validated['operating_hours'] ?? [], $now);
                $this->insertInitialMenuItems(
                    $restaurantId,
                    $validated['menu_items'] ?? [],
                    $menuItemPhotos,
                    $now,
                    $storedPublicPaths,
                );

                [$applicationId, $referenceNumber] = $this->createApplicationRecord(
                    $user,
                    $restaurantId,
                    $validated,
                    $contactEmail,
                    $verifiedAt,
                    $now,
                );

                $this->insertApplicationBranches($applicationId, $validated, $now);
                $this->storeApplicationDocuments($user, $applicationId, $documentFiles, $now, $storedPrivatePaths);
                $this->insertPayoutAccount($restaurantId, $validated, $now);
                $this->recordSubmissionAuditAndNotify($user, $applicationId, $referenceNumber, $restaurantId, $validated, $request);

                return $this->getApplicationById($applicationId);
            });
        } catch (\Throwable $e) {
            $this->fileStorageService->cleanupStoredPaths($storedPublicPaths, $storedPrivatePaths);
            throw $e;
        }

        $this->otpService->forgetVerified($contactEmail, 'restaurant_application', (int) $user->user_id);

        return $result;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @param  array<string, UploadedFile>  $documentFiles
     * @return array{bool, bool, bool, string, \Carbon\Carbon}
     */
    private function validateSubmissionPreconditions(User $user, array $validated, array $documentFiles): array
    {
        $offersDelivery = (bool) $validated['offers_delivery'];
        $offersPickup = (bool) $validated['offers_pickup'];
        $offersDineIn = (bool) $validated['offers_dine_in'];

        if (! $offersDelivery && ! $offersPickup && ! $offersDineIn) {
            throw ValidationException::withMessages([
                'offers_delivery' => ['At least one service option (delivery, pickup, or dine-in) must be enabled.'],
            ]);
        }

        $contactEmail = strtolower(trim((string) $validated['contact_email']));
        $verifiedAt = $this->otpService->assertVerified($contactEmail, 'restaurant_application', (int) $user->user_id);

        foreach (array_keys($documentFiles) as $code) {
            if (! in_array($code, SubmitRestaurantApplicationRequest::RESTAURANT_DOCUMENT_CODES, true)) {
                throw ValidationException::withMessages([
                    "documents.{$code}" => ["Unsupported restaurant document code: {$code}."],
                ]);
            }
        }

        $this->validateBranchPreconditions($validated);

        return [$offersDelivery, $offersPickup, $offersDineIn, $contactEmail, $verifiedAt];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function validateBranchPreconditions(array $validated): void
    {
        $hasBranches = filter_var($validated['has_branches'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $branches = isset($validated['branches']) && is_array($validated['branches']) ? $validated['branches'] : [];

        if (! $hasBranches && $branches === []) {
            return;
        }

        $mainBranchName = trim((string) ($validated['main_branch_name'] ?? ''));
        if ($mainBranchName === '') {
            throw ValidationException::withMessages([
                'main_branch_name' => ['The main branch name field is required when the business has branches.'],
            ]);
        }

        $maxTotal = max(1, (int) config('salo.restaurants.max_application_branches', 5));
        if (1 + count($branches) > $maxTotal) {
            throw ValidationException::withMessages([
                'branches' => ["A maximum of {$maxTotal} total branch locations (including the main branch) is allowed per application."],
            ]);
        }

        $seen = [mb_strtolower($mainBranchName) => true];
        foreach ($branches as $idx => $branch) {
            $bName = trim((string) ($branch['branch_name'] ?? ''));
            if ($bName === '') {
                throw ValidationException::withMessages([
                    "branches.{$idx}.branch_name" => ['Branch name is required.'],
                ]);
            }
            $key = mb_strtolower($bName);
            if (isset($seen[$key])) {
                throw ValidationException::withMessages([
                    "branches.{$idx}.branch_name" => ["Duplicate branch name \"{$bName}\". Branch names must be unique within the application."],
                ]);
            }
            $seen[$key] = true;
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function resolveSubmittedMainBranchName(array $validated): ?string
    {
        $hasBranches = filter_var($validated['has_branches'] ?? false, FILTER_VALIDATE_BOOLEAN)
            || (! empty($validated['branches']) && is_array($validated['branches']));

        if (! $hasBranches) {
            return null;
        }

        $trimmed = trim((string) ($validated['main_branch_name'] ?? ''));

        return $trimmed !== '' ? $trimmed : null;
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function createRestaurantAddress(array $validated): int
    {
        return $this->addressService->createAddress([
            'province' => $validated['province'],
            'city' => $validated['city'],
            'barangay' => $validated['barangay'],
            'street' => $validated['street'] ?? null,
            'house_number' => $validated['house_number'] ?? null,
            'building_name' => $validated['building_name'] ?? null,
            'landmark' => $validated['landmark'] ?? null,
            'postal_code' => $validated['postal_code'] ?? null,
            'latitude' => $validated['latitude'] ?? null,
            'longitude' => $validated['longitude'] ?? null,
        ]);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function createRestaurantRecord(
        array $validated,
        int $addressId,
        bool $offersDelivery,
        bool $offersPickup,
        bool $offersDineIn,
        mixed $now,
    ): int {
        $restaurantId = (int) DB::table('restaurants')->insertGetId([
            'parent_restaurant_id' => null,
            'brand_restaurant_id' => null,
            'restaurant_name' => trim((string) $validated['restaurant_name']),
            'branch_name' => $this->resolveSubmittedMainBranchName($validated),
            'registered_name' => ! empty($validated['registered_name']) ? trim((string) $validated['registered_name']) : null,
            'business_type' => $validated['business_type'],
            'ownership_structure' => $validated['ownership_structure'],
            'description' => ! empty($validated['description']) ? trim((string) $validated['description']) : null,
            'contact_phone' => trim((string) $validated['business_phone']),
            'business_email' => strtolower(trim((string) $validated['business_email'])),
            'address_id' => $addressId,
            'delivery_radius' => $validated['delivery_radius'] ?? null,
            'offers_delivery' => $offersDelivery ? 1 : 0,
            'offers_pickup' => $offersPickup ? 1 : 0,
            'offers_dine_in' => $offersDineIn ? 1 : 0,
            'accepts_reservations' => (bool) ($validated['accepts_reservations'] ?? false) ? 1 : 0,
            'restaurant_status' => 'pending',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('restaurants')
            ->where('restaurant_id', $restaurantId)
            ->update(['brand_restaurant_id' => $restaurantId]);

        return $restaurantId;
    }

    /**
     * @param  list<string>  $storedPublicPaths
     */
    private function storeRestaurantBranding(
        int $restaurantId,
        ?UploadedFile $logoFile,
        ?UploadedFile $coverFile,
        mixed $now,
        array &$storedPublicPaths,
    ): void {
        $logoPath = null;
        $coverPath = null;

        if ($logoFile !== null) {
            $storedLogo = $this->fileStorageService->storePublicImage(
                file: $logoFile,
                directory: "restaurants/{$restaurantId}",
                fieldName: 'logo_image',
            );
            $logoPath = $storedLogo['path'];
            $storedPublicPaths[] = $logoPath;
        }

        if ($coverFile !== null) {
            $storedCover = $this->fileStorageService->storePublicImage(
                file: $coverFile,
                directory: "restaurants/{$restaurantId}",
                fieldName: 'cover_image',
            );
            $coverPath = $storedCover['path'];
            $storedPublicPaths[] = $coverPath;
        }

        if ($logoPath !== null || $coverPath !== null) {
            DB::table('restaurants')
                ->where('restaurant_id', $restaurantId)
                ->update([
                    'logo_image' => $logoPath,
                    'cover_image' => $coverPath,
                    'updated_at' => $now,
                ]);
        }
    }

    private function syncRestaurantCategories(int $restaurantId, mixed $categories, mixed $now): void
    {
        if (empty($categories) || ! is_array($categories)) {
            return;
        }

        foreach ($categories as $categoryName) {
            $cleanCategory = trim((string) $categoryName);
            if ($cleanCategory === '') {
                continue;
            }

            $categoryId = DB::table('restaurant_categories')
                ->where('category_name', $cleanCategory)
                ->value('category_id');

            if (! $categoryId) {
                $categoryId = DB::table('restaurant_categories')->insertGetId([
                    'category_name' => mb_substr($cleanCategory, 0, 100),
                    'is_active' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            DB::table('restaurant_category_map')->insertOrIgnore([
                'restaurant_id' => $restaurantId,
                'category_id' => $categoryId,
            ]);
        }
    }

    private function insertOperatingHours(int $restaurantId, mixed $operatingHours, mixed $now): void
    {
        if (empty($operatingHours) || ! is_array($operatingHours)) {
            return;
        }

        foreach ($operatingHours as $hourRow) {
            DB::table('operating_hours')->insert([
                'restaurant_id' => $restaurantId,
                'day_of_week' => (int) $hourRow['day_of_week'],
                'opening_time' => $hourRow['opening_time'],
                'closing_time' => $hourRow['closing_time'],
                'is_closed' => (bool) ($hourRow['is_closed'] ?? false) ? 1 : 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * @param  array<int|string, UploadedFile>  $menuItemPhotos
     * @param  list<string>  $storedPublicPaths
     */
    private function insertInitialMenuItems(
        int $restaurantId,
        mixed $menuItems,
        array $menuItemPhotos,
        mixed $now,
        array &$storedPublicPaths,
    ): void {
        if (empty($menuItems) || ! is_array($menuItems)) {
            return;
        }

        $categoryCache = [];
        $categorySortOrder = 0;

        foreach ($menuItems as $idx => $itemRow) {
            $categoryName = trim((string) ($itemRow['category'] ?? 'Main Dishes'));
            if ($categoryName === '') {
                $categoryName = 'Main Dishes';
            }
            $categoryKey = mb_strtolower($categoryName);

            if (! isset($categoryCache[$categoryKey])) {
                $existingCatId = DB::table('menu_categories')
                    ->where('restaurant_id', $restaurantId)
                    ->where('category_name', $categoryName)
                    ->value('menu_category_id');

                $categoryCache[$categoryKey] = $existingCatId
                    ? (int) $existingCatId
                    : (int) DB::table('menu_categories')->insertGetId([
                        'restaurant_id' => $restaurantId,
                        'category_name' => mb_substr($categoryName, 0, 100),
                        'sort_order' => $categorySortOrder++,
                        'is_active' => 1,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
            }

            $photoPath = null;
            $photoFile = $menuItemPhotos[$idx] ?? null;
            if ($photoFile instanceof UploadedFile) {
                $storedPhoto = $this->fileStorageService->storePublicImage(
                    file: $photoFile,
                    directory: "restaurants/{$restaurantId}/menu",
                    fieldName: "menu_item_photos.{$idx}",
                );
                $photoPath = $storedPhoto['path'];
                $storedPublicPaths[] = $photoPath;
            }

            $isAvailable = array_key_exists('available', $itemRow)
                ? filter_var($itemRow['available'], FILTER_VALIDATE_BOOLEAN)
                : true;

            DB::table('menu_items')->insert([
                'restaurant_id' => $restaurantId,
                'menu_category_id' => $categoryCache[$categoryKey],
                'item_name' => mb_substr(trim((string) $itemRow['name']), 0, 200),
                'description' => ! empty($itemRow['description']) ? trim((string) $itemRow['description']) : null,
                'photo_image' => $photoPath,
                'base_price' => number_format((float) $itemRow['price'], 2, '.', ''),
                'availability_status' => $isAvailable ? 'available' : 'temporarily_unavailable',
                'approval_status' => 'pending',
                'sort_order' => (int) $idx,
                'draft_state' => 'new',
                'is_published' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{int, string}
     */
    private function createApplicationRecord(
        User $user,
        int $restaurantId,
        array $validated,
        string $contactEmail,
        \Carbon\Carbon $verifiedAt,
        mixed $now,
    ): array {
        $referenceNumber = $this->generateReferenceNumber();

        $applicationId = (int) DB::table('restaurant_applications')->insertGetId([
            'reference_number' => $referenceNumber,
            'applicant_user_id' => $user->user_id,
            'restaurant_id' => $restaurantId,
            'application_status' => 'submitted',
            'applicant_position' => $validated['applicant_position'],
            'legal_first_name' => trim((string) $validated['legal_first_name']),
            'legal_middle_name' => ! empty($validated['legal_middle_name']) ? trim((string) $validated['legal_middle_name']) : null,
            'legal_last_name' => trim((string) $validated['legal_last_name']),
            'legal_suffix' => ! empty($validated['legal_suffix']) ? trim((string) $validated['legal_suffix']) : null,
            'date_of_birth' => $validated['date_of_birth'],
            'contact_phone' => trim((string) $validated['contact_phone']),
            'contact_email' => $contactEmail,
            'contact_email_verified_at' => $verifiedAt->format('Y-m-d H:i:s'),
            'declarations_accepted_at' => $now->format('Y-m-d H:i:s'),
            'terms_version' => (string) ($validated['terms_version'] ?? 'v1.0'),
            'submitted_at' => $now->format('Y-m-d H:i:s'),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [$applicationId, $referenceNumber];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function insertApplicationBranches(int $applicationId, array $validated, mixed $now): void
    {
        $branches = isset($validated['branches']) && is_array($validated['branches'])
            ? array_values($validated['branches'])
            : [];

        if ($branches === []) {
            return;
        }

        foreach ($branches as $index => $branchData) {
            if (! is_array($branchData)) {
                continue;
            }

            $branchAddressId = $this->createRestaurantAddress($branchData);
            $phone = isset($branchData['contact_phone']) && trim((string) $branchData['contact_phone']) !== ''
                ? trim((string) $branchData['contact_phone'])
                : null;

            DB::table('restaurant_application_branches')->insert([
                'restaurant_application_id' => $applicationId,
                'branch_name' => trim((string) $branchData['branch_name']),
                'address_id' => $branchAddressId,
                'contact_phone' => $phone,
                'sort_order' => $index + 1,
                'created_branch_restaurant_id' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
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
        foreach ($documentFiles as $code => $file) {
            $stored = $this->fileStorageService->storePrivateDocument(
                file: $file,
                directory: "applications/restaurant/{$applicationId}",
                fieldName: "documents.{$code}",
            );
            $storedPrivatePaths[] = $stored['path'];

            DB::table('application_documents')->insert([
                'restaurant_application_id' => $applicationId,
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
    private function insertPayoutAccount(int $restaurantId, array $validated, mixed $now): void
    {
        DB::table('payout_accounts')->insert([
            'restaurant_id' => $restaurantId,
            'provider' => trim((string) $validated['payout_provider']),
            'account_type' => $validated['payout_account_type'],
            'account_holder_name' => trim((string) $validated['payout_account_holder_name']),
            'account_number_encrypted' => Crypt::encryptString(trim((string) $validated['payout_account_number'])),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function recordSubmissionAuditAndNotify(
        User $user,
        int $applicationId,
        string $referenceNumber,
        int $restaurantId,
        array $validated,
        ?Request $request,
    ): void {
        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'restaurant_application_submitted',
            entityType: 'restaurant_applications',
            entityId: $applicationId,
            newValues: [
                'reference_number' => $referenceNumber,
                'restaurant_id' => $restaurantId,
                'restaurant_name' => $validated['restaurant_name'],
                'status' => 'submitted',
            ],
            request: $request,
        );

        $applicantFirstName = trim((string) ($user->first_name ?? '')) ?: 'An applicant';
        $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $user->user_id);
        $this->notificationService->notifyUsers(
            userIds: $adminIds,
            workspace: 'admin',
            type: 'restaurant_application_submitted',
            title: 'New restaurant application',
            body: "{$applicantFirstName} submitted a restaurant application ({$referenceNumber}).",
            relatedEntityType: 'restaurant_applications',
            relatedEntityId: $applicationId,
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getCurrentForUser(User $user): ?array
    {
        $row = DB::table('restaurant_applications')
            ->where('applicant_user_id', $user->user_id)
            ->orderByDesc('submitted_at')
            ->orderByDesc('restaurant_application_id')
            ->first();

        if (! $row) {
            return null;
        }

        return $this->getApplicationById((int) $row->restaurant_application_id);
    }

    /**
     * @return array<string, mixed>
     */
    public function uploadDocument(User $user, int $applicationId, string $documentCode, UploadedFile $file, ?int $requestId, Request $request): array
    {
        $app = $this->assertCanUploadDocument($user, $applicationId, $documentCode);

        $stored = $this->fileStorageService->storePrivateDocument(
            file: $file,
            directory: "applications/restaurant/{$applicationId}",
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

    private function assertCanUploadDocument(User $user, int $applicationId, string $documentCode): object
    {
        $app = DB::table('restaurant_applications')->where('restaurant_application_id', $applicationId)->first();
        if (! $app) {
            abort(404, 'Restaurant application not found.');
        }

        $isOwner = (int) $app->applicant_user_id === (int) $user->user_id
            || DB::table('restaurant_owners')
                ->where('restaurant_id', $app->restaurant_id)
                ->where('user_id', $user->user_id)
                ->exists();

        abort_unless($isOwner, 403, 'Forbidden.');

        if (! in_array($documentCode, [...SubmitRestaurantApplicationRequest::RESTAURANT_DOCUMENT_CODES, 'requested_document'], true)) {
            throw ValidationException::withMessages(['document_code' => ['Invalid restaurant document code.']]);
        }

        return $app;
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
            'restaurant_application_id' => $applicationId,
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
                ->where('restaurant_application_id', $applicationId)
                ->update([
                    'request_status' => 'submitted',
                    'fulfilled_at' => $now->format('Y-m-d H:i:s'),
                ]);
        }

        if (in_array($app->application_status, ['needs_correction', 'additional_documents_required'], true)) {
            DB::table('restaurant_applications')
                ->where('restaurant_application_id', $applicationId)
                ->update([
                    'application_status' => 'resubmitted',
                    'updated_at' => $now,
                ]);

            $applicantFirstName = trim((string) ($user->first_name ?? '')) ?: 'An applicant';
            $adminIds = $this->notificationService->resolveActiveAdminUserIds((int) $user->user_id);
            $this->notificationService->notifyUsers(
                userIds: $adminIds,
                workspace: 'admin',
                type: 'restaurant_application_resubmitted',
                title: 'Restaurant application resubmitted',
                body: "{$applicantFirstName} uploaded requested documents for application {$app->reference_number}.",
                relatedEntityType: 'restaurant_applications',
                relatedEntityId: $applicationId,
            );
        }

        $this->auditLogService->record(
            actorUserId: (int) $user->user_id,
            action: 'restaurant_document_uploaded',
            entityType: 'restaurant_applications',
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
        $categories = $this->loadRestaurantCategories((int) $row->restaurant_id);
        $documents = $this->loadApplicationDocuments($applicationId);
        $requests = $this->loadApplicationDocumentRequests($applicationId);
        $menuItems = $this->loadApplicationMenuItems((int) $row->restaurant_id);
        $branches = $this->loadApplicationBranches($applicationId);

        return $this->formatApplicationPayload($row, $categories, $documents, $requests, $menuItems, $branches);
    }

    private function loadApplicationRow(int $applicationId): object
    {
        $row = DB::table('restaurant_applications as ra')
            ->join('restaurants as rest', 'rest.restaurant_id', '=', 'ra.restaurant_id')
            ->join('addresses as addr', 'addr.address_id', '=', 'rest.address_id')
            ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('ra.restaurant_application_id', $applicationId)
            ->select([
                'ra.*',
                'rest.restaurant_name',
                'rest.branch_name as main_branch_name',
                'rest.registered_name',
                'rest.business_type',
                'rest.ownership_structure',
                'rest.description',
                'rest.contact_phone as business_phone',
                'rest.business_email',
                'rest.logo_image',
                'rest.cover_image',
                'rest.delivery_radius',
                'rest.offers_delivery',
                'rest.offers_pickup',
                'rest.offers_dine_in',
                'rest.accepts_reservations',
                'rest.restaurant_status',
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

        abort_unless($row !== null, 404, 'Restaurant application not found.');

        return $row;
    }

    /**
     * @return list<mixed>
     */
    private function loadRestaurantCategories(int $restaurantId): array
    {
        return DB::table('restaurant_category_map as rcm')
            ->join('restaurant_categories as rc', 'rc.category_id', '=', 'rcm.category_id')
            ->where('rcm.restaurant_id', $restaurantId)
            ->pluck('rc.category_name')
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadApplicationDocuments(int $applicationId): array
    {
        return DB::table('application_documents')
            ->where('restaurant_application_id', $applicationId)
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
            ->where('restaurant_application_id', $applicationId)
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
     * @return list<array<string, mixed>>
     */
    private function loadApplicationMenuItems(int $restaurantId): array
    {
        return DB::table('menu_items as mi')
            ->join('menu_categories as mc', 'mc.menu_category_id', '=', 'mi.menu_category_id')
            ->where('mi.restaurant_id', $restaurantId)
            ->orderBy('mi.sort_order')
            ->orderBy('mi.menu_item_id')
            ->get([
                'mi.menu_item_id',
                'mi.item_name',
                'mi.description',
                'mi.photo_image',
                'mi.base_price',
                'mi.availability_status',
                'mi.approval_status',
                'mc.category_name',
            ])
            ->map(fn ($item) => [
                'menu_item_id' => (int) $item->menu_item_id,
                'name' => $item->item_name,
                'description' => $item->description,
                'category' => $item->category_name,
                'price' => (float) $item->base_price,
                'available' => $item->availability_status === 'available',
                'availability_status' => $item->availability_status,
                'approval_status' => $item->approval_status,
                'photo_url' => $this->fileStorageService->publicUrl($item->photo_image),
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadApplicationBranches(int $applicationId): array
    {
        return DB::table('restaurant_application_branches as rab')
            ->join('addresses as addr', 'addr.address_id', '=', 'rab.address_id')
            ->join('barangays as brgy', 'brgy.barangay_id', '=', 'addr.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'brgy.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->leftJoin('branch_permits as bp_rest', 'bp_rest.restaurant_id', '=', 'rab.created_branch_restaurant_id')
            ->leftJoin('branch_permits as bp_app', 'bp_app.application_branch_id', '=', 'rab.application_branch_id')
            ->where('rab.restaurant_application_id', $applicationId)
            ->orderBy('rab.sort_order')
            ->orderBy('rab.application_branch_id')
            ->select([
                'rab.application_branch_id',
                'rab.branch_name',
                'rab.contact_phone',
                'rab.sort_order',
                'rab.created_branch_restaurant_id',
                'addr.street',
                'addr.house_number',
                'addr.building_name',
                'addr.landmark',
                'addr.postal_code',
                'addr.latitude',
                'addr.longitude',
                'brgy.barangay_name',
                'c.city_name',
                'p.province_name',
                DB::raw('COALESCE(bp_rest.permit_id, bp_app.permit_id) as permit_id'),
                DB::raw('COALESCE(bp_rest.permit_status, bp_app.permit_status) as permit_status'),
                DB::raw('COALESCE(bp_rest.is_required_locally, bp_app.is_required_locally) as permit_is_required_locally'),
                DB::raw('COALESCE(bp_rest.exemption_reason, bp_app.exemption_reason) as permit_exemption_reason'),
                DB::raw('COALESCE(bp_rest.review_note, bp_app.review_note) as permit_review_note'),
            ])
            ->get()
            ->map(fn ($b): array => [
                'application_branch_id' => (int) $b->application_branch_id,
                'branch_name' => $b->branch_name,
                'contact_phone' => $b->contact_phone,
                'sort_order' => (int) $b->sort_order,
                'created_branch_restaurant_id' => $b->created_branch_restaurant_id !== null ? (int) $b->created_branch_restaurant_id : null,
                'permit_id' => $b->permit_id !== null ? (int) $b->permit_id : null,
                'permit_status' => $b->permit_status,
                'permit_is_required_locally' => $b->permit_is_required_locally !== null ? (bool) $b->permit_is_required_locally : null,
                'permit_exemption_reason' => $b->permit_exemption_reason,
                'permit_review_note' => $b->permit_review_note,
                'address' => [
                    'province' => $b->province_name,
                    'city' => $b->city_name,
                    'barangay' => $b->barangay_name,
                    'street' => $b->street,
                    'house_number' => $b->house_number,
                    'building_name' => $b->building_name,
                    'landmark' => $b->landmark,
                    'postal_code' => $b->postal_code,
                    'latitude' => $b->latitude !== null ? (float) $b->latitude : null,
                    'longitude' => $b->longitude !== null ? (float) $b->longitude : null,
                ],
            ])
            ->values()
            ->all();
    }

    /**
     * @param  list<mixed>  $categories
     * @param  list<array<string, mixed>>  $documents
     * @param  list<array<string, mixed>>  $requests
     * @param  list<array<string, mixed>>  $menuItems
     * @param  list<array<string, mixed>>  $branches
     * @return array<string, mixed>
     */
    private function formatApplicationPayload(
        object $row,
        array $categories,
        array $documents,
        array $requests,
        array $menuItems,
        array $branches = [],
    ): array {
        return [
            'restaurant_application_id' => (int) $row->restaurant_application_id,
            'restaurant_id' => (int) $row->restaurant_id,
            'reference_number' => $row->reference_number,
            'application_status' => $row->application_status,
            'restaurant_status' => $row->restaurant_status,
            'restaurant_name' => $row->restaurant_name,
            'has_branches' => $row->main_branch_name !== null || count($branches) > 0,
            'main_branch_name' => $row->main_branch_name,
            'branches' => $branches,
            'registered_name' => $row->registered_name,
            'business_type' => $row->business_type,
            'ownership_structure' => $row->ownership_structure,
            'description' => $row->description,
            'business_phone' => $row->business_phone,
            'business_email' => $row->business_email,
            'logo_image' => $this->fileStorageService->publicUrl($row->logo_image),
            'cover_image' => $this->fileStorageService->publicUrl($row->cover_image),
            'categories' => $categories,
            'applicant_position' => $row->applicant_position,
            'legal_first_name' => $row->legal_first_name,
            'legal_middle_name' => $row->legal_middle_name,
            'legal_last_name' => $row->legal_last_name,
            'legal_suffix' => $row->legal_suffix,
            'date_of_birth' => $row->date_of_birth,
            'contact_phone' => $row->contact_phone,
            'contact_email' => $row->contact_email,
            'contact_email_verified_at' => $row->contact_email_verified_at,
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
            'offers_delivery' => (bool) $row->offers_delivery,
            'offers_pickup' => (bool) $row->offers_pickup,
            'offers_dine_in' => (bool) $row->offers_dine_in,
            'accepts_reservations' => (bool) $row->accepts_reservations,
            'delivery_radius' => $row->delivery_radius !== null ? (float) $row->delivery_radius : null,
            'reviewer_note' => $row->reviewer_note,
            'submitted_at' => $row->submitted_at,
            'reviewed_at' => $row->reviewed_at,
            'decided_at' => $row->decided_at,
            'documents' => $documents,
            'document_requests' => $requests,
            'menu_items' => $menuItems,
        ];
    }

    private function generateReferenceNumber(): string
    {
        $datePart = now()->format('Ymd');
        do {
            $ref = 'SALO-APP-'.$datePart.'-'.random_int(1000, 9999);
            $exists = DB::table('restaurant_applications')->where('reference_number', $ref)->exists();
        } while ($exists);

        return $ref;
    }
}
